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

/** % base para rentabilidade: capital inicial + aportes do período (aprox.). */
function returnBase(inicial: number, movimentacoes: number): number {
  return Math.max(inicial, 0) + Math.max(movimentacoes, 0)
}

/**
 * Computes a year-by-year table for a custodian from its monthly value series.
 * When `flows` (net aportes/resgates BRL por mês) é fornecido, o rendimento é
 * REAL (`final - inicial - movimentações`); sem flows, é uma estimativa pela
 * variação de valor (aportes desconhecidos → `estimated: true`).
 */
function computeYearlyFromValue(
  series: CustodianSeries,
  flows?: Map<string, number>,
): YearRow[] {
  const yearVals = new Map<number, { first: number; last: number }>()
  for (const p of series.points) {
    const y = Number(p.month.slice(0, 4))
    const cur = yearVals.get(y)
    if (!cur) yearVals.set(y, { first: p.value, last: p.value })
    else cur.last = p.value
  }

  // Soma dos aportes por ano + janela de cobertura (anos fora dela ficam
  // como estimativa, pois não temos os aportes desses períodos).
  const flowByYear = new Map<number, number>()
  if (flows) {
    for (const [m, v] of flows) {
      const y = Number(m.slice(0, 4))
      flowByYear.set(y, (flowByYear.get(y) ?? 0) + v)
    }
  }
  const flowYears = [...flowByYear.keys()]
  const covStart = flowYears.length ? Math.min(...flowYears) : Infinity
  const covEnd   = flowYears.length ? Math.max(...flowYears) : -Infinity

  const years = [...yearVals.keys()].sort((a, b) => a - b)
  const rows: YearRow[] = []
  let prevFinal: number | null = null
  for (const y of years) {
    const { first, last } = yearVals.get(y)!
    const inicial = prevFinal ?? first
    const final = last
    const covered = !!flows && y >= covStart && y <= covEnd
    const movimentacoes = covered ? round(flowByYear.get(y) ?? 0) : 0
    const rendimento = round(final - inicial - movimentacoes)
    const base = returnBase(inicial, movimentacoes)
    rows.push({
      custodian: series.custodian,
      year: y,
      patrimonio_inicial: round(inicial),
      patrimonio_final: round(final),
      movimentacoes,
      rendimento,
      rentabilidade_pct: base > 0 ? round((rendimento / base) * 100) : null,
      estimated: !covered,
    })
    prevFinal = final
  }
  return rows
}

/**
 * Builds the full year-by-year table: authoritative seed rows where available
 * (XP), rendimento REAL para corretoras com aportes importados (`flowsByCustodian`),
 * e estimativa pela variação de valor para o resto. Uma corretora com seed usa
 * SÓ o seed (nunca mistura seed + cálculo para o mesmo broker).
 */
export function computeYearlyTable(
  seed: YearPerformanceRow[],
  valueSeries: CustodianSeries[],
  flowsByCustodian?: Map<string, Map<string, number>>,
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
    computed.push(...computeYearlyFromValue(series, flowsByCustodian?.get(series.custodian)))
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
    const base = returnBase(r.patrimonio_inicial, r.movimentacoes)
    r.rentabilidade_pct = base > 0 ? round((r.rendimento / base) * 100) : null
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
