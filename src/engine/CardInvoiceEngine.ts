// ============================================================
// CARD INVOICE ENGINE
//
// Builds a monthly series of credit card invoice totals, split into
// "parcelado" (installment) vs "normal" portions, plus a projection of
// future months based on installments already in progress.
//
// Example: a transaction in the April/2026 invoice with installment 3/6
// means installments 4/6, 5/6, 6/6 will land on the May, June and July
// invoices with the same amount — even though those rows don't exist yet.
// ============================================================

import { Transaction } from './types'
import { addMonths } from '@/lib/format'

export interface CardInvoiceMonth {
  month: string         // YYYY-MM-01 (statement month)
  total: number         // total invoice amount
  installments: number  // portion of `total` coming from installment purchases
  projected: boolean    // true if this month has no real transactions yet (estimated from open installments)
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * `months` should be the list of statement months we have real transaction
 * data for (e.g. April/2026 up to the current month). Any month beyond the
 * last one in this list is treated as `projected`.
 */
export function computeCardInvoiceSeries(transactions: Transaction[], months: string[]): CardInvoiceMonth[] {
  const byMonth = new Map<string, { total: number; installments: number }>()
  for (const m of months) byMonth.set(m, { total: 0, installments: 0 })

  const lastRealMonth = months.length > 0 ? months[months.length - 1] : ''

  for (const tx of transactions) {
    const month = tx.statement_month
    if (!month) continue
    const signed = tx.direction === 'expense' ? tx.amount : -tx.amount

    const entry = byMonth.get(month) ?? { total: 0, installments: 0 }
    entry.total += signed
    if (tx.installment_total && tx.installment_total > 1) entry.installments += signed
    byMonth.set(month, entry)

    // Project remaining installments into future months
    if (
      tx.installment_current && tx.installment_total &&
      tx.installment_current < tx.installment_total
    ) {
      for (let k = tx.installment_current + 1; k <= tx.installment_total; k++) {
        const futureMonth = addMonths(month, k - tx.installment_current)
        const futureEntry = byMonth.get(futureMonth) ?? { total: 0, installments: 0 }
        futureEntry.total += signed
        futureEntry.installments += signed
        byMonth.set(futureMonth, futureEntry)
      }
    }
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { total, installments }]) => ({
      month,
      total: round(total),
      installments: round(installments),
      projected: lastRealMonth !== '' && month > lastRealMonth,
    }))
}
