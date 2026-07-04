// ============================================================
// HANDLER 1 — NUBANK ACCOUNT (conta corrente)
//
// Headers: Data, Valor, Identificador, Descrição
// Source:  'nubank_account'
//
// Rules:
//   - Date: DD/MM/YYYY → ISO
//   - Value: >0 → income, <0 → expense
//   - Type mapped by description keyword
//   - external_id = Identificador field (already unique from Nubank)
// ============================================================

import { ImportHandler, HandlerContext, NormalizedTransaction, RawRow, TransactionType } from '../types'
import { parseCSV } from '../utils/csv'
import { parseBrazilianDate, toCompetencyMonth } from '../utils/date'
import { parseMoney } from '../utils/money'

// Maps description keywords → transaction type
// Order matters — first match wins
const TYPE_RULES: Array<{ pattern: RegExp; type: TransactionType }> = [
  { pattern: /fatura/i,                type: 'credit_card_payment' },
  // "Pagamento de boleto efetuado - BANCO C6 S.A." (and similar for other
  // card issuers) is the boleto used to pay the credit card invoice —
  // treat it the same as a "fatura" payment, not a generic bill.
  { pattern: /boleto.*(banco c6|c6 bank|c6 s\.?a\.?|banco inter\b|nu pagamentos|nubank)/i, type: 'credit_card_payment' },
  { pattern: /aplica[çc][aã]o.*(rdb|cdb|tesouro|fundo)/i, type: 'investment_contribution' },
  { pattern: /resgate.*(rdb|cdb|tesouro|fundo)/i,          type: 'investment_withdrawal' },
  { pattern: /pix enviado|pix saída/i, type: 'expense' },
  { pattern: /pix recebido|pix entrada/i, type: 'income' },
  { pattern: /boleto|pagamento de conta/i, type: 'bill_payment' },
  { pattern: /d[ée]bito/i,            type: 'expense' },
  // "Transferência enviada" → expense by default.
  // Real account-to-account transfers are rare; user marks them manually
  // in the import preview with the ⇄ Transferência toggle.
  { pattern: /transfer[êe]ncia enviada/i, type: 'expense' },
  { pattern: /transfer[êe]ncia recebida/i, type: 'income' },
]

function detectType(description: string, signedAmount: number): TransactionType {
  for (const rule of TYPE_RULES) {
    if (rule.pattern.test(description)) return rule.type
  }
  // Fallback: use sign
  return signedAmount >= 0 ? 'income' : 'expense'
}

export class NubankAccountHandler implements ImportHandler {
  readonly source = 'nubank_account'

  // Identifies by filename OR by presence of required headers
  identify(fileName: string, headers: string[]): boolean {
    const lowerName = fileName.toLowerCase()
    const nameMatch = lowerName.includes('nubank') && !lowerName.includes('fatura') && !lowerName.includes('cartao')
    const headerMatch =
      headers.includes('Data') &&
      headers.includes('Valor') &&
      headers.includes('Identificador') &&
      headers.includes('Descrição')
    return nameMatch || headerMatch
  }

  parse(fileContent: string): RawRow[] {
    const { rows } = parseCSV(fileContent)
    return rows
  }

  normalize(rows: RawRow[], ctx: HandlerContext): NormalizedTransaction[] {
    const results: NormalizedTransaction[] = []

    // Nubank reuses the same Identificador for a failed/reversed Pix and its
    // "Estorno - ..." counter-entry. When both rows are present and net to
    // zero, the transfer never actually went through — skip both so they
    // don't show up duplicated (and don't collide on external_id).
    const sumsByIdentifier = new Map<string, number>()
    for (const row of rows) {
      const identifier = row['Identificador']
      const rawValue = row['Valor']
      if (!identifier || !rawValue) continue
      const value = parseMoney(rawValue)
      if (isNaN(value)) continue
      sumsByIdentifier.set(identifier, (sumsByIdentifier.get(identifier) ?? 0) + value)
    }
    const reversedIdentifiers = new Set<string>()
    for (const row of rows) {
      const identifier = row['Identificador']
      const description = row['Descrição'] ?? row['Descricao'] ?? ''
      if (!identifier) continue
      if (/^estorno/i.test(description.trim())) {
        const sum = sumsByIdentifier.get(identifier) ?? 0
        if (Math.abs(sum) < 0.005) reversedIdentifiers.add(identifier)
      }
    }

    for (const row of rows) {
      const rawDate = row['Data']
      const rawValue = row['Valor']
      const identifier = row['Identificador']
      const description = row['Descrição'] ?? row['Descricao'] ?? ''

      if (!rawDate || !rawValue || !identifier) continue
      if (reversedIdentifiers.has(identifier)) continue

      const isoDate = parseBrazilianDate(rawDate)
      const signedAmount = parseMoney(rawValue)

      if (isNaN(signedAmount)) continue

      const amount = Math.abs(signedAmount)
      const direction = signedAmount >= 0 ? 'income' : 'expense'
      const type = detectType(description, signedAmount)

      results.push({
        source: this.source,
        external_id: identifier,      // Rule Handler 1: external_id = Identificador

        date: isoDate,
        competency_month: toCompetencyMonth(isoDate),
        // No statement_month — this is a bank account, not a credit card

        amount,
        signed_amount: signedAmount,
        direction,
        type,
        description,

        context: ctx.userId ? 'personal' : 'personal', // default personal
        scope: 'individual',                            // default individual
      })
    }

    return results
  }
}

// ============================================================
// EXAMPLE INPUT (nubank_account.csv):
//
// Data,Valor,Identificador,Descrição
// 01/04/2024,-32.90,abc123def456,Pix enviado - João
// 05/04/2024,5000.00,xyz789,Pix recebido - Salário
// 10/04/2024,-1200.00,fatura001,Pagamento de fatura Nubank
// 15/04/2024,-500.00,invest001,Aplicação RDB
//
// EXAMPLE NORMALIZED OUTPUT:
// [
//   {
//     source: 'nubank_account',
//     external_id: 'abc123def456',
//     date: '2024-04-01',
//     competency_month: '2024-04-01',
//     amount: 32.90,
//     signed_amount: -32.90,
//     direction: 'expense',
//     type: 'expense',
//     description: 'Pix enviado - João',
//     context: 'personal',
//     scope: 'individual',
//   },
//   {
//     source: 'nubank_account',
//     external_id: 'xyz789',
//     date: '2024-04-05',
//     competency_month: '2024-04-01',
//     amount: 5000.00,
//     signed_amount: 5000.00,
//     direction: 'income',
//     type: 'income',
//     description: 'Pix recebido - Salário',
//     context: 'personal',
//     scope: 'individual',
//   },
//   {
//     source: 'nubank_account',
//     external_id: 'fatura001',
//     date: '2024-04-10',
//     competency_month: '2024-04-01',
//     amount: 1200.00,
//     signed_amount: -1200.00,
//     direction: 'expense',
//     type: 'credit_card_payment',   // ← NOT counted as expense
//     description: 'Pagamento de fatura Nubank',
//     context: 'personal',
//     scope: 'individual',
//   },
//   {
//     source: 'nubank_account',
//     external_id: 'invest001',
//     date: '2024-04-15',
//     competency_month: '2024-04-01',
//     amount: 500.00,
//     signed_amount: -500.00,
//     direction: 'expense',
//     type: 'investment_contribution', // ← NOT an expense in cash flow
//     description: 'Aplicação RDB',
//     context: 'personal',
//     scope: 'individual',
//   },
// ]
// ============================================================
