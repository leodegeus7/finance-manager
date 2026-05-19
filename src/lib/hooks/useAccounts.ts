import { useState, useEffect, useCallback } from 'react'
import { fetchAccounts, fetchCards, AccountRow, CardRow } from '@/lib/db/accounts'

export function useAccounts(userId: string, month: string) {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [cards, setCards]       = useState<CardRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([fetchAccounts(userId), fetchCards(userId, month)])
      .then(([a, c]) => { setAccounts(a); setCards(c) })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [userId, month])

  useEffect(() => { load() }, [load])

  return { accounts, cards, loading, error, refetch: load }
}
