// Linha-resumo de uma fatura de cartão na página Transações.
// Mostra o total da fatura, quantidade de transações e a faixa de datas
// reais das compras. Clique expande/recolhe a lista completa (cada
// transação mostra sua própria data via TransactionRow).
import { useState } from 'react'
import { Transaction } from '@/engine/types'
import { CardRow } from '@/lib/db/accounts'
import { TransactionList } from './TransactionList'
import { formatCurrency, formatDate, formatMonth } from '@/lib/format'

interface Category { id: string; name: string; parent_name?: string }
interface Account  { id: string; name: string }

interface Props {
  card: CardRow
  month: string
  transactions: Transaction[]
  categories: Category[]
  accounts?: Account[]
  onUpdate: (id: string, patch: Partial<Transaction> & { notes?: string | null }) => void
  onDelete?: (id: string) => void
}

export function CardInvoiceGroup({ card, month, transactions, categories, accounts, onUpdate, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false)

  // Expenses add to the invoice total; income (refunds/credits) reduce it —
  // same calculation as CardTransactionsModal.
  const total = transactions.reduce(
    (s, t) => (t.direction === 'expense' ? s + t.amount : s - t.amount), 0,
  )

  const dates = transactions.map((t) => t.date).sort()
  const minDate = dates[0]
  const maxDate = dates[dates.length - 1]

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`}
          >
            ▸
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {card.name} · Fatura de {formatMonth(month)}
            </p>
            <p className="text-xs text-gray-400 capitalize mt-0.5">
              {card.bank} · {transactions.length} transaç{transactions.length !== 1 ? 'ões' : 'ão'}
              {minDate && maxDate && (
                <> · {formatDate(minDate)}{minDate !== maxDate ? ` – ${formatDate(maxDate)}` : ''}</>
              )}
            </p>
          </div>
        </div>
        <p className="text-base font-bold tabular-nums text-gray-900 shrink-0 ml-3">
          {formatCurrency(total)}
        </p>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-2 pb-2">
          <TransactionList
            transactions={transactions}
            categories={categories}
            accounts={accounts}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  )
}
