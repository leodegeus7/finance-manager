// ============================================================
// HANDLER 5 — INTER ACCOUNT (conta corrente)
//
// Headers: Data, Histórico, Valor, Saldo
// Source:  'inter_account'
//
// Rules:
//   - Date: DD/MM/YYYY → ISO
//   - Value: positive (income), negative (expense)
//   - Type mapped by description keyword
//   - external_id = hash(date + description + signedAmount + index)
// ============================================================

import { ImportHandler, HandlerContext, NormalizedTransaction, RawRow, TransactionType } from '../types'
import { parseCSV } from '../utils/csv'
import { parseBrazilianDate, toCompetencyMonth } from '../utils/date'
import { parseMoney } from '../utils/money'
import { hash } from '../utils/hash'

const TYPE_RULES: Array<{ pattern: RegExp; type: TransactionType }> = [
  { pattern: /PAGTO FATURA|PGTO FATURA/i, type: 'credit_card_payment' },
  { pattern: /APLICAÇÃO.*CDB|APLICAÇÃO.*LCI/i, type: 'investment_contribution' },
  { pattern: /RESGATE.*CDB|RESGATE.*LCI/i, type: 'investment_withdrawal' },
  { pattern: /PIX ENVIADO|PIX SAÍDA/i, type: 'expense' },
  { pattern: /PIX RECEBIDO|PIX ENTRADA/i, type: 'income' },
  { pattern: /BOLETO|PAGAMENTO DE CONTA/i, type: 'bill_payment' },
  { pattern: /TRANSFERÊNCIA ENVIADA/i, type: 'expense' },
  { pattern: /TRANSFERÊNCIA RECEBIDA/i, type: 'income' },
]

function detectType(description: string, signedAmount: number): TransactionType {
  for (const rule of TYPE_RULES) {
    if (rule.pattern.test(description)) return rule.type
  }
  return signedAmount >= 0 ? 'income' : 'expense'
}

function guessCardBank(description: string): string | undefined {
  if (/INTER/i.test(description)) return 'inter'
  if (/NUBANK|NU PAGAMENTOS/i.test(description)) return 'nubank'
  if (/C6/i.test(description)) return 'c6'
  return undefined
}

export class InterAccountHandler implements ImportHandler {
  readonly source = 'inter_account'

  identify(fileName: string, headers: string[]): boolean {
    const lowerName = fileName.toLowerCase()
    const nameMatch = lowerName.includes('inter') && !lowerName.includes('fatura') && !lowerName.includes('cartao')
    const headerMatch =
      headers.includes('Data') &&
      headers.includes('Histórico') &&
      headers.includes('Valor') &&
      headers.includes('Saldo')
    return nameMatch || headerMatch
  }

  parse(fileContent: string): RawRow[] {
    const { rows } = parseCSV(fileContent)
    return rows
  }

  normalize(rows: RawRow[], ctx: HandlerContext): NormalizedTransaction[] {
    const results: NormalizedTransaction[] = []
    const seenCounts = new Map<string, number>()

    for (const row of rows) {
      const rawDate = row['Data']
      const description = (row['Histórico'] ?? row['Historico'] ?? row['Descrição'] ?? '').trim()
      const rawValue = row['Valor']

      if (!rawDate || !rawValue || !description) continue

      const isoDate = parseBrazilianDate(rawDate)
      const signedAmount = parseMoney(rawValue)

      if (isNaN(signedAmount)) continue

      const absAmount = Math.abs(signedAmount)
      const direction = signedAmount >= 0 ? 'income' : 'expense'
      const type = detectType(description, signedAmount)

      const dupeKey = `${isoDate}|${description}|${signedAmount}`
      const occurrence = (seenCounts.get(dupeKey) ?? 0) + 1
      seenCounts.set(dupeKey, occurrence)

      const externalId = occurrence === 1
        ? hash(isoDate, description, signedAmount)
        : hash(isoDate, description, signedAmount, String(occurrence))

      results.push({
        source: this.source,
        external_id: externalId,
        date: isoDate,
        competency_month: toCompetencyMonth(isoDate),
        amount: absAmount,
        signed_amount: signedAmount,
        direction,
        type,
        description,
        context: 'personal',
        scope: 'individual',
        ...(type === 'credit_card_payment' ? { suggested_card_bank: guessCardBank(description) } : {}),
      })
    }

    return results
  }
}
