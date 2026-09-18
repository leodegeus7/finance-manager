// Exporta as transações de um mês (com categoria) pra CSV — separador ";",
// decimal com vírgula e BOM UTF-8, pra abrir direto no Excel pt-BR.
import { Transaction } from '@/engine/types'
import { effectiveMonth } from '@/engine/effectiveMonth'

export type CsvSource = 'conta' | 'cartao'

function cell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function money(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function exportTransactionsCsv(
  txs: Transaction[],
  month: string,
  source: CsvSource,
  names: Record<string, string>,
): boolean {
  const rows = txs
    .filter((t) => (source === 'cartao' ? t.credit_card_id != null : t.credit_card_id == null))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (rows.length === 0) return false

  const header = [
    'Data', 'Descrição', 'Descrição customizada', 'Categoria', 'Tipo', 'Contexto',
    'Valor', source === 'cartao' ? 'Cartão' : 'Conta', 'Mês da fatura', 'Parcela',
  ]
  const lines = rows.map((t) => [
    fmtDate(t.date),
    t.description,
    t.notes ?? '',
    t.category_name ?? '',
    t.type,
    t.context === 'personal' ? 'Pessoal' : 'Profissional',
    money(t.direction === 'expense' ? -t.amount : t.amount),
    names[(t.credit_card_id ?? t.account_id) as string] ?? '',
    t.credit_card_id ? effectiveMonth(t).slice(0, 7) : '',
    t.installment_current != null && t.installment_total != null
      ? `${t.installment_current}/${t.installment_total}` : '',
  ].map(cell).join(';'))

  const csv = '﻿' + [header.map(cell).join(';'), ...lines].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `transacoes-${source}-${month.slice(0, 7)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return true
}
