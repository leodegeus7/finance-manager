import { supabase } from '@/lib/supabase'
import { Asset } from '@/investments/types'

export interface AccountHistoryRow {
  account_id: string
  month: string   // YYYY-MM-01
  balance: number
}

export async function fetchAccountBalanceHistory(userId: string): Promise<AccountHistoryRow[]> {
  // First resolve account IDs that belong to this user
  const { data: accs, error: accErr } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', userId)
  if (accErr) throw accErr

  const ids = (accs ?? []).map((a: any) => a.id as string)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('account_balance_history')
    .select('account_id, month, balance')
    .in('account_id', ids)
    .order('month', { ascending: true })

  if (error) throw error
  return (data ?? []).map((r: any) => ({
    account_id: r.account_id as string,
    month:      r.month as string,
    balance:    Number(r.balance),
  }))
}

export interface AccountLatestEntry {
  balance: number
  month: string   // last month this account had a record
}

/**
 * Returns the most recent balance + month per account up to (and including)
 * upToMonth, plus the global max month across all accounts.
 * upToMonth: YYYY-MM-01 — when provided, entries after this month are ignored
 * for the per-account latest, but still count towards globalMaxMonth.
 */
export async function fetchLatestAccountBalances(
  userId: string,
  upToMonth?: string,
): Promise<{ entries: Map<string, AccountLatestEntry>; maxMonth: string }> {
  const rows = await fetchAccountBalanceHistory(userId)
  const entries = new Map<string, AccountLatestEntry>()
  let maxMonth = ''

  for (const r of rows) {
    if (r.month > maxMonth) maxMonth = r.month
    if (upToMonth && r.month > upToMonth) continue  // ignore future entries for this month's view
    const existing = entries.get(r.account_id)
    if (!existing || r.month > existing.month) {
      entries.set(r.account_id, { balance: r.balance, month: r.month })
    }
  }

  return { entries, maxMonth }
}

export async function fetchAssets(userId: string): Promise<Asset[]> {
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return (data ?? []).map((r) => ({
    id:            r.id as string,
    user_id:       r.user_id as string,
    name:          r.name as string,
    type:          r.type as Asset['type'],
    current_value: Number(r.current_value),
    is_active:     Boolean(r.is_active),
    created_at:    r.created_at as string,
    updated_at:    r.updated_at as string,
  }))
}
