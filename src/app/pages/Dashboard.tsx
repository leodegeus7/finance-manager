// ============================================================
// DASHBOARD — UI Rule 3
// Goal: answer "Estou melhor ou pior?" in 5 seconds
//
// Block 1 — Resumo:    patrimônio, variação, receita, despesa
// Block 2 — Gráfico:   linha do patrimônio ao longo do tempo
// Block 3 — Gastos:    top categorias (barras horizontais)
// Block 4 — Insights:  3–5 insights (UI Rule 3.2)
// ============================================================

import { useMemo } from 'react'
import { Card, CardTitle } from '@/components/ui/Card'
import { Amount, DeltaBadge } from '@/components/ui/Amount'
import { InsightCard } from '@/components/ui/InsightCard'
import { NetWorthChart } from '@/components/charts/NetWorthChart'
import { CategoryBars } from '@/components/charts/CategoryBars'
import { formatCurrency, formatMonth } from '@/lib/format'
import { MOCK_INSIGHTS } from '@/lib/mock'
import { applyFilters, computeCashFlow, computeCategoryBreakdown } from '@/engine/CashFlowEngine'
import { netWorthForMonth } from '@/investments/NetWorthEngine'
import { useTransactions } from '@/lib/hooks/useTransactions'
import { useNetWorth } from '@/lib/hooks/useNetWorth'
import { useUser } from '@/lib/UserContext'

export function Dashboard() {
  const { userId, userName, month } = useUser()
  const { transactions, loading: txLoading } = useTransactions(month, userId)
  const { timeline, loading: nwLoading }     = useNetWorth(userId, month)

  const monthTxs   = useMemo(() => applyFilters(transactions, { month }), [transactions, month])
  const cashFlow   = useMemo(() => computeCashFlow(monthTxs), [monthTxs])
  const categories = useMemo(() => computeCategoryBreakdown(monthTxs), [monthTxs])
  const netWorth   = netWorthForMonth(timeline, month)

  const loading = txLoading || nwLoading

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">{userName} · {formatMonth(month)}</p>
        </div>
      </div>

      {/* ── Block 1: Resumo ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">

        {/* Patrimônio total */}
        <Card className="col-span-2 lg:col-span-2" padding="md">
          <CardTitle>Patrimônio total</CardTitle>
          {loading ? (
            <p className="text-sm text-gray-400 mt-1">Carregando...</p>
          ) : (
            <>
              <div className="flex items-end gap-3 mt-1">
                <Amount value={netWorth?.net_worth ?? 0} size="xl" colored={false} />
                {netWorth?.monthly_change_pct != null && (
                  <DeltaBadge value={netWorth.monthly_change_pct} className="mb-1" />
                )}
              </div>
              {netWorth?.monthly_change != null && (
                <p className="text-xs text-gray-400 mt-1">
                  {netWorth.monthly_change >= 0 ? '+' : ''}
                  {formatCurrency(netWorth.monthly_change)} este mês
                </p>
              )}
            </>
          )}
        </Card>

        {/* Receita */}
        <Card padding="md">
          <CardTitle>Receita</CardTitle>
          {loading ? (
            <p className="text-sm text-gray-400 mt-1">...</p>
          ) : (
            <>
              <Amount value={cashFlow.income} size="lg" colored={false} className="text-green-600 mt-1 block" />
              <p className="text-xs text-gray-400 mt-1">este mês</p>
            </>
          )}
        </Card>

        {/* Despesa */}
        <Card padding="md">
          <CardTitle>Despesas</CardTitle>
          {loading ? (
            <p className="text-sm text-gray-400 mt-1">...</p>
          ) : (
            <>
              <Amount value={cashFlow.expenses} size="lg" colored={false} className="text-gray-900 mt-1 block" />
              <p className="text-xs text-gray-400 mt-1">
                saldo: {formatCurrency(cashFlow.balance)}
              </p>
            </>
          )}
        </Card>
      </div>

      {/* ── Block 2: Gráfico do patrimônio ───────────────────── */}
      <Card padding="md">
        <CardTitle>Evolução do patrimônio</CardTitle>
        <div className="mt-4">
          {!nwLoading && <NetWorthChart data={timeline} />}
        </div>
      </Card>

      {/* ── Block 3 + 4: Gastos & Insights ──────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Block 3 — Gastos por categoria */}
        <Card padding="md">
          <CardTitle>Gastos por categoria</CardTitle>
          <div className="mt-4">
            {!txLoading && <CategoryBars data={categories} />}
          </div>
        </Card>

        {/* Block 4 — Insights (3–5, max 5 — Rule 10.3) */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide px-1">
            Insights
          </p>
          {MOCK_INSIGHTS.length === 0 ? (
            <Card padding="md">
              <p className="text-sm text-gray-400 text-center py-4">
                Nenhum insight disponível para este mês
              </p>
            </Card>
          ) : (
            MOCK_INSIGHTS.slice(0, 5).map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
