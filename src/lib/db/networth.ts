import { supabase } from '@/lib/supabase'
import { Asset } from '@/investments/types'
import { fetchAccounts, AccountRow } from '@/lib/db/accounts'

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
 * Pure helper: given a list of history rows, returns the most recent
 * balance + month per account up to (and including) upToMonth, plus the
 * global max month across all rows.
 * upToMonth: YYYY-MM-01 — when provided, entries after this month are ignored
 * for the per-account latest, but still count towards maxMonth.
 */
export function computeLatestAccountBalances(
  rows: AccountHistoryRow[],
  upToMonth?: string,
): { entries: Map<string, AccountLatestEntry>; maxMonth: string } {
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

/**
 * Returns the most recent balance + month per account up to (and including)
 * upToMonth, plus the global max month across all accounts.
 */
export async function fetchLatestAccountBalances(
  userId: string,
  upToMonth?: string,
): Promise<{ entries: Map<string, AccountLatestEntry>; maxMonth: string }> {
  const rows = await fetchAccountBalanceHistory(userId)
  return computeLatestAccountBalances(rows, upToMonth)
}

/**
 * An account is considered active if it has no history yet (newly created /
 * never tracked), or its last recorded balance is positive and recent
 * (within 12 months of `viewMonth`).
 */
export function isAccountActive(entry: AccountLatestEntry | undefined, viewMonth: string): boolean {
  if (!entry) return true                 // no history = newly created or never tracked → always show
  if (entry.balance <= 0) return false    // explicitly zeroed
  if (!viewMonth) return true
  const [vy, vm] = viewMonth.split('-').map(Number)
  const [ey, em] = entry.month.split('-').map(Number)
  const monthsAgo = (vy - ey) * 12 + (vm - em)
  return monthsAgo <= 12
}

export interface EnrichedAccount extends AccountRow {
  /** Latest balance recorded in account_balance_history (up to `month`), falling back to the account's static `balance` field. */
  latestBalance: number
  /** Month of the latest recorded balance, if any. */
  latestMonth?: string
}

/**
 * Single source of truth for "what's the current balance of this account".
 * Combines an account's static `balance` field with the latest manually
 * entered `account_balance_history` snapshot (up to `month`), and filters
 * out inactive/closed accounts (see `isAccountActive`). Sorted by balance
 * descending. Used by Contas & Cartões, Dashboard and Patrimônio so the
 * "patrimônio" figures match everywhere.
 */
export function enrichAccounts(
  accounts: AccountRow[],
  entries: Map<string, AccountLatestEntry>,
  month: string,
): EnrichedAccount[] {
  return accounts
    .map((acc) => ({
      ...acc,
      latestBalance: entries.get(acc.id)?.balance ?? acc.balance,
      latestMonth:   entries.get(acc.id)?.month,
    }))
    .filter((acc) => isAccountActive(entries.get(acc.id), month))
    .sort((a, b) => b.latestBalance - a.latestBalance)
}

/** Fetches accounts + their latest recorded balances and combines them via `enrichAccounts`. */
export async function fetchEnrichedAccounts(userId: string, month: string): Promise<EnrichedAccount[]> {
  const [accounts, { entries }] = await Promise.all([
    fetchAccounts(userId),
    fetchLatestAccountBalances(userId, month),
  ])
  return enrichAccounts(accounts, entries, month)
}

/** Insert or update the balance snapshot for an account in a given month. */
export async function upsertAccountBalance(accountId: string, month: string, balance: number): Promise<void> {
  const { data: existing, error: selErr } = await supabase
    .from('account_balance_history')
    .select('id')
    .eq('account_id', accountId)
    .eq('month', month)
    .maybeSingle()
  if (selErr) throw selErr

  if (existing) {
    const { error } = await supabase
      .from('account_balance_history')
      .update({ balance })
      .eq('id', (existing as { id: string }).id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('account_balance_history')
      .insert({ account_id: accountId, month, balance })
    if (error) throw error
  }
}

function toAsset(r: Record<string, unknown>): Asset {
  return {
    id:                r.id as string,
    user_id:           r.user_id as string,
    name:              r.name as string,
    type:              r.type as Asset['type'],
    current_value:     Number(r.current_value),
    is_active:         Boolean(r.is_active),
    linked_account_id: r.linked_account_id as string | null,
    is_shared:         Boolean(r.is_shared),
    created_at:        r.created_at as string,
    updated_at:        r.updated_at as string,
  }
}

/**
 * Fetches a user's active assets, plus any shared assets owned by other
 * users (so couple-shared assets show up on both Patrimônio pages).
 */
export async function fetchAssets(userId: string): Promise<Asset[]> {
  let query = supabase
    .from('assets')
    .select('*')
    .eq('is_active', true)

  // `is_shared` é um conceito de casal (mostra o ativo p/ leo e murilo). A
  // fazenda é um ledger à parte: vê só os próprios ativos, nunca os do casal.
  query = userId === 'fazenda'
    ? query.eq('user_id', 'fazenda')
    : query.or(`user_id.eq.${userId},is_shared.eq.true`)

  const { data, error } = await query.order('name')

  if (error) throw error
  return (data ?? []).map(toAsset)
}

export interface NewAssetInput {
  name: string
  type: Asset['type']
  current_value: number
  linked_account_id?: string | null
  is_shared: boolean
}

/** Creates a new asset (e.g. a shared investment) owned by `userId`. */
export async function createAsset(userId: string, input: NewAssetInput): Promise<void> {
  const { error } = await supabase
    .from('assets')
    .insert({
      id:                crypto.randomUUID(),
      user_id:           userId,
      name:              input.name,
      type:              input.type,
      current_value:     input.current_value,
      linked_account_id: input.linked_account_id ?? null,
      is_shared:         input.is_shared,
    })
  if (error) throw error
}

/** Updates the current value of an existing asset. */
export async function updateAssetValue(assetId: string, currentValue: number): Promise<void> {
  const { error } = await supabase
    .from('assets')
    .update({ current_value: currentValue })
    .eq('id', assetId)
  if (error) throw error
}
