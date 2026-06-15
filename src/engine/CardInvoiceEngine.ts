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
// Projections are only added to months BEYOND the last month we have real
// transaction data for — real future installment rows (already imported)
// must not be double-counted with a projection of the same installment.
// ============================================================

import { Transaction } from './types'
import { addMonths } from '@/lib/format'

export interface InstallmentItem {
  id: string
  description: string
  amount: number
  installment_current: number
  installment_total: number
}

export interface CardInvoiceMonth {
  month: string                   // YYYY-MM-01 (statement month)
  total: number                   // total invoice amount
  installments: number            // portion of `total` coming from installment purchases
  installmentsPct: number         // installments / total * 100 (0 when total is 0)
  installmentItems: InstallmentItem[]
  projected: boolean              // true if this month has no real transactions yet (estimated from open installments)
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

interface MonthAcc {
  total: number
  installments: number
  items: InstallmentItem[]
}

/**
 * `months` should be the list of statement months we have real transaction
 * data for (e.g. April/2026 up to the current month). Any month beyond the
 * last one in this list is treated as `projected`.
 */
export function computeCardInvoiceSeries(transactions: Transaction[], months: string[]): CardInvoiceMonth[] {
  const byMonth = new Map<string, MonthAcc>()
  for (const m of months) byMonth.set(m, { total: 0, installments: 0, items: [] })

  const lastRealMonth = months.length > 0 ? months[months.length - 1] : ''

  const getEntry = (month: string): MonthAcc => {
    let entry = byMonth.get(month)
    if (!entry) { entry = { total: 0, installments: 0, items: [] }; byMonth.set(month, entry) }
    return entry
  }

  for (const tx of transactions) {
    const month = tx.statement_month
    if (!month) continue
    const signed = tx.direction === 'expense' ? tx.amount : -tx.amount

    const entry = getEntry(month)
    entry.total += signed
    if (tx.installment_total && tx.installment_total > 1) {
      entry.installments += signed
      entry.items.push({
        id: tx.id,
        description: tx.description,
        amount: signed,
        installment_current: tx.installment_current ?? 1,
        installment_total: tx.installment_total,
      })
    }

    // Project remaining installments into future months that don't have
    // real transaction data yet.
    if (
      tx.installment_current && tx.installment_total &&
      tx.installment_current < tx.installment_total
    ) {
      for (let k = tx.installment_current + 1; k <= tx.installment_total; k++) {
        const futureMonth = addMonths(month, k - tx.installment_current)
        if (lastRealMonth !== '' && futureMonth <= lastRealMonth) continue

        const futureEntry = getEntry(futureMonth)
        futureEntry.total += signed
        futureEntry.installments += signed
        futureEntry.items.push({
          id: `${tx.id}-proj-${k}`,
          description: tx.description,
          amount: signed,
          installment_current: k,
          installment_total: tx.installment_total,
        })
      }
    }
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { total, installments, items }]) => ({
      month,
      total: round(total),
      installments: round(installments),
      installmentsPct: total > 0 ? round((installments / total) * 100) : 0,
      installmentItems: items,
      projected: lastRealMonth !== '' && month > lastRealMonth,
    }))
}
