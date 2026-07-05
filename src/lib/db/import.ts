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
  // For a tx the handler auto-detected as type 'credit_card_payment': whether
  // the user kept it as a payment (default true) or unmarked it — in which
  // case it's saved as a normal expense with category/splits applying, same
  // as any other transaction. card_payment_card_id is never persisted as
  // credit_card_id (that column means "invoice line item", not "settles
  // this card") — it's folded into `notes` purely for readability.
  is_card_payment?: boolean
  card_payment_card_id?: string
  card_payment_card_name?: string
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

    // Handler flagged this as a card-invoice payment — the user can un-mark it
    // in the import review, in which case it's saved as a normal expense.
    const wasDetectedAsCardPayment = tx.type === 'credit_card_payment'
    const keepAsCardPayment = wasDetectedAsCardPayment && (clf?.is_card_payment ?? true)
    const droppedCardPayment = wasDetectedAsCardPayment && !keepAsCardPayment

    const finalType = isTransfer ? 'transfer' : keepAsCardPayment ? 'credit_card_payment' : droppedCardPayment ? 'expense' : tx.type
    const applyClassification = !isTransfer && !keepAsCardPayment
    const splits = applyClassification && clf?.splits && clf.splits.length > 1 ? clf.splits : null

    // Fold "which card" into notes for readability (never into credit_card_id
    // — that column means "invoice line item", which a payment is not, and
    // would wrongly group this row under the card's fatura in the UI).
    const notes = keepAsCardPayment && !clf?.notes && clf?.card_payment_card_name
      ? `Pagamento fatura — ${clf.card_payment_card_name}`
      : clf?.notes || null

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
      type:                finalType,
      description:         tx.description,
      context:             clf?.context ?? tx.context,
      scope:               splits ? 'shared' : tx.scope,
      splits:              splits,
      category_id:         applyClassification ? (clf?.category_id || null) : null,
      to_account_id:       isTransfer ? (clf?.to_account_id ?? null) : null,
      is_essential:        false,
      fixed_type:          applyClassification ? (clf?.fixed_type ?? null) : null,
      installment_current: tx.installment_current ?? null,
      installment_total:   tx.installment_total ?? null,
      external_id:         tx.external_id,
      source:              tx.source,
      notes,
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
