// UI Rule 4.4 — edição inline: clicar e editar direto, sem modal pesado
// UI Rule 4.6 — mudanças instantâneas, sem reload
import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { Transaction, SplitParticipant } from '@/engine/types'
import { formatCurrency, formatDate } from '@/lib/format'
import { SplitEditor, splitBadge } from './SplitEditor'
import { filterCategories } from '@/lib/db/categories'
import { CategorySelect } from '@/components/ui/CategorySelect'

interface Category {
  id: string
  name: string
  parent_name?: string
}

interface Account {
  id: string
  name: string
}

interface Props {
  tx: Transaction
  categories: Category[]
  accounts?: Account[]
  onUpdate: (id: string, patch: Partial<Pick<Transaction, 'type' | 'category_id' | 'context' | 'scope' | 'splits' | 'notes' | 'to_account_id'>>) => void
  onDelete?: (id: string) => void
}

export function TransactionRow({ tx, categories, accounts, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [categoryId, setCategoryId] = useState(tx.category_id ?? '')
  const [context, setContext] = useState(tx.context)
  const [splits, setSplits] = useState<SplitParticipant[] | null>(tx.splits ?? null)
  const [toAccountId, setToAccountId] = useState(tx.to_account_id ?? '')
  const [isTransferEdit, setIsTransferEdit] = useState(
    tx.type === 'transfer' || tx.type === 'credit_card_payment'
  )
  const rowRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!editing) return
    function handleClick(e: MouseEvent) {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        handleSave()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [editing, categoryId, context, splits])

  function handleSave() {
    setEditing(false)
    if (isTransferEdit) {
      onUpdate(tx.id, {
        type: 'transfer',
        category_id: undefined,
        splits: null,
        to_account_id: toAccountId || null,
      })
    } else {
      const inferredType = tx.direction === 'income' ? 'income' : 'expense'
      onUpdate(tx.id, {
        type: (tx.type === 'transfer' || tx.type === 'credit_card_payment') ? inferredType : tx.type,
        category_id: categoryId || undefined,
        context,
        splits,
        to_account_id: null,
      })
    }
  }

  const isExpense = tx.direction === 'expense'
  const isTransfer = tx.type === 'transfer' || tx.type === 'credit_card_payment'
  const isUncategorized = !tx.category_id && !isTransfer
  const categoryLabel = categories.find((c) => c.id === tx.category_id)?.name ?? null
  const filteredCategories = filterCategories(categories, tx.direction)

  return (
    <div
      ref={rowRef}
      className={clsx(
        'group flex items-start gap-3 px-4 py-3 rounded-xl transition-colors cursor-pointer',
        editing ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50',
        isTransfer && !editing && 'opacity-60',
        isUncategorized && !editing && 'border-l-2 border-l-yellow-400',
      )}
      onClick={() => !editing && setEditing(true)}
    >
      {/* Date */}
      <span className="text-xs text-gray-400 tabular-nums w-10 shrink-0 mt-0.5">
        {formatDate(tx.date)}
      </span>

      {/* Description + category */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{tx.description}</p>

        {editing ? (
          <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
            {/* Toggle transferência / despesa-receita */}
            <button
              onClick={() => setIsTransferEdit((v) => !v)}
              className={`text-xs px-2 py-1 rounded-lg border transition-colors font-medium ${
                isTransferEdit
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
              }`}
            >
              ⇄ Transferência
            </button>

            {isTransferEdit ? (
              /* Destino da transferência */
              accounts && accounts.length > 0 && (
                <select
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                >
                  <option value="">Conta destino...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )
            ) : (
              /* Classificação normal */
              <>
                <div className="flex flex-wrap gap-2">
                  <CategorySelect
                    className="flex-1 min-w-0"
                    inputClassName="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={categoryId}
                    onChange={setCategoryId}
                    categories={filteredCategories}
                    placeholder="Sem categoria"
                    autoFocus={!isTransfer}
                  />

                  <select
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={context}
                    onChange={(e) => setContext(e.target.value as typeof context)}
                  >
                    <option value="personal">Pessoal</option>
                    <option value="professional">Profissional</option>
                  </select>
                </div>

                <SplitEditor
                  splits={splits}
                  payerUserId={tx.user_id}
                  onChange={setSplits}
                />
              </>
            )}

            <button
              className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg font-medium hover:bg-blue-700"
              onClick={(e) => { e.stopPropagation(); handleSave() }}
            >
              Salvar
            </button>
          </div>
        ) : isTransfer ? (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-400 font-medium">
              {tx.type === 'credit_card_payment' ? 'pag. fatura' : 'transferência'}
            </span>
            {tx.to_account_id && accounts && (
              <span className="text-xs text-gray-400">
                → {accounts.find((a) => a.id === tx.to_account_id)?.name ?? tx.to_account_id}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {categoryLabel ? (
              <span className="text-xs text-gray-500">{categoryLabel}</span>
            ) : (
              <span className="text-xs text-yellow-600 font-medium">Categorizar →</span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded-md ${
              tx.context === 'professional'
                ? 'bg-gray-100 text-gray-500'
                : 'bg-gray-50 text-gray-400'
            }`}>
              {tx.context === 'professional' ? 'profissional' : 'pessoal'}
            </span>
            {(() => {
              const badge = splitBadge(tx.splits, tx.user_id)
              return (
                <span className={`text-xs px-1.5 py-0.5 rounded-md ${badge.style}`}>
                  {badge.label}
                </span>
              )
            })()}
            {tx.installment_current != null && tx.installment_total != null && (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-500 font-medium tabular-nums">
                {tx.installment_current}/{tx.installment_total}
              </span>
            )}
            {tx.credit_card_id ? (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-400">cartão</span>
            ) : tx.account_id ? (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-50 text-gray-400">conta</span>
            ) : null}
          </div>
        )}
      </div>

      {/* Amount + delete */}
      <div className="flex items-center gap-2 shrink-0 mt-0.5">
        <span
          className={clsx(
            'text-sm font-semibold tabular-nums',
            isExpense ? 'text-gray-900' : 'text-green-600',
          )}
        >
          {isExpense ? '-' : '+'}{formatCurrency(tx.amount)}
        </span>

        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(tx.id)
            }}
            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-base leading-none w-4 text-center"
            title="Deletar transação"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
