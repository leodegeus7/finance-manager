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
import { formatCurrency, formatMonth } from '@/lib/format'
import { useUser } from '@/lib/UserContext'
import { fetchPersonalTransactionsByMonth } from '@/lib/db/transactions'
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

/** Lista de meses (YYYY-MM-01) entre `start` e `end`, inclusive, ordem crescente */
function monthRange(start: string, end: string): string[] {
  const months: string[] = []
  let [y, m] = start.split('-').map(Number)
  const [endY, endM] = end.split('-').map(Number)

  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}-01`)
    m++
    if (m > 12) { m = 1; y++ }
  }

  return months
}

async function fetchSharedTransactions(month: string): Promise<Transaction[]> {
  const [leoTxs, muriloTxs] = await Promise.all([
    fetchPersonalTransactionsByMonth(month, 'leo'),
    fetchPersonalTransactionsByMonth(month, 'murilo'),
  ])
  return [...leoTxs, ...muriloTxs].filter((tx) => tx.context === 'personal')
}

export function Casal() {
  const { month } = useUser()

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
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState<string | null>(null)

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
    () => history.find((h) => h.month === selectedHistoryMonth) ?? null,
    [history, selectedHistoryMonth],
  )

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
                    onClick={() => setSelectedHistoryMonth(h.month)}
                    className="text-base font-bold text-gray-900 tabular-nums hover:underline"
                  >
                    {formatCurrency(h.total)}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Leonardo pagou</p>
                    <p className="font-semibold text-gray-900 tabular-nums">{formatCurrency(h.leoPaid)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Murilo pagou</p>
                    <p className="font-semibold text-gray-900 tabular-nums">{formatCurrency(h.muriloPaid)}</p>
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
          categoryName={`Gastos compartilhados — ${formatMonth(selectedHistory.month)}`}
          month={selectedHistory.month}
          transactions={selectedHistory.transactions}
          userNames={USER_NAMES}
          onClose={() => setSelectedHistoryMonth(null)}
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
