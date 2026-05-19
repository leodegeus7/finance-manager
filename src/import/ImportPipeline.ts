// ============================================================
// IMPORT PIPELINE
// Orchestrates: resolve → parse → normalize → upsert
// ============================================================

import { resolveHandler } from './HandlerRegistry'
import { HandlerContext, ImportError, ImportResult, NormalizedTransaction } from './types'

export interface PipelineInput {
  fileName: string
  fileContent: string
  context: HandlerContext
}

/**
 * Runs the full import pipeline for a single file.
 *
 * Steps:
 *   1. Resolve handler by filename + headers
 *   2. Parse raw CSV rows
 *   3. Normalize rows → NormalizedTransaction[]
 *   4. Return result (DB insertion handled by caller/Supabase layer)
 *
 * The pipeline is pure — it does NOT write to DB.
 * Caller is responsible for upserting via external_id (idempotency).
 */
export function runImportPipeline(input: PipelineInput): ImportResult {
  const { fileName, fileContent, context } = input

  const { handler, rows } = resolveHandler(fileName, fileContent)

  const transactions: NormalizedTransaction[] = []
  const errors: ImportError[] = []

  // Normalize all rows, capturing per-row errors
  let rawRows: ReturnType<typeof handler.parse>
  try {
    rawRows = handler.parse(fileContent)
  } catch (err) {
    return {
      source: handler.source,
      filename: fileName,
      total: 0,
      imported: 0,
      skipped: 0,
      errors: [{ row: 0, rawData: {}, message: `Parse error: ${String(err)}` }],
      transactions: [],
    }
  }

  const normalized = handler.normalize(rawRows, context)

  // Deduplicate within the same file by external_id
  const seen = new Set<string>()
  let skipped = 0

  for (const tx of normalized) {
    const key = `${tx.source}::${tx.external_id}`
    if (seen.has(key)) {
      skipped++
      continue
    }
    seen.add(key)
    transactions.push(tx)
  }

  return {
    source: handler.source,
    filename: fileName,
    total: rawRows.length,
    imported: transactions.length,
    skipped,
    errors,
    transactions,
  }
}

/**
 * Validates a NormalizedTransaction for required fields.
 * Returns list of validation errors (empty = valid).
 */
export function validateTransaction(tx: NormalizedTransaction): string[] {
  const errors: string[] = []

  if (!tx.external_id) errors.push('missing external_id')
  if (!tx.source)      errors.push('missing source')
  if (!tx.date)        errors.push('missing date')
  if (!tx.competency_month) errors.push('missing competency_month')
  if (tx.amount < 0)   errors.push('amount must be >= 0')
  if (!tx.type)        errors.push('missing type')
  if (!tx.description) errors.push('missing description')
  if (!tx.direction)   errors.push('missing direction')

  // Credit card must have statement_month
  if (
    (tx.type === 'credit_card_purchase') &&
    !tx.statement_month
  ) {
    errors.push('credit_card_purchase requires statement_month')
  }

  // Installment consistency
  const hasCurrent = tx.installment_current != null
  const hasTotal = tx.installment_total != null
  if (hasCurrent !== hasTotal) {
    errors.push('installment_current and installment_total must both be set or both null')
  }
  if (hasCurrent && hasTotal) {
    if (tx.installment_current! < 1 || tx.installment_current! > tx.installment_total!) {
      errors.push(`installment_current (${tx.installment_current}) out of range for total (${tx.installment_total})`)
    }
  }

  return errors
}
