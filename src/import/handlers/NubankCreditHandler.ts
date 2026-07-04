// ============================================================
// HANDLER 2 — NUBANK CREDIT CARD (fatura)
//
// Headers: date, title, amount
// Source:  'nubank_credit'
//
// Rules (from business_rules § Handler 2):
//   - Purchases (positive amount) → expense, type = 'credit_card_purchase'
//   - Refunds/estornos (negative amount) → income, type = 'income'
//     (reduces the invoice total, same as CardTransactionsModal's "Total fatura")
//   - "Pagamento recebido" rows are skipped — that's the payment of the
//     PREVIOUS invoice, tracked separately via NubankAccountHandler
//     (credit_card_payment), so importing it here would double count it
//     under the wrong statement_month.
//   - signed_amount = -amount for purchases, +amount for refunds
//   - external_id = hash(date + title + amount + credit_card_id)
//   - statement_month is set by caller (HandlerContext.statementMonth)
//     because the CSV itself is a monthly invoice file
//
// Note: Nubank exports negative amounts with a space after the minus sign
// (e.g. "- 84,97"), which `parseFloat` cannot parse directly — the space
// must be stripped before parsing.
// ============================================================

import { ImportHandler, HandlerContext, NormalizedTransaction, RawRow } from '../types'
import { parseCSV } from '../utils/csv'
import { toCompetencyMonth } from '../utils/date'
import { parseMoney } from '../utils/money'
import { hash } from '../utils/hash'

/**
 * Returns true if the description looks like an invoice payment
 * ("Pagamento recebido") — these belong to the PREVIOUS invoice and are
 * tracked via NubankAccountHandler, so they must be skipped here.
 */
function isInvoicePayment(desc: string): boolean {
  return /pagamento\s+recebido/i.test(desc.trim())
}

export class NubankCreditHandler implements ImportHandler {
  readonly source = 'nubank_credit'

  identify(fileName: string, headers: string[]): boolean {
    const lowerName = fileName.toLowerCase()
    // Name match: nubank + any indicator of credit card / invoice
    const nameMatch =
      lowerName.includes('nubank') &&
      (lowerName.includes('fatura') || lowerName.includes('cartao') || lowerName.includes('cartão'))
    // Header match: date+title+amount — but ONLY when combined with nubank in filename,
    // to avoid matching other CSVs with the same column names
    const headerMatch =
      lowerName.includes('nubank') &&
      headers.includes('date') &&
      headers.includes('title') &&
      headers.includes('amount')
    return nameMatch || headerMatch
  }

  parse(fileContent: string): RawRow[] {
    const { rows } = parseCSV(fileContent)
    return rows
  }

  normalize(rows: RawRow[], ctx: HandlerContext): NormalizedTransaction[] {
    if (!ctx.creditCardId) {
      throw new Error('NubankCreditHandler requires creditCardId in context')
    }

    const results: NormalizedTransaction[] = []
    const occurrences = new Map<string, number>()

    for (const row of rows) {
      const rawDate = row['date']
      const title = row['title'] ?? ''
      const rawAmount = row['amount']

      if (!rawDate || !rawAmount || !title) continue

      // Nubank CC CSV uses YYYY-MM-DD format already
      const isoDate = rawDate.trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) continue

      // Robust BR/US parse — handles the thousands separator ("1.401,07") and
      // Nubank's spaced negatives ("- 84,97").
      const amount = parseMoney(rawAmount)
      if (isNaN(amount) || amount === 0) continue

      const isCredit = amount < 0
      const absAmount = Math.abs(amount)

      // "Pagamento recebido" = payment of the PREVIOUS invoice, tracked via
      // NubankAccountHandler — skip to avoid double counting.
      if (isCredit && isInvoicePayment(title)) continue

      // Rule Handler 2: purchases are expenses (signed_amount = -amount);
      // refunds/estornos are income (signed_amount = +amount), reducing the invoice total.
      const signedAmount = isCredit ? absAmount : -absAmount

      // Rule Handler 2: external_id = hash(date + title + amount + credit_card_id)
      // For duplicate rows (same date+title+amount in the same file), append occurrence index
      const occKey = `${isoDate}|${title}|${absAmount}`
      const occCount = (occurrences.get(occKey) ?? 0) + 1
      occurrences.set(occKey, occCount)
      const externalId = occCount === 1
        ? hash(isoDate, title, absAmount, ctx.creditCardId)
        : hash(isoDate, title, absAmount, ctx.creditCardId, occCount)

      // statement_month comes from caller context (the file represents a specific invoice)
      // competency_month = month of the actual purchase date
      const statementMonth = ctx.statementMonth ?? toCompetencyMonth(isoDate)

      results.push({
        source: this.source,
        external_id: externalId,

        date: isoDate,
        competency_month: toCompetencyMonth(isoDate),
        statement_month: statementMonth,  // Rule 3.2

        amount: absAmount,
        signed_amount: signedAmount,
        direction: isCredit ? 'income' : 'expense',
        type: isCredit ? 'income' : 'credit_card_purchase',

        description: title,

        context: 'personal',
        scope: 'individual',
      })
    }

    return results
  }
}

// ============================================================
// EXAMPLE INPUT (nubank_fatura_abril_2024.csv):
//
// date,title,amount
// 2024-03-18,Uber,32.90
// 2024-03-20,iFood,45.00
// 2024-03-25,Amazon,199.90
//
// Handler context:
//   { creditCardId: 'cc-nubank-uuid', statementMonth: '2024-04-01' }
//
// EXAMPLE NORMALIZED OUTPUT:
// [
//   {
//     source: 'nubank_credit',
//     external_id: hash('2024-03-18', 'Uber', 32.90, 'cc-nubank-uuid'),
//     date: '2024-03-18',
//     competency_month: '2024-03-01',   // ← month of purchase
//     statement_month:  '2024-04-01',   // ← month of invoice
//     amount: 32.90,
//     signed_amount: -32.90,            // always negative
//     direction: 'expense',
//     type: 'credit_card_purchase',
//     description: 'Uber',
//     context: 'personal',
//     scope: 'individual',
//   },
//   {
//     source: 'nubank_credit',
//     external_id: hash('2024-03-20', 'iFood', 45.00, 'cc-nubank-uuid'),
//     date: '2024-03-20',
//     competency_month: '2024-03-01',
//     statement_month:  '2024-04-01',
//     amount: 45.00,
//     signed_amount: -45.00,
//     direction: 'expense',
//     type: 'credit_card_purchase',
//     description: 'iFood',
//     context: 'personal',
//     scope: 'individual',
//   },
// ]
//
// REFUND/ESTORNO EXAMPLE — negative amount, Nubank writes "- 84,97":
// 2024-03-22,Uber - NuPay,"- 84,97"
//   →
//   {
//     source: 'nubank_credit',
//     external_id: hash('2024-03-22', 'Uber - NuPay', 84.90, 'cc-nubank-uuid'),
//     date: '2024-03-22',
//     competency_month: '2024-03-01',
//     statement_month:  '2024-04-01',
//     amount: 84.97,
//     signed_amount: 84.97,             // positive → reduces invoice total
//     direction: 'income',
//     type: 'income',
//     description: 'Uber - NuPay',
//     context: 'personal',
//     scope: 'individual',
//   }
//
// "Pagamento recebido" rows are skipped entirely (see isInvoicePayment).
//
// NOTE: The invoice PAYMENT (credit_card_payment) comes from the
// Nubank ACCOUNT handler when the user pays the bill via Pix/Boleto.
// These are TWO separate sources — never combined. No double counting.
// ============================================================
