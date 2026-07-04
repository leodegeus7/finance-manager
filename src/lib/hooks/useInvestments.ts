import { useState, useEffect, useMemo, useCallback } from 'react'
import { fetchAccounts, AccountRow } from '@/lib/db/accounts'
import { fetchAccountBalanceHistory, AccountHistoryRow } from '@/lib/db/networth'
import { fetchYearPerformance, YearPerformanceRow } from '@/lib/db/investments'
import {
  buildValueSeries, computeYearlyTable, consolidateYearly, summarizeInvestments,
  CustodianSeries, MonthValue, YearRow, InvestmentSummary,
} from '@/investments/PerformanceEngine'
import { monthRange } from '@/lib/format'

export interface InvestmentsData {
  byCustodian: CustodianSeries[]
  total: MonthValue[]
  yearly: YearRow[]
  yearlyTotals: YearRow[]
  summary: InvestmentSummary
  hasInvestmentAccounts: boolean
  loading: boolean
  error: string | null
  reload: () => void
}

/** Fallback start when there's no history yet (keeps the range bounded). */
const DEFAULT_START = '2019-01-01'

export function useInvestments(userId: string, month: string): InvestmentsData {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [history, setHistory]   = useState<AccountHistoryRow[]>([])
  const [seed, setSeed]         = useState<YearPerformanceRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetchAccounts(userId),
      fetchAccountBalanceHistory(userId),
      fetchYearPerformance(userId),
    ])
      .then(([acc, hist, s]) => { setAccounts(acc); setHistory(hist); setSeed(s) })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [userId])

  useEffect(() => { load() }, [load])

  const data = useMemo(() => {
    const invIds = new Set(accounts.filter((a) => a.is_investment).map((a) => a.id))
    const invHistory = history.filter((r) => invIds.has(r.account_id))

    const start = invHistory.reduce(
      (min, r) => (r.month < min ? r.month : min),
      invHistory.length > 0 ? invHistory[0].month : DEFAULT_START,
    )
    const months = monthRange(start > month ? month : start, month)

    const { byCustodian, total } = buildValueSeries(invHistory, accounts, months)
    const yearly = computeYearlyTable(seed, byCustodian)
    const yearlyTotals = consolidateYearly(yearly)
    const summary = summarizeInvestments(yearlyTotals, total, month)

    return { byCustodian, total, yearly, yearlyTotals, summary, hasInvestmentAccounts: invIds.size > 0 }
  }, [accounts, history, seed, month])

  return { ...data, loading, error, reload: load }
}
