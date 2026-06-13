import { useState, useEffect, useCallback } from 'react'
import { fetchMonthlyStatus, MonthlyStatus } from '@/lib/db/monthlyStatus'

export function useMonthlyStatus(userId: string, months: string[]) {
  const [statuses, setStatuses] = useState<MonthlyStatus[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchMonthlyStatus(userId, months)
      .then(setStatuses)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [userId, months])

  useEffect(() => { load() }, [load])

  return { statuses, loading, error, refetch: load }
}
