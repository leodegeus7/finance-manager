// ============================================================
// TRANSACTIONS — UI Rule 4
// Goal: reduzir esforço manual
//
// - Upload → Classificação → Revisão → Conclusão (UI Rule 4.2)
// - Uncategorized first (UI Rule 4.5)
// - Inline editing (UI Rule 4.4)
// - Instant feedback, no reload (UI Rule 4.6)
// ============================================================

import { useState, useMemo, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { TransactionList } from '@/components/transactions/TransactionList'
import { ImportModal } from '@/components/import/ImportModal'
import { AddTransactionModal } from '@/components/transactions/AddTransactionModal'
import { applyFilters, computeCashFlow } from '@/engine/CashFlowEngine'
import { countUncategorized } from '@/engine/CategoryEngine'
import { formatCurrency, formatMonth } from '@/lib/format'
import { useTransactions } from '@/lib/hooks/useTransactions'
import { useCategories } from '@/lib/hooks/useCategories'
import { useAccounts } from '@/lib/hooks/useAccounts'
import { useUser } from '@/lib/UserContext'
import { deleteTransaction } from '@/lib/db/transactions'
import { OwedSummary } from '@/components/transactions/OwedSummary'

export function Transactions() {
  const { userId, userName, month, setMonth } = useUser()
  const { transactions, loading, error, handleUpdate, refetch } = useTransactions(month, userId)
  const { categories } = useCategories()
  const { accounts, cards } = useAccounts(userId, month)

  const [showImport, setShowImport]   = useState(false)
  const [showAdd, setShowAdd]         = useState(false)
  const [dragFile, setDragFile]       = useState<File | null>(null)
  const [isDragging, setIsDragging]   = useState(false)

  const handleDelete = useCallback(async (id: string) => {
    await deleteTransaction(id)
    refetch()
  }, [refetch])
  const [contextFilter, setContextFilter] = useState<'all' | 'personal' | 'professional'>('all')
  const [scopeFilter, setScopeFilter]     = useState<'all' | 'individual' | 'shared'>('all')
  const [sourceFilter, setSourceFilter]   = useState<'all' | 'card' | 'account'>('all')
  const [uncatOnly, setUncatOnly]         = useState(false)
  const [search, setSearch]               = useState('')

  const filtered = useMemo(() => {
    let txs = applyFilters(transactions, {
      month,
      context: contextFilter !== 'all' ? contextFilter : undefined,
      scope:   scopeFilter   !== 'all' ? scopeFilter   : undefined,
      include_transfers:   true,
      include_cc_payments: true,
    })
    if (sourceFilter === 'card')    txs = txs.filter((t) => !!t.credit_card_id)
    if (sourceFilter === 'account') txs = txs.filter((t) => !!t.account_id && !t.credit_card_id)
    if (uncatOnly) txs = txs.filter((t) => !t.category_id && t.type !== 'transfer' && t.type !== 'credit_card_payment')
    if (search.trim()) {
      const q = search.toLowerCase()
      txs = txs.filter((t) => t.description.toLowerCase().includes(q))
    }
    return txs
  }, [transactions, contextFilter, scopeFilter, sourceFilter, uncatOnly, search])

  // Cash flow only counts income/expense — excludes transfers & CC payments
  const cashFlowTxs = useMemo(() => applyFilters(filtered, {}), [filtered])
  const cashFlow    = useMemo(() => computeCashFlow(cashFlowTxs), [cashFlowTxs])
  const uncatCount  = useMemo(() => countUncategorized(cashFlowTxs), [cashFlowTxs])

  if (error) return (
    <div className="p-8 text-red-600 text-sm">Erro ao carregar transações: {error}</div>
  )

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transações</h1>
          <p className="text-sm text-gray-400 mt-0.5">{userName} · {formatMonth(month)}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="mt-1 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-700 transition-colors"
        >
          + Nova transação
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        <Card padding="sm">
          <p className="text-xs text-gray-400">Receita</p>
          <p className="text-lg font-bold text-green-600 tabular-nums mt-0.5">
            {formatCurrency(cashFlow.income)}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-gray-400">Despesas</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">
            {formatCurrency(cashFlow.expenses)}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-gray-400">Saldo</p>
          <p className={`text-lg font-bold tabular-nums mt-0.5 ${cashFlow.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(cashFlow.balance)}
          </p>
        </Card>
      </div>

      {/* Cobranças do mês */}
      <OwedSummary transactions={filtered} payerUserId={userId} />

      {/* Import CTA — click or drag-and-drop directly */}
      <div
        className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-200 hover:border-gray-300'
        }`}
        onClick={() => setShowImport(true)}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) { setDragFile(f); setShowImport(true) }
        }}
      >
        <p className={`text-sm font-medium ${isDragging ? 'text-blue-600' : 'text-gray-600'}`}>
          {isDragging ? 'Solte o arquivo aqui' : 'Importar extrato'}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Arraste um arquivo ou clique · CSV · Nubank, C6 · PDF · Inter
        </p>
      </div>

      {showImport && (
        <ImportModal
          userId={userId}
          accounts={accounts}
          cards={cards}
          categories={categories}
          initialFile={dragFile ?? undefined}
          onClose={() => { setShowImport(false); setDragFile(null) }}
          onSuccess={(importedMonth) => {
            setShowImport(false)
            setDragFile(null)
            if (importedMonth && importedMonth !== month) setMonth(importedMonth)
            else refetch()
          }}
        />
      )}

      {showAdd && (
        <AddTransactionModal
          userId={userId}
          accounts={accounts}
          cards={cards}
          categories={categories}
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); refetch() }}
        />
      )}

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Buscar descrição..."
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 flex-1 min-w-32 focus:outline-none focus:ring-1 focus:ring-gray-300"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {/* Context toggle — UI Rule 7.1 */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
            {(['all','personal','professional'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setContextFilter(v)}
                className={`px-3 py-1 rounded-md transition-colors ${contextFilter === v ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {v === 'all' ? 'Tudo' : v === 'personal' ? 'Pessoal' : 'Profissional'}
              </button>
            ))}
          </div>

          {/* Scope toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
            {(['all','individual','shared'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setScopeFilter(v)}
                className={`px-3 py-1 rounded-md transition-colors ${scopeFilter === v ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {v === 'all' ? 'Tudo' : v === 'individual' ? 'Individual' : 'Compartilhado'}
              </button>
            ))}
          </div>

          {/* Source toggle — cartão / conta */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
            {(['all','card','account'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setSourceFilter(v)}
                className={`px-3 py-1 rounded-md transition-colors ${sourceFilter === v ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {v === 'all' ? 'Tudo' : v === 'card' ? 'Cartão' : 'Conta'}
              </button>
            ))}
          </div>

          {/* Uncategorized only */}
          <button
            onClick={() => setUncatOnly((v) => !v)}
            className={`text-xs px-3 py-1 rounded-lg border transition-colors font-medium ${
              uncatOnly
                ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            Sem categoria
          </button>
        </div>
      </Card>

      {/* Transaction list */}
      <Card padding="sm">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50">
          {loading ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : (
            <p className="text-sm text-gray-500">
              {filtered.length} transaç{filtered.length !== 1 ? 'ões' : 'ão'}
            </p>
          )}
          {uncatCount > 0 && (
            <p className="text-xs text-yellow-600 font-medium">
              {uncatCount} sem categoria
            </p>
          )}
        </div>
        <TransactionList
          transactions={filtered}
          categories={categories}
          accounts={accounts}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      </Card>
    </div>
  )
}
