// ============================================================
// HANDLER — SICREDI CARTÃO (fatura Visa, CSV)
//
// Formato: CSV com separador ';' e um PREÂMBULO de metadados antes do
// cabeçalho real das transações:
//   Associado ; ... / Cooperativa ; 0730 / Conta Corrente ; 90195-4
//   Cartão Visa Infinite / 4919....5118
//   Data de Vencimento ; 15/09/2026   <- vira o statement_month
//   Valor Total (R$) ; "R$ 57.959,40" <- validação
//   ...
//   Data ; Descrição ; Parcela ; Valor ; Valor em Dólar ; Adicional ; Nome
//   01/09/2026;Taxa De Anuidade;;"R$ 50,00";;;Alexandre...
//
// Source: 'sicredi_credit' (cartão). Precisa de ctx.creditCardId.
//
// Regras:
//   - Valor > 0  → compra (credit_card_purchase)
//   - Valor < 0  → crédito/estorno → income (neta o total, como na migração)
//   - "Pag Fat"/"Pagamento Fatura" → ignorado (pagamento da fatura anterior;
//     já contado no extrato da conta)
//   - Parcela "(01/02)" → installment_current/total
//   - statement_month = Data de Vencimento (ctx.statementMonth tem prioridade)
//   - external_id = hash(data, descrição, valor, parcela, cartão[, ocorrência])
// ============================================================

import { ImportHandler, HandlerContext, NormalizedTransaction, RawRow } from '../types'
import { parseBrazilianDate, toCompetencyMonth } from '../utils/date'
import { parseMoney } from '../utils/money'
import { hash } from '../utils/hash'

const HEADER_RE = /Data\s*;\s*Descri[çc][ãa]o\s*;\s*Parcela\s*;\s*Valor/i
const SKIP_RE   = /pag\.?\s*fat|pagamento\s*fatura/i
const PARCELA_RE = /\((\d{1,2})\s*\/\s*(\d{1,2})\)/

export class SicrediCreditHandler implements ImportHandler {
  readonly source = 'sicredi_credit'

  /** Mês da fatura a partir da "Data de Vencimento ;15/09/2026" → YYYY-MM-01. */
  static detectStatementMonth(content: string): string | undefined {
    const m = content.match(/Vencimento\s*;?\s*"?(\d{2})\/(\d{2})\/(\d{4})/i)
    return m ? `${m[3]}-${m[2]}-01` : undefined
  }

  identify(fileName: string, _headers: string[]): boolean {
    const name = fileName.toLowerCase()
    // OFX (conta) é tratado à parte; aqui é o CSV do cartão Sicredi.
    return name.includes('sicredi') && name.endsWith('.csv')
  }

  parse(fileContent: string): RawRow[] {
    const lines = fileContent.split(/\r?\n/)
    const start = lines.findIndex((l) => HEADER_RE.test(l))
    if (start === -1) return []

    const rows: RawRow[] = []
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line.trim()) continue
      // split simples por ';' (valores vêm entre aspas, sem ';' interno)
      const cols = line.split(';').map((c) => c.replace(/^"|"$/g, '').trim())
      if (cols.length < 4 || !/^\d{2}\/\d{2}\/\d{4}$/.test(cols[0])) continue
      rows.push({
        Data: cols[0], Descricao: cols[1], Parcela: cols[2], Valor: cols[3],
        Adicional: cols[5] ?? '', Nome: cols[6] ?? '',
      })
    }
    return rows
  }

  normalize(rows: RawRow[], ctx: HandlerContext): NormalizedTransaction[] {
    if (!ctx.creditCardId) throw new Error('SicrediCreditHandler requer um cartão (creditCardId).')
    const statementMonth = ctx.statementMonth
    const results: NormalizedTransaction[] = []
    const seen = new Map<string, number>()

    for (const row of rows) {
      const description = (row['Descricao'] ?? '').trim()
      const rawValue = row['Valor']
      if (!row['Data'] || !rawValue || !description) continue
      if (SKIP_RE.test(description)) continue   // pagamento da fatura anterior

      const isoDate = parseBrazilianDate(row['Data'])
      const value = parseMoney(rawValue)
      if (isNaN(value) || value === 0) continue

      const amount = Math.abs(value)
      // compra (valor>0) → despesa no cartão; crédito/estorno (valor<0) → income
      const isPurchase = value > 0
      const direction = isPurchase ? 'expense' : 'income'
      const type = isPurchase ? 'credit_card_purchase' : 'income'
      const signed = isPurchase ? -amount : amount

      const pm = (row['Parcela'] ?? '').match(PARCELA_RE)
      const installment_current = pm ? Number(pm[1]) : undefined
      const installment_total   = pm ? Number(pm[2]) : undefined

      const rawParcela = row['Parcela'] ?? ''
      const key = `${isoDate}|${description}|${amount}|${rawParcela}|${ctx.creditCardId}`
      const occ = (seen.get(key) ?? 0) + 1
      seen.set(key, occ)
      const externalId = occ === 1
        ? hash(isoDate, description, amount, rawParcela, ctx.creditCardId)
        : hash(isoDate, description, amount, rawParcela, ctx.creditCardId, String(occ))

      results.push({
        source: this.source,
        external_id: externalId,
        date: isoDate,
        competency_month: toCompetencyMonth(isoDate),
        statement_month: statementMonth,
        amount,
        signed_amount: signed,
        direction,
        type,
        description,
        context: 'professional',
        scope: 'individual',
        suggested_context: 'professional',
        credit_card_id: ctx.creditCardId,
        ...(installment_total ? { installment_current, installment_total } : {}),
      })
    }

    return results
  }
}
