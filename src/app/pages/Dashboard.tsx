// ============================================================
// DASHBOARD — UI Rule 3
// Goal: answer "Estou melhor ou pior?" in 5 seconds
//
// Block 1 — Resumo:    patrimônio, variação, receita, despesa
// Block 2 — Gráfico:   linha do patrimônio ao longo do tempo
// Block 3 — Gastos:    top categorias (barras horizontais)
// Block 4 — Insights:  3–5 insights (UI Rule 3.2)
// ============================================================

import { useMemo, useState } from 'react'
import { Card, CardTitle } from '@/components/ui/Card'
import { Amount, DeltaBadge } from '@/components/ui/Amount'
import { InsightCard } from '@/components/ui/InsightCard'
import { NetWorthChart } from '@/components/charts/NetWorthChart'
import { CategoryBars } from '@/components/charts/CategoryBars'
import { MonthlyFlowChart } from '@/components/charts/MonthlyFlowChart'
import { CategoryTransactionsModal } from '@/components/transactions/CategoryTransactionsModal'
import { UncategorizedWidget } from '@/components/dashboard/UncategorizedWidget'
import { formatCurrency, formatMonth, monthRange } from '@/lib/format'
import { MOCK_INSIGHTS } from '@/lib/mock'
import { applyFilters, computeCashFlow, computeCategoryBreakdown, computeMonthlyFinancialSeries } from '@/engine/CashFlowEngine'
import { netWorthForMonth } from '@/investments/NetWorthEngine'
import { useTransactions } from '@/lib/hooks/useTransactions'
import { useNetWorth } from '@/lib/hooks/useNetWorth'
import { useAccounts } from '@/lib/hooks/useAccounts'
import { useTransactionsSince } from '@/lib/hooks/useTransactionsSince'
import { useUser } from '@/lib/UserContext'

// Início do recorte mensal de investimentos/custos/receita (Block 5)
const FLOW_START_MONTH = '2026-04-01'

export function Dashboard() {
  const { userId, userName, month } = useUser()
  const { transactions, loading: txLoading, handleUpdate, refetch } = useTransactions(month, userId)
  const { timeline, loading: nwLoading }     = useNetWorth(userId, month)
  const { accounts, cards }                  = useAccounts(userId, month)
  const { transactions: flowTxs, loading: flowLoading } = useTransactionsSince(FLOW_START_MONTH, userId)
  const [selectedCategory, setSelectedCategory] = useState<{ id: string; name: string } | null>(null)
  const [selectedFlow, setSelectedFlow] = useState<'income' | 'expense' | null>(null)

  const monthTxs   = useMemo(() => applyFilters(transactions, { month }), [transactions, month])
  const cashFlow   = useMemo(() => computeCashFlow(monthTxs), [monthTxs])
  const categories = useMemo(() => computeCategoryBreakdown(monthTxs), [monthTxs])
  const netWorth   = netWorthForMonth(timeline, month)

  const selectedTxs = useMemo(() => {
    if (!selectedCategory) return []
    return monthTxs.filter((tx) => (tx.category_id ?? '__uncategorized__') === selectedCategory.id)
  }, [monthTxs, selectedCategory])

  const handleCategoryClick = (categoryId: string) => {
    const cat = categories.find((c) => c.category_id === categoryId)
    if (!cat) return
    setSelectedCategory({ id: cat.category_id, name: cat.category_name })
  }

  const selectedFlowTxs = useMemo(() => {
    if (!selectedFlow) return []
    return monthTxs.filter((tx) => tx.direction === selectedFlow)
  }, [monthTxs, selectedFlow])

  const flowMonths = useMemo(() => monthRange(FLOW_START_MONTH, month), [month])
  const monthlyFlow = useMemo(() => {
    const series = computeMonthlyFinancialSeries(flowTxs, flowMonths)
    // Esconde meses no fim da série em que nada foi lançado ainda
    // (receita, despesas e investimentos todos zerados).
    let end = series.length
    while (
      end > 0 &&
      series[end - 1].income === 0 &&
      series[end - 1].expenses === 0 &&
      series[end - 1].investments === 0
    ) end--
    return series.slice(0, end)
  }, [flowTxs, flowMonths])

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

      {/* ── Transações sem categoria ─────────────────────────── */}
      {!txLoading && (
        <UncategorizedWidget transactions={monthTxs} accounts={accounts} cards={cards} />
      )}

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
        <Card padding="md" onClick={() => setSelectedFlow('income')} className="cursor-pointer hover:shadow-md transition-shadow">
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
        <Card padding="md" onClick={() => setSelectedFlow('expense')} className="cursor-pointer hover:shadow-md transition-shadow">
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

      {/* ── Block: Investimentos, despesas e receita mês a mês ── */}
      <Card padding="md">
        <CardTitle>Investimentos, despesas e receita por mês</CardTitle>
        <p className="text-xs text-gray-400 -mt-0.5 mb-2">
          Desde {formatMonth(FLOW_START_MONTH)} · transferências para o Banco XP contam como investimento
        </p>
        <div className="mt-4">
          {!flowLoading && <MonthlyFlowChart data={monthlyFlow} />}
        </div>
      </Card>

      {/* ── Block 3 + 4: Gastos & Insights ──────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Block 3 — Gastos por categoria */}
        <Card padding="md">
          <CardTitle>Gastos por categoria</CardTitle>
          <p className="text-xs text-gray-400 -mt-0.5 mb-2">Clique em uma categoria para ver as transações</p>
          <div className="mt-4">
            {!txLoading && <CategoryBars data={categories} onCategoryClick={handleCategoryClick} />}
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

      {selectedCategory && (
        <CategoryTransactionsModal
          categoryName={selectedCategory.name}
          month={month}
          transactions={selectedTxs}
          subtitle={userName}
          onClose={() => setSelectedCategory(null)}
          onUpdate={handleUpdate}
          onDelete={() => refetch()}
        />
      )}

      {selectedFlow && (
        <CategoryTransactionsModal
          categoryName={selectedFlow === 'income' ? 'Receitas' : 'Despesas'}
          month={month}
          transactions={selectedFlowTxs}
          subtitle={userName}
          sortBy="amount"
          onClose={() => setSelectedFlow(null)}
          onUpdate={handleUpdate}
          onDelete={() => refetch()}
        />
      )}
    </div>
  )
}
