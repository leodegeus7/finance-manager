// ============================================================
// HANDLER 5 — C6 CREDIT CARD PDF (fatura protegida por senha)
//
// Input:  text extracted from the C6 invoice PDF (via extractPDFText()).
//         The PDF is password-protected — the modal collects the password
//         and passes it to extractPDFText before calling the pipeline.
// Source: 'c6_credit_pdf'
//
// Layout (one transaction per line, reconstructed by Y position):
//   "08 abr JIM.COM* LEANDRO ALVE - Parcela 3/4 1.020,00"     (nacional)
//   "05 jun SUPABASE  SI 238,75USD 45,00 | Cotação USD: R$5,31" (internacional)
//   "05 jun SUPABASE  SI 8,36IOF Transações Exterior"          (IOF)
//   "23 jun Estorno Tarifa - Estorno 98,00"                    (crédito)
//   "02 jun Pagamento Fatura QR CODE 16.052,72"                (ignorado)
// Datas vêm sem ano → inferido pela data de fechamento da fatura.
// ============================================================

import { ImportHandler, HandlerContext, NormalizedTransaction, RawRow } from '../types'
import { hash } from '../utils/hash'
import { toCompetencyMonth } from '../utils/date'

const MONTH_MAP: Record<string, string> = {
  jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
  jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
}

// Value may sit at end of line, OR be glued (no space) to a suffix:
//   "…238,75USD 45,00 | Cotação…"   → compra internacional
//   "…8,36IOF Transações Exterior"  → IOF da compra internacional
const TX_RE =
  /^(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})(USD.*|IOF.*)?$/i
const INSTALLMENT_RE = /-?\s*Parcela\s+0*(\d+)\s*\/\s*0*(\d+)/i
const USD_RE = /USD\s*([\d.]+,\d{2})/i
const CLOSE_RE = /fechamento desta fatura em\s*(\d{2})\/(\d{2})\/(\d{2})/i
const DUE_RE = /Vencimento:\s*(\d{2})\/(\d{2})\/(\d{4})/i
const TOTAL_RE = /Total a pagar\s*R\$\s*([\d.]+,\d{2})/i

function parseBRL(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.'))
}

function isInvoicePayment(desc: string): boolean {
  const l = desc.toLowerCase()
  return l.includes('pagamento fatura') || l.includes('pagamento de fatura') || l.startsWith('pagamento ')
}

/** Anchor date (YYYY-MM-DD) used to infer the year of each transaction. */
function anchorDate(text: string): string {
  const c = CLOSE_RE.exec(text)
  if (c) return `20${c[3]}-${c[2]}-${c[1]}`
  const d = DUE_RE.exec(text)
  if (d) return `${d[3]}-${d[2]}-${d[1]}`
  const now = new Date()
  return now.toISOString().slice(0, 10)
}

export class C6CreditPDFHandler implements ImportHandler {
  readonly source = 'c6_credit_pdf'

  /** PDF whose text contains C6 invoice markers (filename may lack a bank hint). */
  identify(fileName: string, headers: string[]): boolean {
    if (!fileName.toLowerCase().endsWith('.pdf')) return false
    return headers.some((h) => /c6\s*carbon|banco c6|cart[aã]o c6|c6\s*bank/i.test(h))
  }

