import { supabase } from '@/lib/supabase'
import { Transaction, SplitParticipant } from '@/engine/types'
import { TransactionType, TransactionContext, TransactionScope } from '@/import/types'

export interface ManualTransactionInput {
  user_id: string
  date: string               // YYYY-MM-DD
  description: string
  amount: number             // absolute, always > 0
  direction: 'income' | 'expense'
  type: TransactionType
  account_id?: string
  credit_card_id?: string
  statement_month?: string   // YYYY-MM-01 (CC only)
  category_id?: string
  context: TransactionContext
  splits?: SplitParticipant[] | null
  notes?: string
}

// Match by "effective month": non-card transactions (statement_month is
// null) by competency_month (purchase month); credit card transactions by
// statement_month (invoice month) — regardless of which calendar month the
// purchase itself fell in. See src/engine/effectiveMonth.ts.
const effectiveMonthOr = (month: string) =>
  `and(statement_month.is.null,competency_month.eq.${month}),statement_month.eq.${month}`

type Row = Record<string, unknown>

function toTransaction(row: Row): Transaction {
  return {
    id:                   row.id as string,
    user_id:              row.user_id as string,
    account_id:           row.account_id as string | undefined,
    credit_card_id:       row.credit_card_id as string | undefined,
    to_account_id:        row.to_account_id as string | undefined,
    date:                 row.date as string,
    competency_month:     row.competency_month as string,
    statement_month:      row.statement_month as string | undefined,
    amount:               Number(row.amount),
    signed_amount:        Number(row.signed_amount),
    direction:            row.direction as 'income' | 'expense',
    type:                 row.type as Transaction['type'],
    description:          row.description as string,
    category_id:          row.category_id as string | undefined,
    category_name:        (row.categories as Row | null)?.name as string | undefined,
    parent_category_name: (row.parent as Row | null)?.name as string | undefined,
    context:              row.context as Transaction['context'],
    scope:                row.scope as Transaction['scope'],
    splits:               row.splits as SplitParticipant[] | undefined,
    is_essential:         Boolean(row.is_essential),
    fixed_type:           row.fixed_type as Transaction['fixed_type'],
    installment_current:  row.installment_current as number | undefined,
    installment_total:    row.installment_total as number | undefined,
    external_id:          row.external_id as string,
    source:               row.source as string,
    notes:                row.notes as string | null | undefined,
  }
}

export async function fetchTransactionsByMonth(month: string, userId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      categories:category_id (
        id, name,
        parent:parent_id ( id, name )
      )
    `)
    .eq('user_id', userId)
    .or(effectiveMonthOr(month))
    .order('date', { ascending: false })

  if (error) throw error
  return (data ?? []).map(toTransaction)
}

/** Insert a single manually-entered transaction. Returns the new row id. */
export async function createManualTransaction(input: ManualTransactionInput): Promise<string> {
  const competency_month = input.date.slice(0, 7) + '-01'
  const signed_amount    = input.direction === 'income' ? input.amount : -input.amount

  // Simple deterministic id from content + timestamp so it stays unique
  const seed    = `${input.user_id}|${input.date}|${input.description}|${input.amount}|${Date.now()}`
  let h = 5381
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h) ^ seed.charCodeAt(i)
    h = h >>> 0
  }
  const external_id = `manual_${h.toString(16).padStart(8, '0')}`

  const splits = input.splits && input.splits.length > 1 ? input.splits : null
  const scope  = splits ? 'shared' : 'individual'

  const row = {
    user_id:          input.user_id,
    account_id:       input.account_id       ?? null,
    credit_card_id:   input.credit_card_id   ?? null,
    date:             input.date,
    competency_month,
    statement_month:  input.statement_month  ?? null,
    amount:           input.amount,
    signed_amount,
    direction:        input.direction,
    type:             input.type,
    description:      input.description,
    category_id:      input.category_id      ?? null,
    context:          input.context,
    scope,
    splits:           splits ?? null,
    is_essential:     false,
    fixed_type:       null,
    external_id,
    source:           'manual',
    notes:            input.notes            ?? null,
  }

  const { data, error } = await supabase.from('transactions').insert(row).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function fetchTransactionsByIds(ids: string[]): Promise<Transaction[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      categories:category_id (
        id, name,
        parent:parent_id ( id, name )
      )
    `)
    .in('id', ids)
    .order('date', { ascending: false })

  if (error) throw error
  return (data ?? []).map(toTransaction)
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw error
}

export interface TransactionPatch {
  type?: string
  category_id?: string
  context?: string
  scope?: string
  splits?: SplitParticipant[] | null
  to_account_id?: string | null
  notes?: string | null
  fixed_type?: 'fixed' | 'variable' | 'occasional' | null
}

/** Auto-derives `scope` from splits when splits key is present */
function withDerivedScope(patch: TransactionPatch): Record<string, unknown> {
  const out: Record<string, unknown> = { ...patch }
  if ('splits' in patch) {
    const hasSplits = Array.isArray(patch.splits) && patch.splits.length > 1
    out.scope  = hasSplits ? 'shared' : 'individual'
    out.splits = hasSplits ? patch.splits : null
  }
  return out
}

export async function bulkUpdateTransactions(
  updates: ({ id: string } & TransactionPatch)[]
): Promise<void> {
  if (updates.length === 0) return
  const BATCH = 20
  for (let i = 0; i < updates.length; i += BATCH) {
    await Promise.all(
      updates.slice(i, i + BATCH).map(({ id, ...patch }) =>
        supabase
          .from('transactions')
          .update({ ...withDerivedScope(patch), updated_at: new Date().toISOString() })
          .eq('id', id)
      )
    )
  }
}

/** Fetch ALL of a user's transactions relevant to a given month (effective
 *  month — see effectiveMonthOr). Unlike `fetchSplitTransactionsByMonth`,
 *  this is NOT restricted to transactions that have `splits` set — used by
 *  the Casal page, which also needs individual (non-split) fixed expenses. */
export async function fetchPersonalTransactionsByMonth(month: string, userId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(`*, categories:category_id (id, name, parent:parent_id (id, name))`)
    .eq('user_id', userId)
    .or(effectiveMonthOr(month))

  if (error) throw error
  return (data ?? []).map((row) => toTransaction(row as Row))
}

/** Fetch transactions with splits that are relevant to a given month
 *  (effective month — see effectiveMonthOr). */
export async function fetchSplitTransactionsByMonth(month: string, userId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(`*, categories:category_id (id, name, parent:parent_id (id, name))`)
    .eq('user_id', userId)
    .not('splits', 'is', null)
    .or(effectiveMonthOr(month))

  if (error) throw error
  return (data ?? []).map((row) => toTransaction(row as Row))
}

export async function fetchTransactionsByCard(cardId: string, month: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      categories:category_id (
        id, name,
        parent:parent_id ( id, name )
      )
    `)
    .eq('credit_card_id', cardId)
    .eq('statement_month', month)
    .order('date', { ascending: false })

  if (error) throw error
  return (data ?? []).map(toTransaction)
}

export async function updateTransaction(id: string, patch: TransactionPatch): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ ...withDerivedScope(patch), updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}
