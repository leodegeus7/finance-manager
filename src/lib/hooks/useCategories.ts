import { useState, useEffect } from 'react'
import { fetchCategories, CategoryRow } from '@/lib/db/categories'
import { useUser } from '@/lib/UserContext'

export function useCategories() {
  const { userId } = useUser()
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    fetchCategories(userId)
      .then(setCategories)
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [userId])

  return { categories, loading }
}
