import { useState, useEffect, useMemo, useCallback } from 'react'
import { fetchAccounts, AccountRow } from '@/lib/db/accounts'
import { fetchAccountBalanceHistory, AccountHistoryRow } from '@/lib/db/networth'
import { fetchYearPerformance, fetchInvestmentFlows, fetchHoldings, YearPerformanceRow, InvestmentFlowRow, HoldingRow } from '@/lib/db/investments'
import {
  buildValueSeries, computeYearlyTable, consolidateYearly, summarizeInvestments, custodianOf,
  CustodianSeries, MonthValue, YearRow, InvestmentSummary,
} from '@/investments/PerformanceEngine'
import { monthRange } from '@/lib/format'

export interface InvestmentsData {
  byCustodian: CustodianSeries[]
  total: MonthValue[]
  yearly: YearRow[]
  yearlyTotals: YearRow[]
  summary: InvestmentSummary
  holdings: HoldingRow[]
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
  const [flows, setFlows]       = useState<InvestmentFlowRow[]>([])
  const [holdings, setHoldings] = useState<HoldingRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetchAccounts(userId),
      fetchAccountBalanceHistory(userId),
      fetchYearPerformance(userId),
      fetchInvestmentFlows(userId),
      fetchHoldings(userId),
    ])
      .then(([acc, hist, s, f, h]) => { setAccounts(acc); setHistory(hist); setSeed(s); setFlows(f); setHoldings(h) })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [userId])

  useEffect(() => { load() }, [load])

  const data = useMemo(() => {
    const invAccounts = accounts.filter((a) => a.is_investment)
    const invIds = new Set(invAccounts.map((a) => a.id))
    const invHistory = history.filter((r) => invIds.has(r.account_id))

    const start = invHistory.reduce(
      (min, r) => (r.month < min ? r.month : min),
      invHistory.length > 0 ? invHistory[0].month : DEFAULT_START,
    )
    const months = monthRange(start > month ? month : start, month)

    // Aportes por corretora e mês (account → custodian).
    const custodianByAccount = new Map(invAccounts.map((a) => [a.id, custodianOf(a)]))
    const flowsByCustodian = new Map<string, Map<string, number>>()
    for (const f of flows) {
      const c = custodianByAccount.get(f.account_id)
      if (!c) continue
      if (!flowsByCustodian.has(c)) flowsByCustodian.set(c, new Map())
      const m = flowsByCustodian.get(c)!
      m.set(f.month, (m.get(f.month) ?? 0) + f.net_deposit)
    }

    const { byCustodian, total } = buildValueSeries(invHistory, accounts, months)
    const yearly = computeYearlyTable(seed, byCustodian, flowsByCustodian)
    const yearlyTotals = consolidateYearly(yearly)
    const summary = summarizeInvestments(yearlyTotals, total, month)

    return { byCustodian, total, yearly, yearlyTotals, summary, holdings, hasInvestmentAccounts: invIds.size > 0 }
  }, [accounts, history, seed, flows, holdings, month])

  return { ...data, loading, error, reload: load }
}
