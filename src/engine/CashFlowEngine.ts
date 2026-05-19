// ============================================================
// CASH FLOW ENGINE
//
// Core rule: only some transaction types affect cash flow.
//
// COUNTS as expense/income:
//   income              → income
//   expense             → expense
//   bill_payment        → expense
//   credit_card_purchase → expense
//
// DOES NOT COUNT:
//   transfer            → moves money between accounts (Rule 2.5)
//   credit_card_payment → already counted via credit_card_purchase (Rule 2.4)
//   investment_contribution → money changes form, not lost (Rule 7.3)
//   investment_withdrawal   → money changes form, not gained (Rule 7.3)
//   investment_adjustment   → no cash flow at all (Rule 7.2)
// ============================================================

import { Transaction, CashFlowSummary, CategoryBreakdown, TransactionFilter } from './types'
import { TransactionType } from '../import/types'

// Types that count toward real income in cash flow
const INCOME_TYPES = new Set<TransactionType>(['income'])

// Types that count toward real expenses in cash flow
const EXPENSE_TYPES = new Set<TransactionType>([
  'expense',
  'bill_payment',
  'credit_card_purchase',
])

// Types excluded from cash flow entirely
const EXCLUDED_TYPES = new Set<TransactionType>([
  'transfer',
  'credit_card_payment',
  'investment_adjustment',
])

/**
 * Returns true if this transaction counts as a real expense in cash flow.
 * This is the CRITICAL guard against double counting.
 */
export function isCountableExpense(tx: Transaction): boolean {
  return EXPENSE_TYPES.has(tx.type)
}

/**
 * Returns true if this transaction counts as real income in cash flow.
 */
export function isCountableIncome(tx: Transaction): boolean {
  return INCOME_TYPES.has(tx.type)
}

/**
 * Returns true if this transaction is excluded from cash flow.
 * Does not affect income or expense totals.
 */
export function isExcludedFromCashFlow(tx: Transaction): boolean {
  return EXCLUDED_TYPES.has(tx.type)
}

/**
 * Applies filters to a transaction list.
 *
 * By default:
 *   - Excludes transfers
 *   - Excludes credit_card_payments
 *   - Excludes investment_* types
 * These can be overridden via filter flags for reporting purposes.
 */
export function applyFilters(
  transactions: Transaction[],
  filter: TransactionFilter = {},
): Transaction[] {
  return transactions.filter((tx) => {
    // Month filter (competency_month)
    if (filter.month && tx.competency_month !== filter.month) return false

    // Context filter
    if (filter.context && tx.context !== filter.context) return false

    // Scope filter
    if (filter.scope && tx.scope !== filter.scope) return false

    // Category filter
    if (filter.category_id && tx.category_id !== filter.category_id) return false

    // Uncategorized only
    if (filter.uncategorized_only && tx.category_id != null) return false

    // Exclude transfers unless explicitly included
    if (!filter.include_transfers && tx.type === 'transfer') return false

    // Exclude credit_card_payments unless explicitly included
    if (!filter.include_cc_payments && tx.type === 'credit_card_payment') return false

    // Exclude investment types unless explicitly included
    if (
      !filter.include_investments &&
      (tx.type === 'investment_contribution' ||
        tx.type === 'investment_withdrawal' ||
        tx.type === 'investment_adjustment')
    ) return false

    return true
  })
}

/**
 * Computes the cash flow summary for a list of transactions.
 * Only processes transactions that have already been filtered.
 */
export function computeCashFlow(transactions: Transaction[]): CashFlowSummary {
  let income = 0
  let expenses = 0
  let investmentOut = 0
  let investmentIn = 0

  for (const tx of transactions) {
    if (isCountableIncome(tx)) {
      income += tx.amount
    } else if (isCountableExpense(tx)) {
      expenses += tx.amount
    } else if (tx.type === 'investment_contribution') {
      investmentOut += tx.amount
    } else if (tx.type === 'investment_withdrawal') {
      investmentIn += tx.amount
    }
    // transfer, credit_card_payment, investment_adjustment → ignored
  }

  return {
    income: round(income),
    expenses: round(expenses),
    balance: round(income - expenses),
    investment_out: round(investmentOut),
    investment_in: round(investmentIn),
  }
}

/**
 * Computes per-category expense breakdown.
 * Used for bar charts on Dashboard (Block 3) and Transactions page.
 *
 * Only counts expense-type transactions.
 * Returns sorted by total descending.
 */
export function computeCategoryBreakdown(transactions: Transaction[]): CategoryBreakdown[] {
  const map = new Map<string, CategoryBreakdown>()

  const expenseTxs = transactions.filter(isCountableExpense)
  const totalExpenses = expenseTxs.reduce((sum, tx) => sum + tx.amount, 0)

  for (const tx of expenseTxs) {
    const key = tx.category_id ?? '__uncategorized__'
    const name = tx.category_name ?? 'Sem categoria'
    const parent = tx.parent_category_name

    if (!map.has(key)) {
      map.set(key, {
        category_id: key,
        category_name: name,
        parent_category_name: parent,
        total: 0,
        transaction_count: 0,
        is_essential: tx.is_essential,
        percentage_of_total: 0,
      })
    }

    const entry = map.get(key)!
    entry.total += tx.amount
    entry.transaction_count++
  }

  // Compute percentages and round
  const result: CategoryBreakdown[] = []
  for (const entry of map.values()) {
    entry.total = round(entry.total)
    entry.percentage_of_total =
      totalExpenses > 0 ? round((entry.total / totalExpenses) * 100) : 0
    result.push(entry)
  }

  return result.sort((a, b) => b.total - a.total)
}

/**
 * Computes cost of living: sum of essential expenses only.
 * Rule 9.3: cost_of_living = sum of essential expenses
 */
export function computeCostOfLiving(transactions: Transaction[]): number {
  return round(
    transactions
      .filter((tx) => isCountableExpense(tx) && tx.is_essential)
      .reduce((sum, tx) => sum + tx.amount, 0),
  )
}

/**
 * Computes non-essential ratio: non-essential expenses / total income.
 * Used by the insight engine (Rule 10.2: non-essential ratio).
 */
export function computeNonEssentialRatio(transactions: Transaction[]): number {
  const income = transactions
    .filter(isCountableIncome)
    .reduce((sum, tx) => sum + tx.amount, 0)

  const nonEssential = transactions
    .filter((tx) => isCountableExpense(tx) && !tx.is_essential)
    .reduce((sum, tx) => sum + tx.amount, 0)

  if (income === 0) return 0
  return round((nonEssential / income) * 100)
}

/**
 * Sums investment contributions for a set of transactions.
 * Used for insight: invested / income vs target (Rule 10.2).
 */
export function computeInvestedAmount(transactions: Transaction[]): number {
  return round(
    transactions
      .filter((tx) => tx.type === 'investment_contribution')
      .reduce((sum, tx) => sum + tx.amount, 0),
  )
}

// ─── Utils ────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100
}
