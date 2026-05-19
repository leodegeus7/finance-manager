// ============================================================
// RULE: MICRO EXPENSES
//
// Rule 10.2: sum small recurring transactions
//
// Small = amount <= R$ 50
// Recurring = same description appears >= 3 times in the month
//
// These individually feel insignificant but compound into
// a meaningful total the user likely hasn't noticed.
// ============================================================

import { Insight, InsightContext } from '../types'
import { applyFilters } from '../../engine/CashFlowEngine'
import { isCountableExpense } from '../../engine/CashFlowEngine'

const MICRO_THRESHOLD = 50      // R$ — below this is "micro"
const MIN_OCCURRENCES = 3       // must appear at least this many times

export function microExpensesRule(ctx: InsightContext): Insight[] {
  const { month, transactions } = ctx

  const monthTxs = applyFilters(transactions, { month })
    .filter(isCountableExpense)
    .filter((tx) => tx.amount <= MICRO_THRESHOLD)

  if (monthTxs.length === 0) return []

  // Group by normalized description
  const groups = new Map<string, { total: number; count: number; sample: string }>()

  for (const tx of monthTxs) {
    const key = tx.description.toLowerCase().trim()
    if (!groups.has(key)) {
      groups.set(key, { total: 0, count: 0, sample: tx.description })
    }
    const g = groups.get(key)!
    g.total += tx.amount
    g.count++
  }

  // Only keep groups that appear >= MIN_OCCURRENCES times
  const recurring = [...groups.values()].filter((g) => g.count >= MIN_OCCURRENCES)

  if (recurring.length === 0) return []

  // Sum all micro recurring expenses together
  const total = recurring.reduce((s, g) => s + g.total, 0)
  const totalOccurrences = recurring.reduce((s, g) => s + g.count, 0)
  const topItem = recurring.sort((a, b) => b.total - a.total)[0]

  return [
    {
      id: 'micro_expenses',
      rule: 'micro_expenses',
      severity: 'info',
      message: `Pequenos gastos recorrentes somaram R$ ${fmt(total)} este mês`,
      detail: `${totalOccurrences} transações abaixo de R$ ${MICRO_THRESHOLD} · Maior: "${topItem.sample}" (${topItem.count}x = R$ ${fmt(topItem.total)})`,
      action: 'Avalie se esses gastos recorrentes são necessários no seu dia a dia',
      value: total,
    },
  ]
}

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',')
}
