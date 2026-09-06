// ============================================================
// PESSOAL × PROFISSIONAL — só no perfil Fazenda
//
// O foco da fazenda é PROFISSIONAL; o gasto PESSOAL é um "vazamento"
// que o gestor quer enxergar (quanto do dinheiro da fazenda virou gasto
// pessoal). O eixo usa transactions.context: no histórico migrado, o
// pessoal é a categoria "Particular" → context='personal'.
//
// Reaproveita applyFilters/computeCashFlow/computeCategoryBreakdown
// (CashFlowEngine) e os saldos por conta de useNetWorth (contas XP
// pessoal/profissional).
// ============================================================

import { useMemo, useState } from 'react'
import { Card, CardTitle } from '@/components/ui/Card'
import { Amount } from '@/components/ui/Amount'
import { CategoryBars } from '@/components/charts/CategoryBars'
import { CategoryTransactionsModal } from '@/components/transactions/CategoryTransactionsModal'
import { applyFilters, computeCashFlow, computeCategoryBreakdown } from '@/engine/CashFlowEngine'
import { useTransactions } from '@/lib/hooks/useTransactions'
import { useTransactionsSince } from '@/lib/hooks/useTransactionsSince'
import { useNetWorth } from '@/lib/hooks/useNetWorth'
import { useUser } from '@/lib/UserContext'
import { formatCurrency, formatMonth, monthRange } from '@/lib/format'

// Início do histórico da fazenda (migração do Excel Sicredi)
const FAZENDA_START_MONTH = '2024-06-01'

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

