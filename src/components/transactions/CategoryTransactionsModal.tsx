// Casal — modal de drill-down: transações compartilhadas de uma categoria no mês
import { useState, useCallback } from 'react'
import { Transaction } from '@/engine/types'
import { updateTransaction, deleteTransaction } from '@/lib/db/transactions'
import { useCategories } from '@/lib/hooks/useCategories'
import { TransactionList } from './TransactionList'
import { formatCurrency, formatMonth } from '@/lib/format'

interface Props {
  categoryName: string
  month: string
  transactions: Transaction[]
  /** Optional map of user_id → display name. When provided, shows who paid. */
  userNames?: Record<string, string>
  /** Text shown after the month in the subtitle (e.g. "compartilhado"). Defaults to "compartilhado". */
  subtitle?: string
  onClose: () => void
  /** Notify the parent so it can keep its own copy of the data in sync */
  onUpdate?: (id: string, patch: Partial<Transaction> & { notes?: string | null }) => void
  onDelete?: (id: string) => void
}

export function CategoryTransactionsModal({
  categoryName, month, transactions: initial, userNames, subtitle = 'compartilhado', onClose, onUpdate, onDelete,
}: Props) {
  const [transactions, setTransactions] = useState(initial)
  const { categories } = useCategories()

  const total = transactions.reduce((s, t) => s + t.amount, 0)

  const handleUpdate = useCallback(async (id: string, patch: Partial<Transaction> & { notes?: string | null }) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    onUpdate?.(id, patch)
    try {
      await updateTransaction(id, {
        category_id: patch.category_id,
        context:     patch.context,
        scope:       patch.scope,
        splits:      patch.splits,
        notes:       patch.notes,
        fixed_type:  patch.fixed_type,
      })
    } catch {
      setTransactions(initial)
    }
  }, [initial, onUpdate])

  const handleDelete = useCallback(async (id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id))
    onDelete?.(id)
    try {
      await deleteTransaction(id)
    } catch {
      setTransactions(initial)
    }
  }, [initial, onDelete])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{categoryName}</h2>
            <p className="text-sm text-gray-400 mt-0.5 capitalize">
              {formatMonth(month)} · {subtitle}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-lg font-bold text-gray-900 tabular-nums">
                {formatCurrency(total)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5"
            >×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {transactions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">
              Nenhuma transação nesta categoria
            </p>
          ) : (
            <TransactionList
              transactions={transactions}
              categories={categories}
              userNames={userNames}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 pt-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full border border-gray-200 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
