// ============================================================
// RULE: SPENDING TREND
//
// Rule 10.2: total vs histórico (3-month average)
//
// Looks at total expenses this month vs rolling 3-month average.
// Unlike overspending (which is per category), this is the macro view:
// "is overall spending going up or down?"
//
// Only fires for significant trends to avoid noise.
// ============================================================

import { Insight, InsightContext } from '../types'
import { applyFilters, computeCashFlow } from '../../engine/CashFlowEngine'
import { toFirstOfMonth } from '../utils'

const INCREASE_THRESHOLD = 0.15   // 15% above average → warning
const DECREASE_THRESHOLD = -0.10  // 10% below average → positive info

export function spendingTrendRule(ctx: InsightContext): Insight[] {
  const { month, transactions } = ctx

  // Current month
  const currentMonthTxs = applyFilters(transactions, { month })
  const { expenses: currentExpenses } = computeCashFlow(currentMonthTxs)

  if (currentExpenses === 0) return []

  // Rolling 3-month average of total expenses
  const refDate = new Date(month)
  const priorMonths = [1, 2, 3].map((i) => {
    const d = new Date(refDate)
    d.setMonth(d.getMonth() - i)
    return toFirstOfMonth(d)
  })

  const priorExpenses = priorMonths.map((m) => {
    const txs = applyFilters(transactions, { month: m })
    return computeCashFlow(txs).expenses
  })

  // Only include months that have actual data
  const populated = priorExpenses.filter((e) => e > 0)
  if (populated.length === 0) return []

  const avgExpenses = populated.reduce((s, e) => s + e, 0) / populated.length
  const delta = currentExpenses - avgExpenses
  const deltaPct = delta / avgExpenses

  if (Math.abs(deltaPct) < Math.abs(DECREASE_THRESHOLD)) return []

  if (deltaPct >= INCREASE_THRESHOLD) {
    return [
      {
        id: 'spending_trend:up',
        rule: 'spending_trend',
        severity: deltaPct >= 0.30 ? 'critical' : 'warning',
        message: `Seus gastos totais subiram ${Math.round(deltaPct * 100)}% em relação à média`,
        detail: `Este mês: R$ ${fmt(currentExpenses)} · Média 3 meses: R$ ${fmt(avgExpenses)}`,
        action: 'Revise seus gastos do mês — o total está acima do seu padrão histórico',
        value: currentExpenses,
        reference: avgExpenses,
      },
    ]
  }

  if (deltaPct <= DECREASE_THRESHOLD) {
    return [
      {
        id: 'spending_trend:down',
        rule: 'spending_trend',
        severity: 'info',
        message: `Seus gastos totais caíram ${Math.round(Math.abs(deltaPct) * 100)}% em relação à média`,
        detail: `Este mês: R$ ${fmt(currentExpenses)} · Média 3 meses: R$ ${fmt(avgExpenses)}`,
        action: 'Boa disciplina! Considere direcionar a diferença para investimentos',
        value: currentExpenses,
        reference: avgExpenses,
      },
    ]
  }

  return []
}

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',')
}
