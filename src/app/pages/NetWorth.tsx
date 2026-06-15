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
import { useState, useEffect } from 'react'

export function NetWorth() {
  const { userId, userName, month } = useUser()
  const { timeline, assets, enrichedAccounts, loading, error } = useNetWorth(userId, month)

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

  const splitReport = useMemo(
    () => computeSplitReport(splitTxs, userId),
    [splitTxs, userId],
  )

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
              <span>Contas: <strong className="text-gray-900">{formatCurrency(breakdown.accounts_total)}</strong></span>
              <span>Investimentos: <strong className="text-gray-900">{formatCurrency(breakdown.assets_total)}</strong></span>
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
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
            Investimentos & Ativos
          </h2>
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
                    <p className="text-base font-bold tabular-nums text-gray-900">
                      {formatCurrency(asset.current_value)}
                    </p>
                  </div>
                </Card>
              )
            })}
          </div>
        </section>
      </div>

      {/* Splits section */}
      {!txLoading && (splitReport.couple || splitReport.others.length > 0) && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Divisões em {formatMonth(month)}
          </h2>

          {/* Casal */}
          {splitReport.couple && (
            <Card padding="md">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Visão do Casal</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {splitReport.couple.count} transaç{splitReport.couple.count !== 1 ? 'ões' : 'ão'} compartilhadas
                  </p>
                </div>
                <p className="text-xl font-bold text-gray-900 tabular-nums">
                  {formatCurrency(splitReport.couple.total)}
                </p>
              </div>

              <div className="space-y-3">
                {/* Leo */}
                {(() => {
                  const leoPct = splitReport.couple!.total > 0
                    ? (splitReport.couple!.leoShare / splitReport.couple!.total) * 100
                    : 0
                  return (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-900">Leonardo</span>
                        <span className="text-xs text-gray-400">{leoPct.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                        <div className="h-full rounded-full bg-blue-400" style={{ width: `${leoPct}%` }} />
                      </div>
                      <p className="text-xs text-gray-500 text-right">
                        {formatCurrency(splitReport.couple!.leoShare)}
                      </p>
                    </div>
                  )
                })()}

                {/* Murilo */}
                {(() => {
                  const muriloPct = splitReport.couple!.total > 0
                    ? (splitReport.couple!.muriloShare / splitReport.couple!.total) * 100
                    : 0
                  return (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-900">Murilo</span>
                        <span className="text-xs text-gray-400">{muriloPct.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                        <div className="h-full rounded-full bg-purple-400" style={{ width: `${muriloPct}%` }} />
                      </div>
                      <p className="text-xs text-gray-500 text-right">
                        {formatCurrency(splitReport.couple!.muriloShare)}
                      </p>
                    </div>
                  )
                })()}
              </div>

              {/* Settlement */}
              {splitReport.couple.muriloShare > 0 && (
                <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <p className="text-sm text-amber-800 font-medium">
                    Murilo deve {formatCurrency(splitReport.couple.muriloShare)} para Leonardo
                  </p>
                </div>
              )}
            </Card>
          )}

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
