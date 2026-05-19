// ============================================================
// HANDLER 2 — NUBANK CREDIT CARD (fatura)
//
// Headers: date, title, amount
// Source:  'nubank_credit'
//
// Rules (from business_rules § Handler 2):
//   - Always expense
//   - signed_amount = -amount (amount in CSV is always positive)
//   - type = 'credit_card_purchase'
//   - external_id = hash(date + title + amount + credit_card_id)
//   - statement_month is set by caller (HandlerContext.statementMonth)
//     because the CSV itself is a monthly invoice file
// ============================================================

import { ImportHandler, HandlerContext, NormalizedTransaction, RawRow } from '../types'
import { parseCSV } from '../utils/csv'
import { toCompetencyMonth } from '../utils/date'
import { hash } from '../utils/hash'

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

    for (const row of rows) {
      const rawDate = row['date']
      const title = row['title'] ?? ''
      const rawAmount = row['amount']

      if (!rawDate || !rawAmount || !title) continue

      // Nubank CC CSV uses YYYY-MM-DD format already
      const isoDate = rawDate.trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) continue

      const amount = parseFloat(rawAmount.replace(',', '.'))
      if (isNaN(amount) || amount <= 0) continue

      // Rule Handler 2: always expense, signed_amount = -amount
      const signedAmount = -amount

      // Rule Handler 2: external_id = hash(date + title + amount + credit_card_id)
      const externalId = hash(isoDate, title, amount, ctx.creditCardId)

      // statement_month comes from caller context (the file represents a specific invoice)
      // competency_month = month of the actual purchase date
      const statementMonth = ctx.statementMonth ?? toCompetencyMonth(isoDate)

      results.push({
        source: this.source,
        external_id: externalId,

        date: isoDate,
        competency_month: toCompetencyMonth(isoDate),
        statement_month: statementMonth,  // Rule 3.2

        amount,
        signed_amount: signedAmount,
        direction: 'expense',              // Rule Handler 2: always expense
        type: 'credit_card_purchase',

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
// NOTE: The invoice PAYMENT (credit_card_payment) comes from the
// Nubank ACCOUNT handler when the user pays the bill via Pix/Boleto.
// These are TWO separate sources — never combined. No double counting.
// ============================================================
