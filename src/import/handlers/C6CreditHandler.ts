// ============================================================
// HANDLER 3 — C6 CREDIT CARD
//
// Headers: Data, Descrição, Valor, Parcela
// Source:  'c6_credit'
//
// Rules (from business_rules § Handler 3):
//   - Date: DD/MM/YYYY → ISO
//   - signed_amount = -amount (always expense)
//   - Parcela: '02/10' → current=2, total=10
//   - external_id = hash(date + description + amount + installment + card_id)
//   - statement_month from caller context
// ============================================================

import { ImportHandler, HandlerContext, NormalizedTransaction, RawRow } from '../types'
import { parseCSV } from '../utils/csv'
import { parseBrazilianDate, toCompetencyMonth } from '../utils/date'
import { hash } from '../utils/hash'

interface ParsedInstallment {
  current: number
  total: number
  raw: string  // original string e.g. '02/10'
}

/**
 * Parses installment field '02/10' → { current: 2, total: 10 }
 * Returns null if no installment (single purchase).
 */
function parseInstallment(raw: string | undefined): ParsedInstallment | null {
  if (!raw || raw.trim() === '' || raw.trim() === '-' || raw.trim() === '0') return null

  const match = raw.trim().match(/^(\d+)\/(\d+)$/)
  if (!match) return null

  const current = parseInt(match[1], 10)
  const total = parseInt(match[2], 10)

  if (isNaN(current) || isNaN(total) || total < 1 || current < 1 || current > total) return null

  return { current, total, raw: raw.trim() }
}

/**
 * Returns true if the description looks like an invoice payment (should be skipped).
 * Refunds/credits like "Estorno Tarifa" should return false and be imported as income.
 */
function isInvoicePayment(desc: string): boolean {
  const lower = desc.toLowerCase()
  return (
    lower.includes('pagamento fatura') ||
    lower.includes('pagamento de fatura') ||
    lower.includes('pagto fatura') ||
    lower.includes('pag fatura') ||
    lower.includes('pag de fatura') ||
    lower.startsWith('pagamento ')
  )
}

export class C6CreditHandler implements ImportHandler {
  readonly source = 'c6_credit'

  identify(fileName: string, headers: string[]): boolean {
    const lowerName = fileName.toLowerCase()
    const nameMatch = lowerName.includes('c6') || lowerName.includes('c6bank')

    // New C6 export format (semicolon-separated):
    //   "Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)"
    const newFormatMatch =
      headers.includes('Data de Compra') &&
      headers.includes('Descrição') &&
      headers.includes('Parcela') &&
      headers.some((h) => h.startsWith('Valor'))

    // Legacy C6 format (comma-separated):
    //   "Data,Descrição,Valor,Parcela"
    const oldFormatMatch =
      headers.includes('Data') &&
      headers.includes('Descrição') &&
      headers.includes('Valor') &&
      headers.includes('Parcela')

    return nameMatch || newFormatMatch || oldFormatMatch
  }

  parse(fileContent: string): RawRow[] {
    const { rows } = parseCSV(fileContent)
    return rows
  }

