// ============================================================
// CASAL — análise mensal de gastos compartilhados + histórico de divisão
//
// - Topo: total de despesas compartilhadas do mês selecionado + gráfico
//   de barras por categoria (clicável → drill-down de transações)
// - Gastos fixos do mês (qualquer transação pessoal marcada como "fixa",
//   mesmo que não dividida com o parceiro)
// - Gráfico dia a dia dos gastos compartilhados, subdividido por categoria
// - Abaixo: histórico mês a mês (desde COUPLE_START_MONTH) de quanto cada
//   um pagou e o resultado da divisão (quem deve quanto a quem)
//
// Apenas transações com context === 'personal' entram nesta análise —
// despesas profissionais são excluídas mesmo que compartilhadas.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { Card, CardTitle } from '@/components/ui/Card'
import { SharedCategoryBarChart } from '@/components/charts/SharedCategoryBarChart'
import { DailySpendingChart } from '@/components/charts/DailySpendingChart'
import { CategoryTransactionsModal } from '@/components/transactions/CategoryTransactionsModal'
import { formatCurrency, formatMonth, monthRange } from '@/lib/format'
import { useUser } from '@/lib/UserContext'
import { fetchPersonalTransactionsByMonth } from '@/lib/db/transactions'
import { fetchAssets, createAsset, updateAssetValue } from '@/lib/db/networth'
import { fetchAccounts, AccountRow } from '@/lib/db/accounts'
import { Asset, AssetType } from '@/investments/types'
import { Transaction } from '@/engine/types'
import {
  COUPLE_START_MONTH,
  getSharedExpenses,
  getFixedExpenses,
  computeSharedCategoryBreakdown,
  computeCoupleMonthSummary,
  CoupleMonthSummary,
} from '@/couple/CoupleEngine'

const USER_NAMES: Record<string, string> = { leo: 'Leonardo', murilo: 'Murilo' }

async function fetchSharedTransactions(month: string): Promise<Transaction[]> {
  const [leoTxs, muriloTxs] = await Promise.all([
    fetchPersonalTransactionsByMonth(month, 'leo'),
    fetchPersonalTransactionsByMonth(month, 'murilo'),
  ])
  return [...leoTxs, ...muriloTxs].filter((tx) => tx.context === 'personal')
}

