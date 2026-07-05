import { supabase } from '@/lib/supabase'
import { fetchAccountBalanceHistory, computeLatestAccountBalances, isAccountActive } from './networth'

export interface MonthlyStatus {
  month: string       // YYYY-MM-01
  hasCard: boolean
  hasAccount: boolean
  // true only when EVERY active account has a balance entry for this exact
  // month (not just "some account, some month") — see missingBalanceAccounts.
  hasBalance: boolean
  /** Active accounts still missing a balance entry for this exact month. */
  missingBalanceAccounts: { id: string; name: string }[]
}

/**
 * For each month in `months`, checks whether the user has already:
 * - Cartão:  imported a credit card statement that closes that month
 * - Conta:   imported bank account transactions for that month
 * - Balanço: recorded a balance for EVERY active account (regular or
 *   investment — both live in account_balance_history) for that exact month.
 *   "Active" mirrors Contas & Cartões (isAccountActive): an account with no
 *   history yet, or whose last recorded balance is positive and recent.
 */
export async function fetchMonthlyStatus(userId: string, months: string[]): Promise<MonthlyStatus[]> {
  const { data: accs, error: accErr } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('user_id', userId)
    .order('name')
  if (accErr) throw accErr
  const accounts = (accs ?? []) as { id: string; name: string }[]

  const [cardRes, accountRes, history] = await Promise.all([
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
    fetchAccountBalanceHistory(userId),
  ])

  if (cardRes.error) throw cardRes.error
  if (accountRes.error) throw accountRes.error

  const cardMonths    = new Set((cardRes.data ?? []).map((r: any) => r.statement_month as string))
  const accountMonths = new Set((accountRes.data ?? []).map((r: any) => r.competency_month as string))

  return months.map((month) => {
    const { entries } = computeLatestAccountBalances(history, month)
    const missing = accounts.filter((a) => {
      const entry = entries.get(a.id)
      if (!isAccountActive(entry, month)) return false
      // "Active" allows carrying forward a past balance — but the Balanço
      // checklist wants an entry recorded FOR this specific month.
      return entry?.month !== month
    })

    return {
      month,
      hasCard:    cardMonths.has(month),
      hasAccount: accountMonths.has(month),
      hasBalance: missing.length === 0,
      missingBalanceAccounts: missing.map((a) => ({ id: a.id, name: a.name })),
    }
  })
}