  normalize(rows: RawRow[], ctx: HandlerContext): NormalizedTransaction[] {
    if (!ctx.creditCardId) {
      throw new Error('C6CreditHandler requires creditCardId in context')
    }

    const results: NormalizedTransaction[] = []
    // Counter to differentiate legitimate duplicate charges (same date+desc+amount)
    const seenCounts = new Map<string, number>()

    for (const row of rows) {
      // Support both old ("Data") and new ("Data de Compra") column names
      const rawDate = row['Data de Compra'] ?? row['Data']
      const description = (row['Descrição'] ?? row['Descricao'] ?? '').trim()
      // New format: "Valor (em R$)" — old format: "Valor"
      const rawAmount = row['Valor (em R$)'] ?? row['Valor']
      const rawInstallment = row['Parcela']

      if (!rawDate || !rawAmount || !description) continue

      const isoDate = parseBrazilianDate(rawDate)

      // Parse amount — new format uses BRL value; negative = payment or refund
      const rawNum = rawAmount.replace(',', '.').replace(/[^\d.-]/g, '')
      const amount = parseFloat(rawNum)

      // Skip zero-value rows
      if (isNaN(amount) || amount === 0) continue

      const isCredit = amount < 0
      const absAmount = Math.abs(amount)

      // Skip invoice payments — we don't want to import those as transactions
      if (isCredit && isInvoicePayment(description)) continue

      // Parse installment field
      const installment = parseInstallment(rawInstallment)

      // Track occurrences so duplicate charges on same day get distinct IDs.
      // IMPORTANT: first occurrence uses the original hash (no suffix) to stay
      // backward-compatible with already-imported transactions.
      const dupeKey = `${isoDate}|${description}|${absAmount}`
      const occurrence = (seenCounts.get(dupeKey) ?? 0) + 1
      seenCounts.set(dupeKey, occurrence)

      const externalId = occurrence === 1
        ? hash(isoDate, description, absAmount, installment?.raw ?? '', ctx.creditCardId)
        : hash(isoDate, description, absAmount, installment?.raw ?? '', ctx.creditCardId, String(occurrence))

      const statementMonth = ctx.statementMonth ?? toCompetencyMonth(isoDate)

      const normalized: NormalizedTransaction = {
        source: this.source,
        external_id: externalId,

        date: isoDate,
        competency_month: toCompetencyMonth(isoDate),
        statement_month: statementMonth,

        amount: absAmount,
        signed_amount: isCredit ? absAmount : -absAmount,
        direction: isCredit ? 'income' : 'expense',
        type: isCredit ? 'income' : 'credit_card_purchase',

        description,

        context: 'personal',
        scope: 'individual',
      }

      // Attach installment data if present (only on purchases)
      if (!isCredit && installment) {
        normalized.installment_current = installment.current
        normalized.installment_total = installment.total
      }

      results.push(normalized)
    }

    return results
  }
}

// ============================================================
// EXAMPLE INPUT (c6_fatura_abril_2024.csv):
//
// Data,Descrição,Valor,Parcela
// 18/03/2024,Mercado Livre,150.00,01/03
// 20/03/2024,Restaurante Gato,89.90,
// 01/04/2024,Netflix,45.90,
// 25/03/2024,Dentista,600.00,02/06
//
// Handler context:
//   { creditCardId: 'cc-c6-uuid', statementMonth: '2024-04-01' }
//
// EXAMPLE NORMALIZED OUTPUT:
// [
//   {
//     source: 'c6_credit',
//     external_id: hash('2024-03-18', 'Mercado Livre', 150.00, '01/03', 'cc-c6-uuid'),
//     date: '2024-03-18',
//     competency_month: '2024-03-01',
//     statement_month:  '2024-04-01',
//     amount: 150.00,
//     signed_amount: -150.00,
//     direction: 'expense',
//     type: 'credit_card_purchase',
//     description: 'Mercado Livre',
//     installment_current: 1,
//     installment_total: 3,
//     context: 'personal',
//     scope: 'individual',
//   },
//   {
//     source: 'c6_credit',
//     external_id: hash('2024-03-20', 'Restaurante Gato', 89.90, '', 'cc-c6-uuid'),
//     date: '2024-03-20',
//     competency_month: '2024-03-01',
//     statement_month:  '2024-04-01',
//     amount: 89.90,
//     signed_amount: -89.90,
//     direction: 'expense',
//     type: 'credit_card_purchase',
//     description: 'Restaurante Gato',
//     // no installment_current / installment_total (single purchase)
//     context: 'personal',
//     scope: 'individual',
//   },
//   {
//     source: 'c6_credit',
//     external_id: hash('2024-03-25', 'Dentista', 600.00, '02/06', 'cc-c6-uuid'),
//     date: '2024-03-25',
//     competency_month: '2024-03-01',
//     statement_month:  '2024-04-01',
//     amount: 600.00,
//     signed_amount: -600.00,
//     direction: 'expense',
//     type: 'credit_card_purchase',
//     description: 'Dentista',
//     installment_current: 2,
//     installment_total: 6,
//     context: 'personal',
//     scope: 'individual',
//   },
// ]
// ============================================================
