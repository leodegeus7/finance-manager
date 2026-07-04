import { supabase } from '@/lib/supabase'

// Authoritative year-by-year performance per custodian (seeded from a broker's
// own report, e.g. the XP "Evolução patrimonial" PDF). See supabase/migrations.
export interface YearPerformanceRow {
  custodian: string
  year: number
  patrimonio_inicial: number
  patrimonio_final: number
  movimentacoes: number
  rendimento: number
  rentabilidade_pct: number | null
  source: 'xp_pdf' | 'computed' | 'manual'
}

/**
 * Fetches the seeded/authoritative yearly performance rows for a user.
 * Resilient to the table not existing yet (before the investments migration
 * runs): returns [] instead of throwing so the app keeps working.
 */
export async function fetchYearPerformance(userId: string): Promise<YearPerformanceRow[]> {
  const { data, error } = await supabase
    .from('investment_year_performance')
    .select('custodian, year, patrimonio_inicial, patrimonio_final, movimentacoes, rendimento, rentabilidade_pct, source')
    .eq('user_id', userId)
    .order('year', { ascending: true })

  if (error) {
    // Table missing (migration not run) or transient error → degrade gracefully.
    return []
  }
  return (data ?? []).map((r: any) => ({
    custodian:          r.custodian as string,
    year:               Number(r.year),
    patrimonio_inicial: Number(r.patrimonio_inicial),
    patrimonio_final:   Number(r.patrimonio_final),
    movimentacoes:      Number(r.movimentacoes),
    rendimento:         Number(r.rendimento),
    rentabilidade_pct:  r.rentabilidade_pct == null ? null : Number(r.rentabilidade_pct),
    source:             (r.source as YearPerformanceRow['source']) ?? 'manual',
  }))
}

// Net contribution/withdrawal per investment account per month (BRL).
export interface InvestmentFlowRow {
  account_id: string
  month: string        // YYYY-MM-01
  net_deposit: number  // +aporte / -resgate
}

/**
 * Fetches monthly investment flows for a user's investment accounts. Resilient
 * to the table not existing yet (migration not run) → returns [].
 */
export async function fetchInvestmentFlows(userId: string): Promise<InvestmentFlowRow[]> {
  const { data, error } = await supabase
    .from('investment_flows')
    .select('account_id, month, net_deposit')
    .eq('user_id', userId)

  if (error) return []
  return (data ?? []).map((r: any) => ({
    account_id:  r.account_id as string,
    month:       r.month as string,
    net_deposit: Number(r.net_deposit),
  }))
}

// Composição por ativo de uma corretora (snapshot do PosicaoDetalhada, etc.).
export interface HoldingRow {
  custodian: string
  snapshot_date: string
  asset_class: 'fundo' | 'acao' | 'fii' | 'renda_fixa' | string
  ticker: string | null
  name: string
  quantity: number | null
  avg_price: number | null
  cost_basis: number | null
  market_value: number
  pct_alloc: number | null
  return_pct: number | null
}

/**
 * Fetches the latest holdings snapshot per custodian for a user. Resilient to
 * the table not existing yet (migration not run) → returns [].
 */
export async function fetchHoldings(userId: string): Promise<HoldingRow[]> {
  const { data, error } = await supabase
    .from('investment_holdings')
    .select('custodian, snapshot_date, asset_class, ticker, name, quantity, avg_price, cost_basis, market_value, pct_alloc, return_pct')
    .eq('user_id', userId)
    .order('market_value', { ascending: false })

  if (error) return []
  const rows = (data ?? []).map((r: any) => ({
    custodian:     r.custodian as string,
    snapshot_date: r.snapshot_date as string,
    asset_class:   r.asset_class as HoldingRow['asset_class'],
    ticker:        (r.ticker as string | null) ?? null,
    name:          r.name as string,
    quantity:      r.quantity == null ? null : Number(r.quantity),
    avg_price:     r.avg_price == null ? null : Number(r.avg_price),
    cost_basis:    r.cost_basis == null ? null : Number(r.cost_basis),
    market_value:  Number(r.market_value),
    pct_alloc:     r.pct_alloc == null ? null : Number(r.pct_alloc),
    return_pct:    r.return_pct == null ? null : Number(r.return_pct),
  }))
  // Keep only the most recent snapshot per custodian.
  const latest = new Map<string, string>()
  for (const r of rows) {
    const cur = latest.get(r.custodian)
    if (!cur || r.snapshot_date > cur) latest.set(r.custodian, r.snapshot_date)
  }
  return rows.filter((r) => r.snapshot_date === latest.get(r.custodian))
}
