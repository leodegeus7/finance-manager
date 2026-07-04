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
