// ============================================================
// TRANSACTIONS — UI Rule 4
// Goal: reduzir esforço manual
//
// - Upload → Classificação → Revisão → Conclusão (UI Rule 4.2)
// - Uncategorized first (UI Rule 4.5)
// - Inline editing (UI Rule 4.4)
// - Instant feedback, no reload (UI Rule 4.6)
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { TransactionList } from '@/components/transactions/TransactionList'
import { CardInvoiceGroup } from '@/components/transactions/CardInvoiceGroup'
import { ImportModal } from '@/components/import/ImportModal'
import { AddTransactionModal } from '@/components/transactions/AddTransactionModal'
import { applyFilters, computeCashFlow } from '@/engine/CashFlowEngine'
import { countUncategorized } from '@/engine/CategoryEngine'
import { effectiveMonth } from '@/engine/effectiveMonth'
import { formatCurrency, formatMonth } from '@/lib/format'
import { useTransactions } from '@/lib/hooks/useTransactions'
import { useCategories } from '@/lib/hooks/useCategories'
import { useAccounts } from '@/lib/hooks/useAccounts'
import { useUser } from '@/lib/UserContext'
import { deleteTransaction } from '@/lib/db/transactions'
import { CardRow } from '@/lib/db/accounts'
import { OwedSummary } from '@/components/transactions/OwedSummary'

export function Transactions() {
  const { userId, userName, month, setMonth, isFazenda } = useUser()
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
  // Filtros iniciais podem vir da navegação (widget "sem categoria" da Dashboard):
  //   ?uncat=1&cardId=<id>  ou  ?uncat=1&accountId=<id>
  const [searchParams, setSearchParams] = useSearchParams()
  const [contextFilter, setContextFilter] = useState<'all' | 'personal' | 'professional'>('all')
  const [scopeFilter, setScopeFilter]     = useState<'all' | 'individual' | 'shared'>('all')
  const [sourceFilter, setSourceFilter]   = useState<'all' | 'card' | 'account'>('all')
  const [uncatOnly, setUncatOnly]         = useState(() => searchParams.get('uncat') === '1')
  const [focusCardId, setFocusCardId]     = useState<string | null>(() => searchParams.get('cardId'))
  const [focusAccountId, setFocusAccountId] = useState<string | null>(() => searchParams.get('accountId'))
  const [search, setSearch]               = useState('')

  // Consome os parâmetros de navegação uma vez e limpa a URL, para o filtro
  // não "grudar" depois que o usuário o remove.
  useEffect(() => {
    if (searchParams.toString()) setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const focusName = focusCardId
    ? cards.find((c) => c.id === focusCardId)?.name ?? 'Cartão'
    : focusAccountId
    ? accounts.find((a) => a.id === focusAccountId)?.name ?? 'Conta'
    : null

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
    if (focusCardId)         txs = txs.filter((t) => t.credit_card_id === focusCardId)
    else if (focusAccountId) txs = txs.filter((t) => t.account_id === focusAccountId && !t.credit_card_id)
    if (uncatOnly) txs = txs.filter((t) => !t.category_id && t.type !== 'transfer' && t.type !== 'credit_card_payment')
    if (search.trim()) {
      const q = search.toLowerCase()
      txs = txs.filter((t) => t.description.toLowerCase().includes(q))
    }
    return txs
  }, [transactions, contextFilter, scopeFilter, sourceFilter, focusCardId, focusAccountId, uncatOnly, search])

  // Cash flow only counts income/expense — excludes transfers & CC payments
  const cashFlowTxs = useMemo(() => applyFilters(filtered, {}), [filtered])
  const cashFlow    = useMemo(() => computeCashFlow(cashFlowTxs), [cashFlowTxs])
  const uncatCount  = useMemo(() => countUncategorized(cashFlowTxs), [cashFlowTxs])

  // Credit card transactions are grouped into one row per invoice
  // (card + effective month), expandable to show every individual purchase
  // with its real date. Account/manual transactions stay in the flat list.
  const cardGroups = useMemo(() => {
    const map = new Map<string, { card: CardRow; month: string; transactions: typeof filtered }>()
    for (const tx of filtered) {
      if (!tx.credit_card_id) continue
      const month = effectiveMonth(tx)
      const key = `${tx.credit_card_id}|${month}`
      let group = map.get(key)
      if (!group) {
        const card = cards.find((c) => c.id === tx.credit_card_id) ?? {
          id: tx.credit_card_id, name: 'Cartão', bank: '', invoice_total: 0, invoice_paid: 0, status: 'open' as const,
        }
        group = { card, month, transactions: [] }
        map.set(key, group)
      }
      group.transactions.push(tx)
    }
    const groupTotal = (g: { transactions: typeof filtered }) =>
      g.transactions.reduce((s, t) => (t.direction === 'expense' ? s + t.amount : s - t.amount), 0)
    return [...map.values()].sort((a, b) => {
      if (a.month !== b.month) return b.month.localeCompare(a.month)
      return groupTotal(b) - groupTotal(a)
    })
  }, [filtered, cards])

  const accountTxs = useMemo(() => filtered.filter((t) => !t.credit_card_id), [filtered])

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

      {/* Cobranças do mês — só faz sentido para o casal (não na fazenda) */}
      {!isFazenda && <OwedSummary transactions={filtered} payerUserId={userId} />}

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
          Arraste um arquivo ou clique · CSV · Nubank, C6 · PDF · Inter · OFX/CSV · Sicredi
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

          {/* Scope toggle (individual/compartilhado) — conceito de casal, some na fazenda */}
          {!isFazenda && (
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
          )}

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

      {/* Filtro ativo vindo do widget da Dashboard (conta/cartão específico) */}
      {focusName && (
        <div className="flex items-center gap-2 -mt-2">
          <span className="inline-flex items-center gap-2 text-xs bg-gray-900 text-white pl-3 pr-2 py-1.5 rounded-lg">
            {focusCardId ? 'Cartão' : 'Conta'}: <span className="font-medium">{focusName}</span>
            <button
              onClick={() => { setFocusCardId(null); setFocusAccountId(null) }}
              className="text-gray-400 hover:text-white transition-colors"
              title="Remover filtro"
            >
              ✕
            </button>
          </span>
        </div>
      )}

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

        {/* Cartões — uma linha por fatura, expansível */}
        {sourceFilter !== 'account' && cardGroups.length > 0 && (
          <div className="p-2 space-y-2">
            {cardGroups.map((g) => (
              <CardInvoiceGroup
                key={`${g.card.id}|${g.month}`}
                card={g.card}
                month={g.month}
                transactions={g.transactions}
                categories={categories}
                accounts={accounts}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* Conta — lista plana */}
        {sourceFilter !== 'card' && (accountTxs.length > 0 || cardGroups.length === 0) && (
          <TransactionList
            transactions={accountTxs}
            categories={categories}
            accounts={accounts}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        )}
      </Card>
    </div>
  )
}
