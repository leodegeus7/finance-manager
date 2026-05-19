// ============================================================
// RULE: TOP INCREASES
//
// Rule 10.2: sort categories by absolute delta (current - avg)
// Returns the single biggest increase that isn't already
// covered by the overspending rule.
// ============================================================

import { Insight, InsightContext } from '../types'
import { computeCategoryBreakdown, applyFilters } from '../../engine/CashFlowEngine'
import { computeRollingAverage } from '../../engine/TransactionEngine'

export function topIncreasesRule(ctx: InsightContext): Insight[] {
  const { month, transactions } = ctx

  const monthTxs = applyFilters(transactions, { month })
  const currentBreakdown = computeCategoryBreakdown(monthTxs)
  const rollingAvg = computeRollingAverage(transactions, month, 3)

  // Compute absolute delta for each category that has history
  const increases = currentBreakdown
    .filter((cat) => {
      const avg = rollingAvg.get(cat.category_id)
      return avg != null && avg > 0 && cat.total > avg
    })
    .map((cat) => {
      const avg = rollingAvg.get(cat.category_id)!
      return {
        ...cat,
        delta: cat.total - avg,
        deltaPct: (cat.total - avg) / avg,
      }
    })
    .sort((a, b) => b.delta - a.delta)  // Rule 10.2: order by absolute delta

  if (increases.length === 0) return []

  // Report the top 1 increase (others may be covered by overspending rule)
  const top = increases[0]
  const deltaPctDisplay = Math.round(top.deltaPct * 100)

  return [
    {
      id: `top_increases:${top.category_id}`,
      rule: 'top_increases',
      severity: 'warning',
      message: `${top.category_name} teve o maior aumento: +R$ ${fmt(top.delta)}`,
      detail: `Este mês: R$ ${fmt(top.total)} · Mês anterior médio: R$ ${fmt(top.total - top.delta)} (+${deltaPctDisplay}%)`,
      action: `Verifique o que causou o aumento em ${top.category_name.toLowerCase()}`,
      value: top.delta,
      reference: top.total - top.delta,
    },
  ]
}

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',')
}
