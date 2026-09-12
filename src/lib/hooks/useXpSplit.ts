import { useState, useEffect } from 'react'
import { fetchXpSplitHistory, XpSplitRow } from '@/lib/db/xpSplit'

export function useXpSplit(userId: string) {
  const [history, setHistory] = useState<XpSplitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    fetchXpSplitHistory(userId)
      .then(setHistory)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [userId])

  return { history, loading, error, refetch: load }
}
