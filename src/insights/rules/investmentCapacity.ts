// ============================================================
// RULE: INVESTMENT CAPACITY
//
// Rule 10.2: income - expenses = capacity to invest
//
// If the user has leftover cash they didn't invest, this insight
// surfaces the opportunity: "you could have invested R$ X more."
//
// Fires when:
//   capacity > 0 AND invested < capacity
// ============================================================

import { Insight, InsightContext } from '../types'
import { applyFilters, computeCashFlow, computeInvestedAmount } from '../../engine/CashFlowEngine'

// Minimum capacity to trigger insight (avoid noise on tiny leftovers)
const MIN_CAPACITY = 100  // R$

export function investmentCapacityRule(ctx: InsightContext): Insight[] {
  const { month, transactions } = ctx

  const monthTxs = applyFilters(transactions, { month, include_investments: true })
  const { income, expenses, balance } = computeCashFlow(monthTxs)
  const invested = computeInvestedAmount(monthTxs)

  // capacity = income - expenses (money available after all real expenses)
  const capacity = balance  // balance = income - expenses from computeCashFlow

  if (capacity <= MIN_CAPACITY) return []

  const uninvested = capacity - invested
  if (uninvested <= MIN_CAPACITY) return []

  const investedPct = income > 0 ? (invested / income) * 100 : 0

  return [
    {
      id: 'investment_capacity',
      rule: 'investment_capacity',
      severity: 'info',
      message: `Você teve R$ ${fmt(uninvested)} disponíveis que não foram investidos`,
      detail: `Renda: R$ ${fmt(income)} · Gastos: R$ ${fmt(expenses)} · Investido: R$ ${fmt(invested)} (${fmt1(investedPct)}%)`,
      action: `Considere investir R$ ${fmt(uninvested)} que ficaram na conta`,
      value: uninvested,
      reference: capacity,
    },
  ]
}

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

function fmt1(n: number): string {
  return n.toFixed(1).replace('.', ',')
}
