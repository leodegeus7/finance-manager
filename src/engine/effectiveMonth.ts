// ============================================================
// EFFECTIVE MONTH
//
// The month a transaction "counts toward" for monthly aggregations
// (Transações, Dashboard, Casal/splits).
//
//   - Credit card purchases/refunds (statement_month set) count toward
//     the INVOICE month — so importing a later invoice never changes a
//     previously "closed" month, even if the purchase date itself falls
//     in the previous calendar month.
//   - Everything else (accounts, manual entries, transfers, etc.) counts
//     toward the month it actually happened (competency_month).
//
// The real transaction date (`tx.date`) is unaffected — it's still shown
// per-transaction everywhere.
// ============================================================

import { Transaction } from './types'

export function effectiveMonth(tx: Pick<Transaction, 'competency_month' | 'statement_month'>): string {
  return tx.statement_month ?? tx.competency_month
}
