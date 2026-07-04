// ============================================================
// INVESTMENT PERFORMANCE ENGINE
//
// Answers "estou ganhando ou perdendo, quanto?" for investment custodians
// (XP, Binance, Bitso, ...), mês a mês e ano a ano.
//
// Two data sources, kept separate on purpose:
//   1. VALUE over time  → account_balance_history of accounts flagged
//      is_investment (already entered monthly by the user). Reliable recent.
//   2. YEARLY performance → authoritative seed (investment_year_performance),
//      e.g. from the XP "Evolução patrimonial" PDF, because reconstructing
//      historical gain from manually-entered balances is unreliable.
//
// Pure functions — never mutate inputs. All money rounded to cents.
// ============================================================

import { AccountRow } from '@/lib/db/accounts'
import { AccountHistoryRow } from '@/lib/db/networth'
import { YearPerformanceRow } from '@/lib/db/investments'

export interface MonthValue { month: string; value: number }
export interface CustodianSeries { custodian: string; points: MonthValue[] }

export interface YearRow {
  custodian: string
  year: number
  patrimonio_inicial: number
  patrimonio_final: number
  movimentacoes: number
  rendimento: number
  rentabilidade_pct: number | null
  estimated: boolean   // true = computed from value deltas (aportes desconhecidos)
}

export interface InvestmentSummary {
  invested_value: number        // valor investido mais recente (total)
  month_change: number          // variação vs. mês anterior (inclui aportes)
  year_rendimento: number       // rendimento do ano corrente (seed onde houver)
  year_return_pct: number | null
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/** The label used to group investment accounts into a broker/custodian. */
export function custodianOf(acc: AccountRow): string {
  return acc.custodian?.trim() || acc.name
}

/** Investment accounts only (is_investment), grouped by custodian. */
export function groupInvestmentAccounts(accounts: AccountRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const acc of accounts) {
    if (!acc.is_investment) continue
    const c = custodianOf(acc)
    if (!map.has(c)) map.set(c, [])
    map.get(c)!.push(acc.id)
  }
  return map
}

/**
 * Forward-fills an account's balance across `months`: the value at month m is
 * the latest recorded balance with month <= m (0 before the first record).
 * `rows` must be for a single account, sorted ascending by month.
 */
function forwardFill(rows: AccountHistoryRow[], months: string[]): number[] {
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month))
  const out: number[] = []
  let i = 0
  let last = 0
  for (const m of months) {
    while (i < sorted.length && sorted[i].month <= m) { last = sorted[i].balance; i++ }
    out.push(last)
  }
  return out
}

/**
 * Builds a monthly, forward-filled invested-value series per custodian plus a
 * consolidated total, over the given months.
 */
export function buildValueSeries(
  history: AccountHistoryRow[],
  accounts: AccountRow[],
  months: string[],
): { byCustodian: CustodianSeries[]; total: MonthValue[] } {
  const groups = groupInvestmentAccounts(accounts)
  const byAccount = new Map<string, AccountHistoryRow[]>()
  for (const r of history) {
    if (!byAccount.has(r.account_id)) byAccount.set(r.account_id, [])
    byAccount.get(r.account_id)!.push(r)
  }

  const byCustodian: CustodianSeries[] = []
  const totals = months.map(() => 0)

  for (const [custodian, accountIds] of groups) {
    const sums = months.map(() => 0)
    for (const id of accountIds) {
      const filled = forwardFill(byAccount.get(id) ?? [], months)
      for (let k = 0; k < months.length; k++) sums[k] += filled[k]
    }
    byCustodian.push({
      custodian,
      points: months.map((m, k) => ({ month: m, value: round(sums[k]) })),
    })
    for (let k = 0; k < months.length; k++) totals[k] += sums[k]
  }

  byCustodian.sort((a, b) => {
    const av = a.points[a.points.length - 1]?.value ?? 0
    const bv = b.points[b.points.length - 1]?.value ?? 0
    return bv - av
  })

  return {
    byCustodian,
    total: months.map((m, k) => ({ month: m, value: round(totals[k]) })),
  }
}

/**
 * Computes an estimated year-by-year table for a custodian from its monthly
 * value series (aportes unknown → rendimento = variação de valor). Used as a
 * fallback for custodians without an authoritative seed (ex.: Binance/Bitso).
 */
