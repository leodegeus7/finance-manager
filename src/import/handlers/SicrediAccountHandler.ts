// ============================================================
// HANDLER — SICREDI CONTA (extrato OFX)
//
// Formato: OFX/SGML (BANKID 748 = Sicredi). Cada <STMTTRN> tem
//   <TRNTYPE> DEBIT|CREDIT|CHECK, <DTPOSTED> YYYYMMDD..., <TRNAMT> (com sinal),
//   <FITID> (id único do banco → idempotência perfeita), <MEMO> (descrição).
// Source: 'sicredi_account'
//
// Roteamento: identifica-se pelo conteúdo OFX (BANKID 748) e/ou nome com
// 'sicredi'. O ImportModal escolhe a conta Sicredi (guessAccount por bank).
//
// Overrides de tipo (mesma lógica da migração, p/ não inflar o fluxo):
//   APLICACAO FINANCEIRA (débito) → investment_contribution  (varredura p/ aplicação)
//   RESG.APLIC.FIN      (crédito) → investment_withdrawal
//   PAG. FATURA cartão            → credit_card_payment
//   resto: income/expense pelo sinal
// ============================================================

import { ImportHandler, HandlerContext, NormalizedTransaction, RawRow, TransactionType } from '../types'
import { toCompetencyMonth } from '../utils/date'
import { hash } from '../utils/hash'

const TYPE_RULES: Array<{ pattern: RegExp; type: TransactionType }> = [
  { pattern: /APLICACAO FINANCEIRA|APLIC\.?AUT|APLICACAO AUT/i, type: 'investment_contribution' },
  { pattern: /RESG\.?\s*APLIC|RESGATE.*APLIC/i,                 type: 'investment_withdrawal' },
  { pattern: /PAG\.?\s*FAT|PAGTO?\s*FATURA|PAGAMENTO FATURA/i,  type: 'credit_card_payment' },
]

function detectType(description: string, signed: number): TransactionType {
  for (const r of TYPE_RULES) if (r.pattern.test(description)) return r.type
  return signed >= 0 ? 'income' : 'expense'
}

/** Extrai o valor de uma tag OFX (com ou sem tag de fechamento). */
function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'))
  return m ? m[1].trim() : ''
}

export class SicrediAccountHandler implements ImportHandler {
  readonly source = 'sicredi_account'

  identify(fileName: string, headers: string[]): boolean {
    const name = fileName.toLowerCase()
    if (!name.endsWith('.ofx')) return false
    // OFX da Sicredi: BANKID 748 (código COMPE) ou nome com 'sicredi'.
    const text = headers.join('\n')
    return name.includes('sicredi') || /<BANKID>\s*748\b/.test(text) || /sicredi/i.test(text)
  }

  parse(fileContent: string): RawRow[] {
    const blocks = fileContent.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? []
    return blocks.map((b) => ({
      trntype:  tag(b, 'TRNTYPE'),
      dtposted: tag(b, 'DTPOSTED'),
      amount:   tag(b, 'TRNAMT'),
      fitid:    tag(b, 'FITID'),
      memo:     tag(b, 'MEMO') || tag(b, 'NAME'),
      checknum: tag(b, 'CHECKNUM'),
    }))
  }

  normalize(rows: RawRow[], ctx: HandlerContext): NormalizedTransaction[] {
    const results: NormalizedTransaction[] = []
    const seen = new Map<string, number>()

    for (const row of rows) {
      const d = (row['dtposted'] || '').slice(0, 8)         // YYYYMMDD
      if (!/^\d{8}$/.test(d)) continue
      const isoDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
      const signed = Number(row['amount'])
      if (!isFinite(signed) || signed === 0) continue

      const description = (row['memo'] || row['checknum'] || '(sem descrição)').trim()
      const amount = Math.abs(signed)
      const direction = signed >= 0 ? 'income' : 'expense'
      const type = detectType(description, signed)

      // external_id: FITID do banco (único). Fallback determinístico se faltar.
      let externalId = (row['fitid'] || '').trim()
      if (!externalId) {
        const key = `${isoDate}|${description}|${signed}`
        const occ = (seen.get(key) ?? 0) + 1
        seen.set(key, occ)
        externalId = hash(isoDate, description, signed, String(occ))
      }

      results.push({
        source: this.source,
        external_id: externalId,
        date: isoDate,
        competency_month: toCompetencyMonth(isoDate),
        amount,
        signed_amount: signed,
        direction,
        type,
        description,
        context: 'professional',
        scope: 'individual',
        suggested_context: 'professional',
      })
    }

    return results
  }
}
