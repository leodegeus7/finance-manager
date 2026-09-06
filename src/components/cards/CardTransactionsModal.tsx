// Modal de transações do cartão — abre ao clicar em um cartão em Contas & Cartões
// Permite editar categoria, contexto e escopo inline

import { useState, useEffect, useCallback } from 'react'
import { Transaction } from '@/engine/types'
import { fetchTransactionsByCard, updateTransaction, deleteTransaction } from '@/lib/db/transactions'
import { fetchCategories, CategoryRow } from '@/lib/db/categories'
import { TransactionList } from '@/components/transactions/TransactionList'
import { formatCurrency, formatMonth } from '@/lib/format'
import { CardRow } from '@/lib/db/accounts'
import { useUser } from '@/lib/UserContext'

interface Props {
  card: CardRow
  month: string       // YYYY-MM-01
  onClose: () => void
}

export function CardTransactionsModal({ card, month, onClose }: Props) {
  const { userId } = useUser()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories]     = useState<CategoryRow[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetchTransactionsByCard(card.id, month),
      fetchCategories(userId),
    ])
      .then(([txs, cats]) => {
        setTransactions(txs)
        setCategories(cats)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [card.id, month, userId])

  useEffect(() => { load() }, [load])

  const handleUpdate = useCallback(async (id: string, patch: Partial<Transaction>) => {
    // Optimistic update
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    )
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
      load() // revert on error
    }
  }, [load])

  const handleDelete = useCallback(async (id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id))
    try {
      await deleteTransaction(id)
    } catch {
      load()
    }
  }, [load])

  // Expenses add to the invoice total; income (refunds/credits) reduce it
  const total = transactions.reduce(
    (s, t) => t.direction === 'expense' ? s + t.amount : s - t.amount, 0
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{card.name}</h2>
            <p className="text-sm text-gray-400 mt-0.5 capitalize">
              {card.bank} · {formatMonth(month)}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-gray-400">Total fatura</p>
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
          {error ? (
            <p className="text-sm text-red-600 p-4">{error}</p>
          ) : loading ? (
            <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">
              Nenhuma transação nesta fatura
            </p>
          ) : (
            <TransactionList
              transactions={transactions}
              categories={categories}
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
