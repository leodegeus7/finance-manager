import { useState, useEffect } from 'react'
import { Transaction } from '@/engine/types'
import { fetchTransactionsSince } from '@/lib/db/transactions'

export function useTransactionsSince(startMonth: string, userId: string) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchTransactionsSince(startMonth, userId)
      .then(setTransactions)
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false))
  }, [startMonth, userId])

  return { transactions, loading }
}
