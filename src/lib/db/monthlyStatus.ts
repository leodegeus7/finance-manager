import { supabase } from '@/lib/supabase'

export interface MonthlyStatus {
  month: string       // YYYY-MM-01
  hasCard: boolean
  hasAccount: boolean
  hasBalance: boolean
}

/**
 * For each month in `months`, checks whether the user has already:
 * - Cartão:  imported a credit card statement that closes that month
 * - Conta:   imported bank account transactions for that month
 * - Balanço: recorded an investment/account balance snapshot for that month
 */
export async function fetchMonthlyStatus(userId: string, months: string[]): Promise<MonthlyStatus[]> {
  // First resolve account IDs that belong to this user (needed for the balance query)
  const { data: accs, error: accErr } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', userId)
  if (accErr) throw accErr
  const accountIds = (accs ?? []).map((a: any) => a.id as string)

  const [cardRes, accountRes, balanceRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('statement_month')
      .eq('user_id', userId)
      .not('credit_card_id', 'is', null)
      .not('statement_month', 'is', null)
      .in('statement_month', months),
    supabase
      .from('transactions')
      .select('competency_month')
      .eq('user_id', userId)
      .not('account_id', 'is', null)
      .is('statement_month', null)
      .neq('source', 'manual')
      .in('competency_month', months),
    accountIds.length === 0
      ? Promise.resolve({ data: [] as { month: string }[], error: null })
      : supabase
          .from('account_balance_history')
          .select('month')
          .in('account_id', accountIds)
          .in('month', months),
  ])

  if (cardRes.error) throw cardRes.error
  if (accountRes.error) throw accountRes.error
  if (balanceRes.error) throw balanceRes.error

  const cardMonths    = new Set((cardRes.data ?? []).map((r: any) => r.statement_month as string))
  const accountMonths = new Set((accountRes.data ?? []).map((r: any) => r.competency_month as string))
  const balanceMonths = new Set((balanceRes.data ?? []).map((r: any) => r.month as string))

  return months.map((month) => ({
    month,
    hasCard:    cardMonths.has(month),
    hasAccount: accountMonths.has(month),
    hasBalance: balanceMonths.has(month),
  }))
}
