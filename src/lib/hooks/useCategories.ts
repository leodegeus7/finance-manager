import { useState, useEffect } from 'react'
import { fetchCategories, CategoryRow } from '@/lib/db/categories'

export function useCategories() {
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  return { categories, loading }
}