function computeYearlyFromValue(series: CustodianSeries): YearRow[] {
  // year → { first, last } value in that year
  const yearVals = new Map<number, { first: number; last: number }>()
  for (const p of series.points) {
    const y = Number(p.month.slice(0, 4))
    const cur = yearVals.get(y)
    if (!cur) yearVals.set(y, { first: p.value, last: p.value })
    else cur.last = p.value
  }
  const years = [...yearVals.keys()].sort((a, b) => a - b)
  const rows: YearRow[] = []
  let prevFinal: number | null = null
  for (const y of years) {
    const { first, last } = yearVals.get(y)!
    const inicial = prevFinal ?? first
    const final = last
    const rendimento = round(final - inicial)
    rows.push({
      custodian: series.custodian,
      year: y,
      patrimonio_inicial: round(inicial),
      patrimonio_final: round(final),
      movimentacoes: 0,
      rendimento,
      rentabilidade_pct: inicial > 0 ? round((rendimento / inicial) * 100) : null,
      estimated: true,
    })
    prevFinal = final
  }
  return rows
}

/**
 * Builds the full year-by-year table: authoritative seed rows where available
 * (per custodian), estimated-from-value rows for the rest. A custodian with any
 * seed row uses ONLY the seed (never mixes seed + estimate for the same broker).
 */
export function computeYearlyTable(
  seed: YearPerformanceRow[],
  valueSeries: CustodianSeries[],
): YearRow[] {
  const seededCustodians = new Set(seed.map((r) => r.custodian))

  const seedRows: YearRow[] = seed.map((r) => ({
    custodian: r.custodian,
    year: r.year,
    patrimonio_inicial: r.patrimonio_inicial,
    patrimonio_final: r.patrimonio_final,
    movimentacoes: r.movimentacoes,
    rendimento: r.rendimento,
    rentabilidade_pct: r.rentabilidade_pct,
    estimated: false,
  }))

  const computed: YearRow[] = []
  for (const series of valueSeries) {
    if (seededCustodians.has(series.custodian)) continue
    computed.push(...computeYearlyFromValue(series))
  }

  return [...seedRows, ...computed].sort(
    (a, b) => a.year - b.year || a.custodian.localeCompare(b.custodian),
  )
}

/** Aggregates the yearly table across custodians into consolidated year totals. */
export function consolidateYearly(rows: YearRow[]): YearRow[] {
  const byYear = new Map<number, YearRow>()
  for (const r of rows) {
    const cur = byYear.get(r.year)
    if (!cur) {
      byYear.set(r.year, { ...r, custodian: 'Total' })
    } else {
      cur.patrimonio_inicial = round(cur.patrimonio_inicial + r.patrimonio_inicial)
      cur.patrimonio_final = round(cur.patrimonio_final + r.patrimonio_final)
      cur.movimentacoes = round(cur.movimentacoes + r.movimentacoes)
      cur.rendimento = round(cur.rendimento + r.rendimento)
      cur.estimated = cur.estimated || r.estimated
    }
  }
  const out = [...byYear.values()]
  for (const r of out) {
    r.rentabilidade_pct =
      r.patrimonio_inicial > 0 ? round((r.rendimento / r.patrimonio_inicial) * 100) : null
  }
  return out.sort((a, b) => a.year - b.year)
}

/**
 * Summary for the Dashboard card: latest invested value, month-over-month value
 * change (inclui aportes), and the current year's rendimento (from seed where
 * available, estimated otherwise).
 */
export function summarizeInvestments(
  yearlyTotals: YearRow[],
  total: MonthValue[],
  month: string,
): InvestmentSummary {
  const idx = total.findIndex((p) => p.month === month)
  const at = idx >= 0 ? idx : total.length - 1
  const invested = total[at]?.value ?? 0
  const prev = at > 0 ? total[at - 1]?.value ?? 0 : invested
  const year = Number(month.slice(0, 4))
  const yr = yearlyTotals.find((r) => r.year === year)

  return {
    invested_value: round(invested),
    month_change: round(invested - prev),
    year_rendimento: yr ? round(yr.rendimento) : 0,
    year_return_pct: yr?.rentabilidade_pct ?? null,
  }
}
