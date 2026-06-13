import { useState, useEffect, useCallback } from 'react'
import { Transaction, SplitParticipant } from '@/engine/types'
import { fetchTransactionsByMonth, updateTransaction } from '@/lib/db/transactions'

export function useTransactions(month: string, userId: string) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchTransactionsByMonth(month, userId)
      .then(setTransactions)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [month, userId])

  useEffect(() => { load() }, [load])

  const handleUpdate = useCallback(async (id: string, patch: Partial<Transaction> & { notes?: string | null }) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? ({ ...t, ...patch } as Transaction) : t)))

    try {
      await updateTransaction(id, {
        type:          (patch as any).type,
        category_id:   patch.category_id,
        context:       patch.context,
        scope:         patch.scope,
        splits:        patch.splits as SplitParticipant[] | null | undefined,
        to_account_id: (patch as any).to_account_id ?? undefined,
        notes:         patch.notes,
      })
    } catch {
      fetchTransactionsByMonth(month, userId).then(setTransactions).catch(() => null)
    }
  }, [month, userId])

  return { transactions, loading, error, handleUpdate, refetch: load }
}
