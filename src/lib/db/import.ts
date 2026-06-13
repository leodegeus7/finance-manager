import { supabase } from '@/lib/supabase'
import { NormalizedTransaction } from '@/import/types'
import { SplitParticipant } from '@/engine/types'

export interface UpsertResult {
  inserted: number
  skipped: number
  errors: string[]
  insertedIds: string[]
}

export interface ImportClassification {
  category_id?: string
  context?: 'personal' | 'professional'
  splits?: SplitParticipant[] | null
  is_transfer?: boolean      // override type → 'transfer', clears category/splits
  to_account_id?: string     // destination account for transfers
  notes?: string | null      // custom description set by the user during classification
  fixed_type?: 'fixed' | 'variable' | 'occasional' | null
}

/**
 * Upserts normalized transactions into Supabase.
 * Uses (external_id, source) as the conflict key — idempotent.
 */
export async function upsertTransactions(
  transactions: NormalizedTransaction[],
  userId: string,
  accountId?: string,
  creditCardId?: string,
  classifications?: Map<string, ImportClassification>,
): Promise<UpsertResult> {
  const result: UpsertResult = { inserted: 0, skipped: 0, errors: [], insertedIds: [] }

  const rows = transactions.map((tx) => {
    const clf        = classifications?.get(tx.external_id)
    const isTransfer = clf?.is_transfer ?? (tx.type === 'transfer')
    const splits     = !isTransfer && clf?.splits && clf.splits.length > 1 ? clf.splits : null

    return {
      user_id:             userId,
      account_id:          tx.account_id !== undefined ? tx.account_id     : (accountId     ?? null),
      credit_card_id:      tx.credit_card_id !== undefined ? tx.credit_card_id : (creditCardId ?? null),
      date:                tx.date,
      competency_month:    tx.competency_month,
      statement_month:     tx.statement_month ?? null,
      amount:              tx.amount,
      signed_amount:       tx.signed_amount,
      direction:           tx.direction,
      type:                isTransfer ? 'transfer' : tx.type,
      description:         tx.description,
      context:             clf?.context ?? tx.context,
      scope:               splits ? 'shared' : tx.scope,
      splits:              splits,
      category_id:         isTransfer ? null : (clf?.category_id || null),
      to_account_id:       isTransfer ? (clf?.to_account_id ?? null) : null,
      is_essential:        false,
      fixed_type:          isTransfer ? null : (clf?.fixed_type ?? null),
      installment_current: tx.installment_current ?? null,
      installment_total:   tx.installment_total ?? null,
      external_id:         tx.external_id,
      source:              tx.source,
      notes:               clf?.notes || null,
    }
  })

  // Upsert in batches of 100 to avoid request size limits
  const BATCH = 100
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { data, error } = await supabase
      .from('transactions')
      .upsert(batch, { onConflict: 'external_id,source', ignoreDuplicates: true })
      .select('id')

    if (error) {
      result.errors.push(error.message)
    } else {
      const ids = (data ?? []).map((r) => r.id as string)
      result.insertedIds.push(...ids)
      result.inserted += ids.length
      result.skipped  += batch.length - ids.length
    }
  }

  return result
}
