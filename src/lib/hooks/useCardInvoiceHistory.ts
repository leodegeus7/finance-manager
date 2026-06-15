import { useState, useEffect, useMemo } from 'react'
import { Transaction } from '@/engine/types'
import { fetchCardTransactionsSince } from '@/lib/db/transactions'
import { computeCardInvoiceSeries, CardInvoiceMonth } from '@/engine/CardInvoiceEngine'
import { monthRange } from '@/lib/format'

/**
 * Loads a card's invoice history (and installment breakdown) from
 * `startMonth` up to `currentMonth`, plus a projection of future months
 * based on installments already in progress.
 */
export function useCardInvoiceHistory(cardId: string, startMonth: string, currentMonth: string) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchCardTransactionsSince(cardId, startMonth)
      .then(setTransactions)
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false))
  }, [cardId, startMonth])

  const series: CardInvoiceMonth[] = useMemo(() => {
    const months = monthRange(startMonth, currentMonth)
    return computeCardInvoiceSeries(transactions, months)
  }, [transactions, startMonth, currentMonth])

  return { series, loading }
}