export function Casal() {
  const { userId, month } = useUser()

  // ── Análise do mês selecionado ──────────────────────────────
  const [monthTxs, setMonthTxs] = useState<Transaction[]>([])
  const [monthLoading, setMonthLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<{ id: string; name: string } | null>(null)
  const [showFixedModal, setShowFixedModal] = useState(false)

  useEffect(() => {
    setMonthLoading(true)
    fetchSharedTransactions(month)
      .then(setMonthTxs)
      .catch(() => setMonthTxs([]))
      .finally(() => setMonthLoading(false))
  }, [month])

  const sharedExpenses = useMemo(() => getSharedExpenses(monthTxs, month), [monthTxs, month])
  const total = useMemo(() => sharedExpenses.reduce((s, tx) => s + tx.amount, 0), [sharedExpenses])
  const categoryBreakdown = useMemo(
    () => computeSharedCategoryBreakdown(monthTxs, month, ['leo', 'murilo']),
    [monthTxs, month],
  )

  // Gastos fixos do mês — qualquer transação pessoal marcada como "fixa",
  // mesmo que não esteja dividida com o parceiro (ex: aluguel pago só por um)
  const fixedExpenses = useMemo(() => getFixedExpenses(monthTxs, month), [monthTxs, month])
  const fixedTotal = useMemo(() => fixedExpenses.reduce((s, tx) => s + tx.amount, 0), [fixedExpenses])

  const selectedTxs = useMemo(() => {
    if (!selectedCategory) return []
    return sharedExpenses.filter(
      (tx) => (tx.category_id ?? '__uncategorized__') === selectedCategory.id,
    )
  }, [sharedExpenses, selectedCategory])

  const handleCategoryClick = (categoryId: string) => {
    const cat = categoryBreakdown.find((c) => c.category_id === categoryId)
    if (!cat) return
    setSelectedCategory({ id: cat.category_id, name: cat.category_name })
  }

  // Keep monthTxs in sync after edits made inside the drill-down modal
  const handleTxUpdate = (id: string, patch: Partial<Transaction> & { notes?: string | null }) => {
    setMonthTxs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }
  const handleTxDelete = (id: string) => {
    setMonthTxs((prev) => prev.filter((t) => t.id !== id))
  }

  // ── Histórico de divisão (desde COUPLE_START_MONTH) ─────────
  const historyMonths = useMemo(
    () => monthRange(COUPLE_START_MONTH, month).reverse(),
    [month],
  )
  const [history, setHistory] = useState<(CoupleMonthSummary & { transactions: Transaction[] })[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [selectedHistorySelection, setSelectedHistorySelection] = useState<{ month: string; userId?: string } | null>(null)

  useEffect(() => {
    setHistoryLoading(true)
    Promise.all(
      historyMonths.map((m) =>
        fetchSharedTransactions(m).then((txs) => ({
          ...computeCoupleMonthSummary(txs, m),
          transactions: getSharedExpenses(txs, m),
        })),
      ),
    )
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyMonths.join(',')])

  const handleHistoryTxUpdate = (id: string, patch: Partial<Transaction> & { notes?: string | null }) => {
    setHistory((prev) => prev.map((h) => ({
      ...h,
      transactions: h.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })))
  }
  const handleHistoryTxDelete = (id: string) => {
    setHistory((prev) => prev.map((h) => ({
      ...h,
      transactions: h.transactions.filter((t) => t.id !== id),
    })))
  }

  const selectedHistory = useMemo(
    () => history.find((h) => h.month === selectedHistorySelection?.month) ?? null,
    [history, selectedHistorySelection],
  )

  const selectedHistoryTxs = useMemo(() => {
    if (!selectedHistory) return []
    if (!selectedHistorySelection?.userId) return selectedHistory.transactions
    return selectedHistory.transactions.filter((tx) => tx.user_id === selectedHistorySelection.userId)
  }, [selectedHistory, selectedHistorySelection])

  // ── Patrimônio do casal (ativos compartilhados) ─────────────
  const [sharedAssets, setSharedAssets] = useState<Asset[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [assetsLoading, setAssetsLoading] = useState(true)

  const loadAssets = () => {
    setAssetsLoading(true)
    Promise.all([fetchAssets(userId), fetchAccounts(userId)])
      .then(([assets, accs]) => {
        setSharedAssets(assets.filter((a) => a.is_shared))
        setAccounts(accs)
      })
      .catch(() => { setSharedAssets([]); setAccounts([]) })
      .finally(() => setAssetsLoading(false))
  }

  useEffect(loadAssets, [userId])

  const [showAddAsset, setShowAddAsset] = useState(false)
  const [assetName, setAssetName] = useState('')
  const [assetType, setAssetType] = useState<AssetType>('financial')
  const [assetValue, setAssetValue] = useState('')
  const [linkToAccount, setLinkToAccount] = useState(false)
  const [assetAccountId, setAssetAccountId] = useState('')
  const [savingAsset, setSavingAsset] = useState(false)
  const [assetError, setAssetError] = useState('')

  async function handleAddAsset() {
    if (!assetName.trim()) return
    setSavingAsset(true)
    setAssetError('')
    try {
      await createAsset(userId, {
        name: assetName.trim(),
        type: assetType,
        current_value: parseFloat(assetValue.replace(',', '.')) || 0,
        linked_account_id: linkToAccount ? (assetAccountId || null) : null,
        is_shared: true,
      })
      setAssetName(''); setAssetValue(''); setLinkToAccount(false); setAssetAccountId('')
      setShowAddAsset(false)
      loadAssets()
    } catch (e) {
      setAssetError(String(e))
    } finally {
      setSavingAsset(false)
    }
  }

  // ── Editar valor de um ativo ─────────────────────────────────
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null)
  const [editAssetValue, setEditAssetValue] = useState('')
  const [savingEditAsset, setSavingEditAsset] = useState(false)

  function startEditAsset(assetId: string, currentValue: number) {
    setEditingAssetId(assetId)
    setEditAssetValue(String(currentValue).replace('.', ','))
  }

  async function handleSaveAssetValue(assetId: string) {
    setSavingEditAsset(true)
    try {
      await updateAssetValue(assetId, parseFloat(editAssetValue.replace(',', '.')) || 0)
      setEditingAssetId(null)
      loadAssets()
    } finally {
      setSavingEditAsset(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Casal</h1>
        <p className="text-sm text-gray-400 mt-0.5">{formatMonth(month)} · gastos compartilhados</p>
      </div>

      {/* Total do mês */}
      <Card padding="lg">
        <CardTitle>Despesas compartilhadas do mês</CardTitle>
        {monthLoading ? (
          <p className="text-sm text-gray-400 mt-2">Carregando...</p>
        ) : (
          <div className="flex items-end gap-3 mt-2">
            <span className="text-5xl font-bold text-gray-900 tabular-nums">
              {formatCurrency(total)}
            </span>
            <span className="text-sm text-gray-400 mb-1">
              {sharedExpenses.length} transaç{sharedExpenses.length !== 1 ? 'ões' : 'ão'}
            </span>
          </div>
        )}
      </Card>

      {/* Gastos fixos do mês */}
      <Card padding="md" onClick={!monthLoading && fixedExpenses.length > 0 ? () => setShowFixedModal(true) : undefined}>
        <CardTitle>Gastos fixos do mês</CardTitle>
        {monthLoading ? (
          <p className="text-sm text-gray-400 mt-2">Carregando...</p>
        ) : fixedExpenses.length === 0 ? (
          <p className="text-sm text-gray-400 mt-2">Nenhum gasto marcado como fixo neste mês</p>
        ) : (
          <div className="flex items-end gap-3 mt-2">
            <span className="text-3xl font-bold text-gray-900 tabular-nums">
              {formatCurrency(fixedTotal)}
            </span>
            <span className="text-sm text-gray-400 mb-0.5">
              {fixedExpenses.length} transaç{fixedExpenses.length !== 1 ? 'ões' : 'ão'} · clique para ver
            </span>
          </div>
        )}
      </Card>

      {/* Patrimônio do casal */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Patrimônio do casal
          </h2>
          <button
            onClick={() => setShowAddAsset((v) => !v)}
            className="text-xs text-blue-600 font-medium hover:underline"
          >
            {showAddAsset ? 'Cancelar' : '+ Adicionar ativo'}
          </button>
        </div>

        {showAddAsset && (
          <Card padding="md">
            <p className="text-xs font-medium text-gray-500 mb-3">Novo ativo compartilhado</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Nome</label>
                <input
                  type="text"
                  placeholder="Ex: Investimento XP"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Tipo</label>
                <select
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value as AssetType)}
                >
                  <option value="financial">Financeiro</option>
                  <option value="real">Real</option>
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="text-xs text-gray-400 block mb-1">Valor atual (R$)</label>
              <input
                type="text"
                placeholder="0,00"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300"
                value={assetValue}
                onChange={(e) => setAssetValue(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={linkToAccount}
                  onChange={(e) => setLinkToAccount(e.target.checked)}
                />
                Esse valor já faz parte do saldo de uma conta (não somar no patrimônio)
              </label>
              {linkToAccount && (
                <select
                  className="mt-2 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
                  value={assetAccountId}
                  onChange={(e) => setAssetAccountId(e.target.value)}
                >
                  <option value="">Selecione uma conta</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
              )}
              {!linkToAccount && (
                <p className="text-xs text-gray-400 mt-1">
                  Vai contar como patrimônio separado, compartilhado com o casal
                </p>
              )}
            </div>

            {assetError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-2">{assetError}</p>
            )}
            <button
              onClick={handleAddAsset}
              disabled={savingAsset || !assetName.trim() || (linkToAccount && !assetAccountId)}
              className="w-full bg-gray-900 text-white text-sm font-medium py-2 rounded-xl disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              {savingAsset ? 'Salvando...' : 'Salvar ativo'}
            </button>
          </Card>
        )}

        {assetsLoading ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : sharedAssets.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-gray-400 text-center py-2">Nenhum ativo compartilhado cadastrado</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {sharedAssets.map((asset) => {
              const owner = USER_NAMES[asset.user_id] ?? asset.user_id
              return (
                <Card key={asset.id} padding="md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{asset.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">
                        {asset.type === 'financial' ? 'Financeiro' : 'Real'} · de {owner}
                      </p>
                    </div>
                    {editingAssetId === asset.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          autoFocus
                          className="w-24 text-sm text-right border border-gray-200 rounded-lg px-2 py-1 tabular-nums focus:outline-none focus:ring-1 focus:ring-gray-300"
                          value={editAssetValue}
                          onChange={(e) => setEditAssetValue(e.target.value)}
                        />
                        <button
                          onClick={() => handleSaveAssetValue(asset.id)}
                          disabled={savingEditAsset}
                          className="text-xs text-blue-600 font-medium hover:underline disabled:opacity-40"
                        >
                          OK
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditAsset(asset.id, asset.current_value)}
                        className="text-base font-bold tabular-nums text-gray-900 hover:underline"
                      >
                        {formatCurrency(asset.current_value)}
                      </button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* Categorias */}
      <Card padding="md">
        <CardTitle>Gastos por categoria</CardTitle>
        <p className="text-xs text-gray-400 -mt-0.5 mb-2">Clique em uma categoria para ver as transações</p>
        <div className="mt-4">
          {!monthLoading && (
            <SharedCategoryBarChart data={categoryBreakdown} onCategoryClick={handleCategoryClick} />
          )}
        </div>
      </Card>

      {/* Gastos dia a dia */}
      <Card padding="md">
        <CardTitle>Gastos por dia</CardTitle>
        <p className="text-xs text-gray-400 -mt-0.5 mb-2">Distribuição diária das despesas compartilhadas, por categoria</p>
        <div className="mt-4">
          {!monthLoading && (
            <DailySpendingChart transactions={sharedExpenses} month={month} />
          )}
        </div>
      </Card>

      {/* Histórico de divisão */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
          Histórico da divisão
        </h2>

        {historyLoading ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : (
          <div className="space-y-3">
            {history.map((h) => (
              <Card key={h.month} padding="md">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-900 capitalize">{formatMonth(h.month)}</p>
                  <button
                    type="button"
                    onClick={() => setSelectedHistorySelection({ month: h.month })}
                    className="text-base font-bold text-gray-900 tabular-nums hover:underline"
                  >
                    {formatCurrency(h.total)}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Leonardo pagou</p>
                    <button
                      type="button"
                      onClick={() => setSelectedHistorySelection({ month: h.month, userId: 'leo' })}
                      className="font-semibold text-gray-900 tabular-nums hover:underline"
                    >
                      {formatCurrency(h.leoPaid)}
                    </button>
                  </div>
                  <div>
                    <p className="text-gray-500">Murilo pagou</p>
                    <button
                      type="button"
                      onClick={() => setSelectedHistorySelection({ month: h.month, userId: 'murilo' })}
                      className="font-semibold text-gray-900 tabular-nums hover:underline"
                    >
                      {formatCurrency(h.muriloPaid)}
                    </button>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                  {h.settlement ? (
                    <p className="text-sm text-amber-800 font-medium">
                      {USER_NAMES[h.settlement.debtor_user_id]} deve {formatCurrency(h.settlement.amount)} para {USER_NAMES[h.settlement.creditor_user_id]}
                    </p>
                  ) : (
                    <p className="text-sm text-amber-800 font-medium">Tudo certo — divisão equilibrada</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {selectedCategory && (
        <CategoryTransactionsModal
          categoryName={selectedCategory.name}
          month={month}
          transactions={selectedTxs}
          userNames={USER_NAMES}
          onClose={() => setSelectedCategory(null)}
          onUpdate={handleTxUpdate}
          onDelete={handleTxDelete}
        />
      )}

      {selectedHistory && (
        <CategoryTransactionsModal
          categoryName={
            selectedHistorySelection?.userId
              ? `${USER_NAMES[selectedHistorySelection.userId]} pagou — ${formatMonth(selectedHistory.month)}`
              : `Gastos compartilhados — ${formatMonth(selectedHistory.month)}`
          }
          month={selectedHistory.month}
          transactions={selectedHistoryTxs}
          userNames={USER_NAMES}
          onClose={() => setSelectedHistorySelection(null)}
          onUpdate={handleHistoryTxUpdate}
          onDelete={handleHistoryTxDelete}
        />
      )}

      {showFixedModal && (
        <CategoryTransactionsModal
          categoryName="Gastos fixos do mês"
          month={month}
          transactions={fixedExpenses}
          userNames={USER_NAMES}
          onClose={() => setShowFixedModal(false)}
          onUpdate={handleTxUpdate}
          onDelete={handleTxDelete}
        />
      )}
    </div>
  )
}
