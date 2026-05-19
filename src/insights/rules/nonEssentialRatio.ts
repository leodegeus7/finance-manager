// ============================================================
// RULE: NON-ESSENTIAL RATIO
//
// Rule 10.2: % of income spent on non-essential items
//
// Thresholds (defensive — not in spec, derived from principle):
//   > 40% of income on non-essential → warning
//   > 60% of income on non-essential → critical
// ============================================================

import { Insight, InsightContext } from '../types'
import { applyFilters, computeCashFlow, computeNonEssentialRatio } from '../../engine/CashFlowEngine'

const WARNING_THRESHOLD  = 40   // % of income
const CRITICAL_THRESHOLD = 60

export function nonEssentialRatioRule(ctx: InsightContext): Insight[] {
  const { month, transactions } = ctx

  const monthTxs = applyFilters(transactions, { month })
  const ratio = computeNonEssentialRatio(monthTxs)

  if (ratio < WARNING_THRESHOLD) return []

  const { income, expenses } = computeCashFlow(monthTxs)
  const nonEssential = (ratio / 100) * income
  const severity = ratio >= CRITICAL_THRESHOLD ? 'critical' : 'warning'

  return [
    {
      id: 'non_essential_ratio',
      rule: 'non_essential_ratio',
      severity,
      message: `${Math.round(ratio)}% da sua renda foi em gastos não essenciais`,
      detail: `Não essencial: R$ ${fmt(nonEssential)} · Renda: R$ ${fmt(income)} · Total gastos: R$ ${fmt(expenses)}`,
      action: 'Identifique quais gastos não essenciais podem ser reduzidos',
      value: ratio,
    },
  ]
}

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',')
}
