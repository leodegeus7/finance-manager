import { useState, useEffect, useMemo } from 'react'
import { NetWorthSnapshot, Asset } from '@/investments/types'
import { fetchAccountBalanceHistory, fetchAssets, AccountHistoryRow } from '@/lib/db/networth'
import { fetchAccounts, AccountRow } from '@/lib/db/accounts'
import { buildNetWorthTimeline } from '@/investments/NetWorthEngine'

export interface AccountWithBalance extends AccountRow {
  // Balance from account_balance_history for the selected month
  // Falls back to AccountRow.balance if no history record exists
  historical_balance: number | undefined
}

function computeTimelineFromHistory(history: AccountHistoryRow[]): NetWorthSnapshot[] {
  // Aggregate per month: sum all account balances
  const byMonth = new Map<string, number>()
  for (const r of history) {
    byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + r.balance)
  }

  const raw = Array.from(byMonth.entries()).map(([month, accounts_total]) => ({
    month,
    accounts_total,
    assets_total: 0,
    net_worth: accounts_total,
  }))

  return buildNetWorthTimeline(raw)
}

export function useNetWorth(userId: string, selectedMonth: string) {
  const [history, setHistory]   = useState<AccountHistoryRow[]>([])
  const [assets, setAssets]     = useState<Asset[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetchAccountBalanceHistory(userId),
      fetchAssets(userId),
      fetchAccounts(userId),
    ])
      .then(([hist, a, acc]) => {
        setHistory(hist)
        setAssets(a)
        setAccounts(acc)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [userId])

  // Build timeline from history
  const timeline = useMemo(() => computeTimelineFromHistory(history), [history])

  // Per-account balances for the selected month (from history)
  const selectedMonthBalances = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of history) {
      if (r.month === selectedMonth) map.set(r.account_id, r.balance)
    }
    return map
  }, [history, selectedMonth])

  // Accounts enriched with their historical balance for the selected month
  const accountsWithBalance = useMemo<AccountWithBalance[]>(
    () =>
      accounts.map((acc) => ({
        ...acc,
        historical_balance: selectedMonthBalances.get(acc.id),
      })),
    [accounts, selectedMonthBalances],
  )

  return { timeline, assets, accounts, accountsWithBalance, loading, error }
}
