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

/**
 * Categorias são escopadas por ledger via `categories.user_id`:
 * - casal (leo/murilo): categorias globais (`user_id IS NULL`)
 * - fazenda: categorias próprias (`user_id = 'fazenda'`)
 * Isso mantém os dropdowns limpos — cada perfil só vê as suas.
 */
export async function fetchCategories(userId: string): Promise<CategoryRow[]> {
  let query = supabase
    .from('categories')
    .select(`id, name, parent:parent_id ( name )`)
    .order('name')

  query = userId === 'fazenda'
    ? query.eq('user_id', 'fazenda')
    : query.is('user_id', null)

  const { data, error } = await query

  if (error) throw error
  return (data ?? []).map((r) => ({
    id:          r.id as string,
    name:        r.name as string,
    parent_name: (r.parent as { name?: string } | null)?.name,
  }))
}