export function FazendaSplit() {
  const { userId, userName, month } = useUser()
  const { transactions, loading: txLoading, handleUpdate, refetch } = useTransactions(month, userId)
  const { transactions: seriesTxs, loading: seriesLoading } = useTransactionsSince(FAZENDA_START_MONTH, userId)
  const { enrichedAccounts, loading: nwLoading } = useNetWorth(userId, month)

  const [selectedCategory, setSelectedCategory] = useState<{ id: string; name: string } | null>(null)

  // ── Mês selecionado: profissional vs pessoal ──────────────────
  const profTxs = useMemo(() => applyFilters(transactions, { month, context: 'professional' }), [transactions, month])
  const persTxs = useMemo(() => applyFilters(transactions, { month, context: 'personal' }), [transactions, month])
  const prof = useMemo(() => computeCashFlow(profTxs), [profTxs])
  const pers = useMemo(() => computeCashFlow(persTxs), [persTxs])
  const persCategories = useMemo(() => computeCategoryBreakdown(persTxs), [persTxs])

  const totalExpense = prof.expenses + pers.expenses
  const personalShare = pct(pers.expenses, totalExpense)

  // ── Investimentos XP: pessoal vs profissional ─────────────────
  const xp = useMemo(() => {
    const xpAccounts = enrichedAccounts.filter(
      (a) => a.is_investment && (a.custodian ?? '').toUpperCase() === 'XP',
    )
    const bucket = (kind: 'pessoal' | 'profissional') =>
      xpAccounts
        .filter((a) => `${a.id} ${a.name}`.toLowerCase().includes(kind))
        .reduce((s, a) => s + a.latestBalance, 0)
    const pessoal = bucket('pessoal')
    const profissional = bucket('profissional')
    return { pessoal, profissional, total: pessoal + profissional, has: xpAccounts.length > 0 }
  }, [enrichedAccounts])

  // ── Série mensal: despesa profissional vs pessoal ─────────────
  const series = useMemo(() => {
    const months = monthRange(FAZENDA_START_MONTH, month)
    const rows = months.map((m) => {
      const p = computeCashFlow(applyFilters(seriesTxs, { month: m, context: 'professional' }))
      const s = computeCashFlow(applyFilters(seriesTxs, { month: m, context: 'personal' }))
      return { month: m, prof: p.expenses, pers: s.expenses }
    })
    // Esconde meses no fim sem nenhum lançamento
    let end = rows.length
    while (end > 0 && rows[end - 1].prof === 0 && rows[end - 1].pers === 0) end--
    return rows.slice(0, end).reverse() // mais recente primeiro
  }, [seriesTxs, month])

  const selectedTxs = useMemo(() => {
    if (!selectedCategory) return []
    return persTxs.filter((tx) => (tx.category_id ?? '__uncategorized__') === selectedCategory.id)
  }, [persTxs, selectedCategory])

  const handleCategoryClick = (categoryId: string) => {
    const cat = persCategories.find((c) => c.category_id === categoryId)
    if (cat) setSelectedCategory({ id: cat.category_id, name: cat.category_name })
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pessoal × Profissional</h1>
        <p className="text-sm text-gray-400 mt-0.5">{userName} · {formatMonth(month)}</p>
        <p className="text-xs text-gray-400 mt-2 max-w-2xl">
          O foco da fazenda é <b>profissional</b>. Aqui você vê quanto do dinheiro virou gasto
          <b> pessoal</b> (histórico: categoria “Particular”).
        </p>
      </div>

      {/* ── Destaque: fatia pessoal ──────────────────────────── */}
      <Card padding="md">
        <CardTitle>Gasto pessoal no mês</CardTitle>
        {txLoading ? (
          <p className="text-sm text-gray-400 mt-1">Carregando...</p>
        ) : (
          <div className="flex items-end gap-3 mt-1">
            <Amount value={pers.expenses} size="xl" colored={false} />
            <span className="text-sm text-gray-500 mb-1">
              {personalShare}% da despesa do mês ({formatCurrency(totalExpense)})
            </span>
          </div>
        )}
      </Card>

      {/* ── Resumo lado a lado ───────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card padding="md">
          <CardTitle>Profissional</CardTitle>
          <div className="mt-2 space-y-1.5 text-sm">
            <Row label="Receita" value={prof.income} className="text-green-600" />
            <Row label="Despesa" value={prof.expenses} />
            <Row label="Saldo" value={prof.balance} bold />
          </div>
        </Card>
        <Card padding="md">
          <CardTitle>Pessoal</CardTitle>
          <div className="mt-2 space-y-1.5 text-sm">
            <Row label="Receita" value={pers.income} className="text-green-600" />
            <Row label="Despesa" value={pers.expenses} />
            <Row label="Saldo" value={pers.balance} bold />
          </div>
        </Card>
      </div>

      {/* ── Investimentos XP divididos ───────────────────────── */}
      {!nwLoading && xp.has && (
        <Card padding="md">
          <CardTitle>Investimentos XP</CardTitle>
          <div className="grid grid-cols-3 gap-4 mt-3">
            <Stat label="Profissional" value={xp.profissional} />
            <Stat label="Pessoal" value={xp.pessoal} />
            <Stat label="Total" value={xp.total} bold />
          </div>
          <p className="text-xs text-gray-400 mt-3">Saldo até {formatMonth(month)}</p>
        </Card>
      )}

      {/* ── Categorias do gasto pessoal ──────────────────────── */}
      <Card padding="md">
        <CardTitle>Onde vai o pessoal</CardTitle>
        <p className="text-xs text-gray-400 -mt-0.5 mb-2">Categorias do gasto pessoal · clique para ver as transações</p>
        <div className="mt-4">
          {!txLoading && persCategories.length > 0 ? (
            <CategoryBars data={persCategories} onCategoryClick={handleCategoryClick} />
          ) : (
            !txLoading && <p className="text-sm text-gray-400 py-4 text-center">Sem gasto pessoal neste mês</p>
          )}
        </div>
      </Card>

      {/* ── Série mensal ─────────────────────────────────────── */}
      <Card padding="md">
        <CardTitle>Histórico mês a mês</CardTitle>
        <div className="mt-3 overflow-x-auto">
          {seriesLoading ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 text-left border-b border-gray-100">
                  <th className="py-2 font-medium">Mês</th>
                  <th className="py-2 font-medium text-right">Profissional</th>
                  <th className="py-2 font-medium text-right">Pessoal</th>
                  <th className="py-2 font-medium text-right">% Pessoal</th>
                </tr>
              </thead>
              <tbody>
                {series.map((r) => (
                  <tr key={r.month} className="border-b border-gray-50">
                    <td className="py-2 text-gray-700">{formatMonth(r.month)}</td>
                    <td className="py-2 text-right text-gray-700">{formatCurrency(r.prof)}</td>
                    <td className="py-2 text-right text-gray-700">{formatCurrency(r.pers)}</td>
                    <td className="py-2 text-right text-gray-500">{pct(r.pers, r.prof + r.pers)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {selectedCategory && (
        <CategoryTransactionsModal
          categoryName={selectedCategory.name}
          month={month}
          transactions={selectedTxs}
          subtitle={`${userName} · pessoal`}
          onClose={() => setSelectedCategory(null)}
          onUpdate={handleUpdate}
          onDelete={() => refetch()}
        />
      )}
    </div>
  )
}

function Row({ label, value, bold, className }: { label: string; value: number; bold?: boolean; className?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className={`${bold ? 'font-semibold text-gray-900' : 'text-gray-700'} ${className ?? ''}`}>
        {formatCurrency(value)}
      </span>
    </div>
  )
}

function Stat({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <Amount value={value} size={bold ? 'lg' : 'md'} colored={false} className={bold ? 'font-semibold' : ''} />
    </div>
  )
}
