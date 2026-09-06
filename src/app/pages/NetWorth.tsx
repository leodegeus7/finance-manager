// ============================================================
// NET WORTH — UI Rule 6
// Goal: mostrar riqueza real
//
// Structure: accounts + investments + assets (UI Rule 6.2)
// Each item: valor atual + variação (UI Rule 6.3)
// Chart: evolução do patrimônio total (UI Rule 6.4)
// Couple section: shared view (UI Rule 7) — dados reais via splits
// ============================================================

import { useMemo } from 'react'
import { Card, CardTitle } from '@/components/ui/Card'
import { DeltaBadge } from '@/components/ui/Amount'
import { NetWorthChart } from '@/components/charts/NetWorthChart'
import { formatCurrency, formatMonth } from '@/lib/format'
import { buildNetWorthBreakdown, netWorthForMonth } from '@/investments/NetWorthEngine'
import { useNetWorth } from '@/lib/hooks/useNetWorth'
import { useUser } from '@/lib/UserContext'
import { computeSplitReport } from '@/engine/SplitEngine'
import { fetchSplitTransactionsByMonth } from '@/lib/db/transactions'
import { createAsset, updateAssetValue } from '@/lib/db/networth'
import { AssetType } from '@/investments/types'
import { IncomeEvolutionChart } from '@/components/charts/IncomeEvolutionChart'
import { YearPerformanceTable } from '@/components/investments/YearPerformanceTable'
import { HoldingsCard } from '@/components/investments/HoldingsCard'
import { useInvestments } from '@/lib/hooks/useInvestments'
import { useTransactionsSince } from '@/lib/hooks/useTransactionsSince'
import { useState, useEffect } from 'react'

