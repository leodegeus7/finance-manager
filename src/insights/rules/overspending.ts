// ============================================================
// RULE: OVERSPENDING
//
// Rule 10.2: if a category is > 20% above 3-month average → warning/critical
//
// Compares current month's category spend against rolling 3-month average.
// Returns one insight per overspending category, sorted by delta descending.
// ============================================================

import { Insight, InsightContext } from '../types'
import { computeCategoryBreakdown, applyFilters } from '../../engine/CashFlowEngine'
import { computeRollingAverage } from '../../engine/TransactionEngine'

const OVERSPEND_THRESHOLD = 0.20  // 20% above average → trigger

export function overspendingRule(ctx: InsightContext): Insight[] {
  const { month, transactions } = ctx

  const monthTxs = applyFilters(transactions, { month })
  const currentBreakdown = computeCategoryBreakdown(monthTxs)
  const rollingAvg = computeRollingAverage(transactions, month, 3)

  const insights: Insight[] = []

  for (const cat of currentBreakdown) {
    const avg = rollingAvg.get(cat.category_id)
    if (!avg || avg === 0) continue

    const delta = cat.total - avg
    const deltaPct = delta / avg

    if (deltaPct <= OVERSPEND_THRESHOLD) continue

    const deltaPctDisplay = Math.round(deltaPct * 100)
    const severity = deltaPct >= 0.5 ? 'critical' : 'warning'

    insights.push({
      id: `overspending:${cat.category_id}`,
      rule: 'overspending',
      severity,
      message: `Você gastou ${deltaPctDisplay}% a mais em ${cat.category_name}`,
      detail: `Este mês: R$ ${fmt(cat.total)} · Média 3 meses: R$ ${fmt(avg)}`,
      action: `Revise seus gastos com ${cat.category_name.toLowerCase()} no próximo mês`,
      value: cat.total,
      reference: avg,
    })
  }

  // Return sorted by delta descending — biggest overspend first
  return insights.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
}

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',')
}