  /** Receives the pre-extracted PDF text (lines separated by \n). */
  parse(extractedText: string): RawRow[] {
    const anchor = anchorDate(extractedText)
    const anchorYear = Number(anchor.slice(0, 4))

    const rows: RawRow[] = []
    for (const rawLine of extractedText.split('\n')) {
      const line = rawLine.trim()
      const m = TX_RE.exec(line)
      if (!m) continue

      const [, day, monAbbr, rawDesc, amountStr, suffix] = m
      let desc = rawDesc.replace(/\s+/g, ' ').trim()
      if (isInvoicePayment(desc)) continue

      const mm = MONTH_MAP[monAbbr.toLowerCase()]
      let iso = `${anchorYear}-${mm}-${day.padStart(2, '0')}`
      // Purchase can't be after the invoice closed → roll back a year (ex.: dez
      // numa fatura que fecha em jan).
      if (iso > anchor) iso = `${anchorYear - 1}-${mm}-${day.padStart(2, '0')}`

      const isIOF = !!suffix && /^iof/i.test(suffix)
      const isIntl = !!suffix && /^usd/i.test(suffix)

      const inst = INSTALLMENT_RE.exec(desc)
      if (inst) desc = desc.replace(INSTALLMENT_RE, '').replace(/\s+/g, ' ').replace(/[-\s]+$/, '').trim()

      if (isIntl) {
        const usd = USD_RE.exec(suffix!)
        if (usd) desc = `${desc} (US$ ${usd[1]})`
      }
      if (isIOF) desc = `${desc} - IOF Exterior`

      rows.push({
        date: iso,
        description: desc,
        amount: amountStr,
        credit: /estorno/i.test(desc) ? '1' : '',
        installment_current: inst ? String(parseInt(inst[1], 10)) : '',
        installment_total: inst ? String(parseInt(inst[2], 10)) : '',
      })
    }
    return rows
  }

  normalize(rows: RawRow[], ctx: HandlerContext): NormalizedTransaction[] {
    if (!ctx.creditCardId) {
      throw new Error('C6CreditPDFHandler requires creditCardId in context')
    }

    // Distinct external_id for legit same-day/desc/amount duplicates (e.g. two
    // identical bar charges) — mirrors C6CreditHandler.
    const seen = new Map<string, number>()
    const results: NormalizedTransaction[] = []

    for (const row of rows) {
      const isoDate = row['date']
      const description = row['description']
      const amount = parseBRL(row['amount'])
      if (isNaN(amount) || amount === 0) continue

      const isCredit = row['credit'] === '1'

      const dupeKey = `${isoDate}|${description}|${amount}`
      const occurrence = (seen.get(dupeKey) ?? 0) + 1
      seen.set(dupeKey, occurrence)
      const externalId = occurrence === 1
        ? hash(isoDate, description, amount, ctx.creditCardId)
        : hash(isoDate, description, amount, ctx.creditCardId, String(occurrence))

      const statementMonth = ctx.statementMonth ?? toCompetencyMonth(isoDate)

      const tx: NormalizedTransaction = {
        source: this.source,
        external_id: externalId,
        date: isoDate,
        competency_month: toCompetencyMonth(isoDate),
        statement_month: statementMonth,
        amount,
        signed_amount: isCredit ? amount : -amount,
        direction: isCredit ? 'income' : 'expense',
        type: isCredit ? 'income' : 'credit_card_purchase',
        description,
        context: 'personal',
        scope: 'individual',
      }

      const cur = parseInt(row['installment_current'] || '', 10)
      const tot = parseInt(row['installment_total'] || '', 10)
      if (!isCredit && cur >= 1 && tot >= 1 && cur <= tot) {
        tx.installment_current = cur
        tx.installment_total = tot
      }

      results.push(tx)
    }
    return results
  }

  /** Invoice month from the due date ("Vencimento: DD/MM/YYYY") → YYYY-MM-01. */
  static detectStatementMonth(text: string): string | null {
    const d = DUE_RE.exec(text)
    return d ? `${d[3]}-${d[2]}-01` : null
  }

  /** Net charged (expenses − credits) vs "Total a pagar R$ …" — informational. */
  validateTotal(text: string, transactions: NormalizedTransaction[]) {
    const m = TOTAL_RE.exec(text)
    const expected = m ? parseBRL(m[1]) : null
    const extracted = transactions.reduce(
      (s, t) => s + (t.direction === 'income' ? -t.amount : t.amount), 0,
    )
    const diff = expected != null ? Math.abs(extracted - expected) : null
    return { ok: diff == null || diff < 0.02, extracted, expected, diff }
  }
}