export function NetWorth() {
  const { userId, userName, month, isFazenda } = useUser()
  const { timeline, assets, enrichedAccounts, loading, error, reload } = useNetWorth(userId, month)
  const { transactions: incomeTxs } = useTransactionsSince('2026-04-01', userId)
  const investments = useInvestments(userId, month)

  // Split transactions: fetch by both competency_month AND statement_month
  const [splitTxs, setSplitTxs] = useState<import('@/engine/types').Transaction[]>([])
  const [txLoading, setTxLoading] = useState(true)
  useEffect(() => {
    setTxLoading(true)
    fetchSplitTransactionsByMonth(month, userId)
      .then(setSplitTxs)
      .catch(() => setSplitTxs([]))
      .finally(() => setTxLoading(false))
  }, [month, userId])

  // Same accounts/balances shown in Contas & Cartões: latest balance entered
  // manually, up to the selected month, for active accounts.
  const accountBalances = enrichedAccounts.map((a) => ({
    account_id:   a.id,
    account_name: a.name,
    balance:      a.latestBalance,
  }))

  const breakdown = buildNetWorthBreakdown(accountBalances, assets)
  const latest    = netWorthForMonth(timeline, month)

  // Resumo: contas de corretora (is_investment, ex.: XP) contam como
  // "Investimentos", não como "Contas" — junto com os ativos da tabela de ativos.
  const investAccountsTotal = enrichedAccounts
    .filter((a) => a.is_investment)
    .reduce((s, a) => s + a.latestBalance, 0)
  const contasTotal        = Math.round((breakdown.accounts_total - investAccountsTotal) * 100) / 100
  const investimentosTotal = Math.round((breakdown.assets_total + investAccountsTotal) * 100) / 100

  const splitReport = useMemo(
    () => computeSplitReport(splitTxs, userId),
    [splitTxs, userId],
  )

  // ── Adicionar ativo ──────────────────────────────────────────
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
        is_shared: false,
      })
      setAssetName(''); setAssetValue(''); setLinkToAccount(false); setAssetAccountId('')
      setShowAddAsset(false)
      reload()
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
      reload()
    } finally {
      setSavingEditAsset(false)
    }
  }

  if (error) return (
    <div className="p-8 text-red-600 text-sm">Erro ao carregar patrimônio: {error}</div>
  )

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Patrimônio</h1>
        <p className="text-sm text-gray-400 mt-0.5">{userName} · {formatMonth(month)}</p>
      </div>

      {/* Total */}
      <Card padding="lg">
        <CardTitle>Patrimônio total</CardTitle>
        {loading ? (
          <p className="text-sm text-gray-400 mt-2">Carregando...</p>
        ) : (
          <>
            <div className="flex items-end gap-3 mt-2">
              <span className="text-5xl font-bold text-gray-900 tabular-nums">
                {formatCurrency(breakdown.net_worth)}
              </span>
              {latest?.monthly_change_pct != null && (
                <DeltaBadge value={latest.monthly_change_pct} className="mb-1" />
              )}
            </div>
            <div className="flex gap-6 mt-3 text-sm text-gray-500">
              <span>Contas: <strong className="text-gray-900">{formatCurrency(contasTotal)}</strong></span>
              <span>Investimentos: <strong className="text-gray-900">{formatCurrency(investimentosTotal)}</strong></span>
            </div>
          </>
        )}
      </Card>

      {/* Chart */}
      <Card padding="md">
        <CardTitle>Evolução</CardTitle>
        <div className="mt-4">
          {!loading && <NetWorthChart data={timeline} />}
        </div>
      </Card>

      {/* Income evolution — renda pessoal do Leonardo (salário/freelancer),
          histórico fixo. Não faz sentido na fazenda. */}
      {!isFazenda && (
        <Card padding="md">
          <CardTitle>Evolução da renda</CardTitle>
          <p className="text-xs text-gray-400 -mt-0.5 mb-2">Salário, Freelancer e Fazenda · histórico desde Dez/2018</p>
          <div className="mt-4">
            <IncomeEvolutionChart liveTxs={incomeTxs} />
          </div>
        </Card>
      )}

      {/* Rendimento dos investimentos — ano a ano */}
      {investments.hasInvestmentAccounts && (
        <YearPerformanceTable rows={investments.yearly} totals={investments.yearlyTotals} />
      )}

      {/* Composição por ativo (o que tem dentro da corretora) */}
      {investments.holdings.length > 0 && (
        <HoldingsCard holdings={investments.holdings} />
      )}

      {/* Two-column: Accounts + Assets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Accounts */}
        <section>
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
            Contas
          </h2>
          <div className="space-y-2">
            {enrichedAccounts.map((acc) => (
              <Card key={acc.id} padding="sm">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{acc.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{acc.bank}</p>
                  </div>
                  <p className="text-base font-bold tabular-nums text-gray-900">
                    {formatCurrency(acc.latestBalance)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Investments & Assets */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
              Investimentos & Ativos
            </h2>
            <button
              onClick={() => setShowAddAsset((v) => !v)}
              className="text-xs text-blue-600 font-medium hover:underline"
            >
              {showAddAsset ? 'Cancelar' : '+ Adicionar'}
            </button>
          </div>

          {showAddAsset && (
            <Card padding="md" className="mb-2">
              <p className="text-xs font-medium text-gray-500 mb-3">Novo ativo</p>
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
                    {enrichedAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                )}
                {!linkToAccount && (
                  <p className="text-xs text-gray-400 mt-1">
                    Vai contar como patrimônio separado
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

          <div className="space-y-2">
            {breakdown.assets.map(({ asset, percentage_of_total }) => {
              const linkedAccount = asset.linked_account_id
                ? enrichedAccounts.find((a) => a.id === asset.linked_account_id)
                : undefined
              return (
                <Card key={asset.id} padding="sm">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{asset.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">
                        {asset.type === 'financial' ? 'Financeiro' : 'Real'}
                        {!asset.linked_account_id && ` · ${percentage_of_total.toFixed(1)}% do patrimônio`}
                      </p>
                      {asset.linked_account_id && (
                        <p className="text-xs text-amber-600 mt-0.5">
                          Incluído no saldo de {linkedAccount?.name ?? 'uma conta'} · não soma no total
                        </p>
                      )}
                      {asset.is_shared && (
                        <p className="text-xs text-blue-500 mt-0.5">Compartilhado com o casal</p>
                      )}
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
        </section>
      </div>

      {/* Splits section — conceito de casal, não aparece na fazenda */}
      {!isFazenda && !txLoading && splitReport.others.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Divisões em {formatMonth(month)}
          </h2>

          {/* Outros splits */}
          {splitReport.others.length > 0 && (
            <Card padding="md">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-900">Outros splits</p>
                <p className="text-sm font-bold text-gray-900 tabular-nums">
                  {formatCurrency(splitReport.others.reduce((s, o) => s + o.owed, 0))}
                </p>
              </div>
              <div className="space-y-2.5">
                {splitReport.others.map((p) => (
                  <div key={p.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                      <span className="text-sm text-gray-800 font-medium">{p.name}</span>
                      <span className="text-xs text-gray-400">
                        {p.count} {p.count === 1 ? 'item' : 'itens'}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">
                      {formatCurrency(p.owed)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </section>
      )}

    </div>
  )
}
