// ============================================================
// RULE: INVESTMENT TARGET
//
// Rule 10.2: invested / income vs meta (target %)
//
// Compares what the user actually invested this month
// against their personal target percentage of income.
//
// Only fires if user has set an investment_target_pct.
// ============================================================

import { Insight, InsightContext } from '../types'
import { applyFilters, computeCashFlow, computeInvestedAmount } from '../../engine/CashFlowEngine'

export function investmentTargetRule(ctx: InsightContext): Insight[] {
  const { month, transactions, investmentTargetPct } = ctx

  // Rule only applies if user has defined a target
  if (!investmentTargetPct || investmentTargetPct <= 0) return []

  const monthTxs = applyFilters(transactions, { month, include_investments: true })
  const { income } = computeCashFlow(monthTxs)

  if (income === 0) return []

  const invested = computeInvestedAmount(monthTxs)
  const actualPct = (invested / income) * 100
  const targetPct = investmentTargetPct

  const gap = targetPct - actualPct

  // Only fire insight if below target
  if (gap <= 0) return []

  const targetAmount = (targetPct / 100) * income
  const missing = targetAmount - invested
  const severity = gap >= targetPct * 0.5 ? 'warning' : 'info'

  return [
    {
      id: 'investment_target',
      rule: 'investment_target',
      severity,
      message: `Você investiu ${fmt1(actualPct)}% da renda — meta é ${fmt1(targetPct)}%`,
      detail: `Investido: R$ ${fmt(invested)} · Meta: R$ ${fmt(targetAmount)} · Faltou: R$ ${fmt(missing)}`,
      action: `Tente aportar mais R$ ${fmt(missing)} para atingir sua meta de ${fmt1(targetPct)}%`,
      value: actualPct,
      reference: targetPct,
    },
  ]
}

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

function fmt1(n: number): string {
  return n.toFixed(1).replace('.', ',')
}
