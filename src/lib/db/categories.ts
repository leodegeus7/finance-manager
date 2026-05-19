import { supabase } from '@/lib/supabase'

export interface CategoryRow {
  id: string
  name: string
  parent_name?: string
}

/** Income categories use the `inc-` prefix */
export function isIncomeCategory(id: string) { return id.startsWith('inc-') }

/** Filter categories for a given transaction direction */
export function filterCategories(cats: CategoryRow[], direction: 'income' | 'expense') {
  return cats.filter((c) =>
    direction === 'income' ? isIncomeCategory(c.id) : !isIncomeCategory(c.id)
  )
}

export async function fetchCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from('categories')
    .select(`id, name, parent:parent_id ( name )`)
    .order('name')

  if (error) throw error
  return (data ?? []).map((r) => ({
    id:          r.id as string,
    name:        r.name as string,
    parent_name: (r.parent as { name?: string } | null)?.name,
  }))
}
