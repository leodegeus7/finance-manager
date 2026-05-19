// ============================================================
// HANDLER 4 — INTER CREDIT CARD PDF (fatura)
//
// Input:  text extracted from Inter PDF (via extractPDFText())
// Source: 'inter_credit'
//
// Rules:
//   - Only "Despesas da fatura" section is processed
//   - "Próxima fatura" section is ignored
//   - Credits (+ sign) are ignored
//   - Encargos (MULTA, IOF, JUROS, ENCARGOS) are kept as expenses
//   - external_id = hash(date + description + amount + cardId)
//   - statement_month from caller context
//   - Validates extracted sum vs "Despesas do mês" total
// ============================================================

import { ImportHandler, HandlerContext, NormalizedTransaction, RawRow } from '../types'
import { hash } from '../utils/hash'
import { toCompetencyMonth } from '../utils/date'

const MONTH_MAP: Record<string, string> = {
  jan: '01', fev: '02', mar: '03', abr: '04',
  mai: '05', jun: '06', jul: '07', ago: '08',
  set: '09', out: '10', nov: '11', dez: '12',
}

// "14 de ago. 2025  EM DIA - PROGRAMA TV C (Parcela 02 de 02) - R$ 1.842,95"
// "13 de set. 2025  PGTO PIX - + R$ 3.326,57"
const TX_RE =
  /^(\d{1,2})\s+de\s+(\w+\.?)\s+(\d{4})\s+(.+?)\s+-\s+([+-]?)\s*R\$\s*([\d.]+,\d{2})\s*$/

// "(Parcela 02 de 03)" → "- Parcela 2/3"
const INSTALLMENT_RE = /\s*\(Parcela\s+0*(\d+)\s+de\s+0*(\d+)\)/g

// "Despesas do mês R$ 4.111,00"
const DESPESAS_RE = /Despesas do m[eê]s\s+R\$\s*([\d.]+,\d{2})/

function parseBRL(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.'))
}

function formatDate(day: string, monthAbbr: string, year: string): string {
  const m = MONTH_MAP[monthAbbr.toLowerCase().replace('.', '')] ?? '00'
  return `${year}-${m}-${day.padStart(2, '0')}`
}

function normalizeDescription(raw: string): string {
  return raw.replace(INSTALLMENT_RE, (_, cur, tot) => ` - Parcela ${+cur}/${+tot}`).trim()
}

export class InterCreditPDFHandler implements ImportHandler {
  readonly source = 'inter_credit'

  /** Identifies PDF files with "inter" in the filename */
  identify(fileName: string, _headers: string[]): boolean {
    const lower = fileName.toLowerCase()
    return lower.includes('inter') && lower.endsWith('.pdf')
  }

  /**
   * "parse" for the PDF handler receives the pre-extracted text
   * (each page separated by \n, lines reconstructed from Y positions).
   * Returns each transaction line as a RawRow with known keys.
   */
  parse(extractedText: string): RawRow[] {
    const rows: RawRow[] = []
    let inDespesas = false

    const lines = extractedText.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      if (line.includes('Próxima fatura')) break
      if (line.includes('Despesas da fatura')) { inDespesas = true; continue }
      if (!inDespesas) continue

      const m = TX_RE.exec(line)
      if (!m) continue

      const [, day, monthAbbr, year, description, sign, amountStr] = m
      if (sign === '+') continue  // ignore credits

      rows.push({
        date:        formatDate(day, monthAbbr, year),
        description: normalizeDescription(description),
        amount:      amountStr,
        sign,
      })
    }

    return rows
  }

  normalize(rows: RawRow[], ctx: HandlerContext): NormalizedTransaction[] {
    if (!ctx.creditCardId) {
      throw new Error('InterCreditPDFHandler requires creditCardId in context')
    }

    return rows.map((row) => {
      const isoDate    = row['date']
      const description = row['description']
      const amount     = parseBRL(row['amount'])
      const externalId = hash(isoDate, description, amount, ctx.creditCardId!)

      const statementMonth = ctx.statementMonth ?? toCompetencyMonth(isoDate)

      return {
        source:           this.source,
        external_id:      externalId,
        date:             isoDate,
        competency_month: toCompetencyMonth(isoDate),
        statement_month:  statementMonth,
        amount,
        signed_amount:    -amount,
        direction:        'expense',
        type:             'credit_card_purchase',
        description,
        context:          'personal',
        scope:            'individual',
      }
    })
  }

  /**
   * Validates extracted total vs "Despesas do mês" in the PDF text.
   * Returns { ok, extracted, expected, diff } — purely informational.
   */
  validateTotal(extractedText: string, transactions: NormalizedTransaction[]) {
    const m = DESPESAS_RE.exec(extractedText)
    const expected = m ? parseBRL(m[1]) : null
    const extracted = transactions.reduce((s, t) => s + t.amount, 0)
    const diff = expected != null ? Math.abs(extracted - expected) : null
    return {
      ok:        diff == null || diff < 0.02,
      extracted,
      expected,
      diff,
    }
  }
}
