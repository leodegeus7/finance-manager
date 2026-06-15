import { useState, useEffect, useMemo } from 'react'
import { NetWorthSnapshot, Asset } from '@/investments/types'
import {
  fetchAccountBalanceHistory, fetchAssets, AccountHistoryRow,
  computeLatestAccountBalances, enrichAccounts, EnrichedAccount,
  isAccountActive,
} from '@/lib/db/networth'
import { fetchAccounts, AccountRow } from '@/lib/db/accounts'
import { buildNetWorthTimeline } from '@/investments/NetWorthEngine'

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Builds a monthly net worth timeline using the SAME "active accounts,
 * latest balance up to that month" rule as Contas & Cartões
 * (`enrichAccounts`/`isAccountActive`), plus the current total of active
 * assets/investments. This is what makes the "Patrimônio total" figure on
 * the Dashboard and Patrimônio page match the "Total" shown in Contas.
 */
function computeTimeline(
  history: AccountHistoryRow[],
  accounts: AccountRow[],
  assetsTotal: number,
  extraMonths: string[],
): NetWorthSnapshot[] {
  const months = new Set(history.map((r) => r.month))
  for (const m of extraMonths) months.add(m)

  const raw = Array.from(months).sort().map((month) => {
    const { entries } = computeLatestAccountBalances(history, month)
    const accountsTotal = accounts
      .filter((acc) => isAccountActive(entries.get(acc.id), month))
      .reduce((s, acc) => s + (entries.get(acc.id)?.balance ?? acc.balance), 0)

    return {
      month,
      accounts_total: round(accountsTotal),
      assets_total:   assetsTotal,
      net_worth:      round(accountsTotal + assetsTotal),
    }
  })

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

  // Total of active assets/investments (no per-month history, so it's a
  // current snapshot applied across the timeline).
  const assetsTotal = useMemo(
    () => round(assets.filter((a) => a.is_active && !a.linked_account_id).reduce((s, a) => s + a.current_value, 0)),
    [assets],
  )

  // Monthly net worth timeline, guaranteed to include `selectedMonth` even
  // if there's no exact account_balance_history row for it.
  const timeline = useMemo(
    () => computeTimeline(history, accounts, assetsTotal, [selectedMonth]),
    [history, accounts, assetsTotal, selectedMonth],
  )

  // Accounts enriched with their latest balance up to the selected month —
  // same data/filter used by Contas & Cartões.
  const enrichedAccounts = useMemo<EnrichedAccount[]>(() => {
    const { entries } = computeLatestAccountBalances(history, selectedMonth)
    return enrichAccounts(accounts, entries, selectedMonth)
  }, [history, accounts, selectedMonth])

  return { timeline, assets, assetsTotal, accounts, enrichedAccounts, loading, error }
}
