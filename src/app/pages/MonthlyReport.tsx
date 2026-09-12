// ============================================================
// FECHAMENTO MENSAL — só no perfil Fazenda
//
// Substitui a planilha à parte que o financeiro usava: despesa/receita por
// categoria, separado por Conta/Cartão/Total. Em vez de repetir as 3 tabelas
// lado a lado (como na planilha), usa um seletor de escopo — progressive
// disclosure em vez de tudo exposto de uma vez. O botão "Exportar Excel"
// gera o .xlsx no mesmo layout que o financeiro já reconhece.
// ============================================================

import { useMemo, useState } from 'react'
import { Card, CardTitle } from '@/components/ui/Card'
import { Amount } from '@/components/ui/Amount'
import { CategoryList } from '@/components/reports/CategoryList'
import { applyFilters } from '@/engine/CashFlowEngine'
import { computeMonthlyReport } from '@/engine/MonthlyReportEngine'
import { exportMonthlyReportToExcel } from '@/lib/exportMonthlyReport'
import { useTransactions } from '@/lib/hooks/useTransactions'
import { useUser } from '@/lib/UserContext'
import { formatCurrency, formatMonth } from '@/lib/format'

type Scope = 'total' | 'conta' | 'cartao'

const SCOPE_LABEL: Record<Scope, string> = { total: 'Total', conta: 'Conta', cartao: 'Cartão' }

export function MonthlyReport() {
  const { userId, userName, month } = useUser()
  const { transactions, loading } = useTransactions(month, userId)
  const [scope, setScope] = useState<Scope>('total')
  const [exporting, setExporting] = useState(false)

  const monthTxs = useMemo(() => applyFilters(transactions, { month }), [transactions, month])
  const report = useMemo(() => computeMonthlyReport(monthTxs), [monthTxs])
  const section = report[scope]

  async function handleExport() {
    setExporting(true)
    try {
      await exportMonthlyReportToExcel(report, month)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fechamento Mensal</h1>
          <p className="text-sm text-gray-400 mt-0.5">{userName} · {formatMonth(month)}</p>
        </div>
        <button
          onClick={handleExport}
          disabled={loading || exporting}
          className="shrink-0 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-40 hover:bg-gray-700 transition-colors"
        >
          {exporting ? 'Gerando...' : '↓ Exportar Excel'}
        </button>
      </div>

      {/* ── Seletor de escopo ─────────────────────────────────── */}
      <div className="flex gap-1.5">
        {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
              scope === s ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {SCOPE_LABEL[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Carregando...</p>
      ) : (
        <>
          {/* ── Resumo do escopo ──────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card padding="md">
              <CardTitle>Despesa</CardTitle>
              <Amount value={section.totalDespesa} size="lg" colored={false} className="mt-1" />
            </Card>
            <Card padding="md">
              <CardTitle>Receita</CardTitle>
              <Amount value={section.totalReceita} size="lg" colored={false} className="mt-1 text-green-600" />
            </Card>
            <Card padding="md">
              <CardTitle>Saldo</CardTitle>
              <Amount value={section.totalReceita - section.totalDespesa} size="lg" className="mt-1 font-semibold" />
            </Card>
          </div>

          {/* ── Despesas por categoria ────────────────────────── */}
          <Card padding="md">
            <CardTitle>Despesas por categoria — {SCOPE_LABEL[scope]}</CardTitle>
            <div className="mt-4">
              <CategoryList data={section.despesas} emptyLabel="Sem despesas neste mês" tone="expense" />
            </div>
          </Card>

          {/* ── Receitas por categoria ────────────────────────── */}
          <Card padding="md">
            <CardTitle>Receitas por categoria — {SCOPE_LABEL[scope]}</CardTitle>
            <div className="mt-4">
              <CategoryList data={section.receitas} emptyLabel="Sem receitas neste mês" tone="income" />
            </div>
          </Card>

          <p className="text-xs text-gray-400 text-center">
            {formatCurrency(section.totalDespesa)} em despesas · {formatCurrency(section.totalReceita)} em receitas · {SCOPE_LABEL[scope].toLowerCase()}
          </p>
        </>
      )}
    </div>
  )
}
