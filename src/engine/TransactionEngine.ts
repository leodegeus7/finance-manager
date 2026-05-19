// ============================================================
// TRANSACTION ENGINE — MAIN ORCHESTRATOR
//
// Responsibilities:
//   - Apply filters respecting context and scope
//   - Compute cash flow (no double counting)
//   - Build monthly breakdown
//   - Validate transaction semantics before DB write
//   - Enforce all business rule constraints
// ============================================================

import {
  Transaction,
  CashFlowSummary,
  CategoryBreakdown,
  MonthlyBreakdown,
  TransactionFilter,
} from './types'

import {
  applyFilters,
  computeCashFlow,
  computeCategoryBreakdown,
  computeCostOfLiving,
  computeNonEssentialRatio,
  computeInvestedAmount,
  isCountableExpense,
  isCountableIncome,
} from './CashFlowEngine'

// ─── Month Resolution ─────────────────────────────────────────

/**
 * Returns all distinct competency months present in a transaction list,
 * sorted ascending.
 */
export function listCompetencyMonths(transactions: Transaction[]): string[] {
  const months = new Set(transactions.map((tx) => tx.competency_month))
  return [...months].sort()
}

// ─── Monthly Breakdown ────────────────────────────────────────

/**
 * Builds a complete breakdown for a single month.
 * Applies filters before any computation.
 *
 * This is the primary data structure consumed by the Dashboard and
 * the Transactions page.
 */
export function buildMonthlyBreakdown(
  allTransactions: Transaction[],
  month: string,
  filter: Omit<TransactionFilter, 'month'> = {},
): MonthlyBreakdown {
  const filtered = applyFilters(allTransactions, { ...filter, month })

  return {
    month,
    summary: computeCashFlow(filtered),
    top_categories: computeCategoryBreakdown(filtered),
    transactions: filtered,
  }
}

// ─── Context / Scope Engine ───────────────────────────────────

/**
 * Filters to personal context only.
 * Leonardo's default view.
 */
export function personalView(transactions: Transaction[]): Transaction[] {
  return applyFilters(transactions, { context: 'personal' })
}

/**
 * Filters to professional context only.
 * Murilo needs personal vs clinic separation.
 */
export function professionalView(transactions: Transaction[]): Transaction[] {
  return applyFilters(transactions, { context: 'professional' })
}

/**
 * Filters to shared scope only.
 * Used by the couple balance calculation.
 */
export function sharedOnly(transactions: Transaction[]): Transaction[] {
  return applyFilters(transactions, { scope: 'shared', include_transfers: false })
}

// ─── Couple Balance ───────────────────────────────────────────

export interface SharingRule {
  user_id: string
  percentage: number  // 0–100
}

export interface CoupleBalance {
  month: string
  total_shared: number
  users: Array<{
    user_id: string
    paid: number           // actual amount paid
    expected: number       // what they should pay per rule
    difference: number     // paid - expected (positive = overpaid, negative = underpaid)
    percentage: number
  }>
}

/**
 * Computes the couple balance for a given month.
 *
 * Rules (§ 6.4):
 *   total_shared     = sum of shared expense transactions
 *   paid_by_user     = sum of shared expenses owned by that user
 *   expected_by_rule = total_shared * (user's percentage / 100)
 *   difference       = paid_by_user - expected_by_rule
 *
 * CRITICAL: does NOT mutate any transactions. Analysis only (UI Rule 7.3).
 */
export function computeCoupleBalance(
  allTransactions: Transaction[],
  month: string,
  sharingRules: SharingRule[],
): CoupleBalance {
  // Only shared, expense-type transactions in this month
  const shared = allTransactions.filter(
    (tx) =>
      tx.competency_month === month &&
      tx.scope === 'shared' &&
      isCountableExpense(tx),
  )

  const totalShared = round(shared.reduce((sum, tx) => sum + tx.amount, 0))

  const userBalances = sharingRules.map((rule) => {
    const paid = round(
      shared
        .filter((tx) => tx.user_id === rule.user_id)
        .reduce((sum, tx) => sum + tx.amount, 0),
    )
    const expected = round(totalShared * (rule.percentage / 100))
    const difference = round(paid - expected)

    return {
      user_id: rule.user_id,
      paid,
      expected,
      difference,
      percentage: rule.percentage,
    }
  })

  return {
    month,
    total_shared: totalShared,
    users: userBalances,
  }
}

// ─── Semantic Validation ─────────────────────────────────────

export interface ValidationError {
  field: string
  message: string
}

/**
 * Validates all business rule constraints for a transaction.
 * Used before any DB write to prevent corrupt data.
 *
 * Returns empty array if valid.
 */
export function validateTransaction(tx: Partial<Transaction>): ValidationError[] {
  const errors: ValidationError[] = []

  // Required fields
  if (!tx.user_id)          errors.push({ field: 'user_id',     message: 'required' })
  if (!tx.date)             errors.push({ field: 'date',        message: 'required' })
  if (!tx.competency_month) errors.push({ field: 'competency_month', message: 'required' })
  if (tx.amount == null)    errors.push({ field: 'amount',      message: 'required' })
  if (!tx.description)      errors.push({ field: 'description', message: 'required' })
  if (!tx.type)             errors.push({ field: 'type',        message: 'required' })
  if (!tx.direction)        errors.push({ field: 'direction',   message: 'required' })
  if (!tx.context)          errors.push({ field: 'context',     message: 'required' })
  if (!tx.scope)            errors.push({ field: 'scope',       message: 'required' })
  if (!tx.external_id)      errors.push({ field: 'external_id', message: 'required' })
  if (!tx.source)           errors.push({ field: 'source',      message: 'required' })

  if (tx.amount != null && tx.amount < 0) {
    errors.push({ field: 'amount', message: 'must be >= 0 (use signed_amount for direction)' })
  }

  // Must have account or credit card
  if (!tx.account_id && !tx.credit_card_id) {
    errors.push({ field: 'account_id', message: 'transaction must belong to an account or credit card' })
  }

  // CC purchase must have statement_month
  if (tx.type === 'credit_card_purchase' && !tx.statement_month) {
    errors.push({ field: 'statement_month', message: 'required for credit_card_purchase' })
  }

  // CC purchase must belong to a card
  if (tx.type === 'credit_card_purchase' && !tx.credit_card_id) {
    errors.push({ field: 'credit_card_id', message: 'required for credit_card_purchase' })
  }

  // CC payment must belong to an account (it's a debit from the account)
  if (tx.type === 'credit_card_payment' && !tx.account_id) {
    errors.push({ field: 'account_id', message: 'required for credit_card_payment' })
  }

  // Direction must match signed_amount (Rule 2.2)
  if (tx.signed_amount != null && tx.direction) {
    if (tx.direction === 'income' && tx.signed_amount < 0) {
      errors.push({ field: 'signed_amount', message: 'income transactions must have positive signed_amount' })
    }
    if (tx.direction === 'expense' && tx.signed_amount > 0) {
      errors.push({ field: 'signed_amount', message: 'expense transactions must have negative signed_amount' })
    }
  }

  // CC purchase direction must be expense (Rule 3 / Handler 2 & 3)
  if (tx.type === 'credit_card_purchase' && tx.direction !== 'expense') {
    errors.push({ field: 'direction', message: 'credit_card_purchase must be expense' })
  }

  // Investment adjustment has no cash flow — cannot have account or card as financial source
  // (it's a purely virtual entry — Rule 7.2)
  if (tx.type === 'investment_adjustment' && tx.account_id) {
    errors.push({ field: 'type', message: 'investment_adjustment must not be linked to an account (no cash flow)' })
  }

  // Installment consistency
  const hasCurrent = tx.installment_current != null
  const hasTotal = tx.installment_total != null
  if (hasCurrent !== hasTotal) {
    errors.push({ field: 'installment_current', message: 'both installment_current and installment_total must be set together' })
  }
  if (hasCurrent && hasTotal) {
    if (tx.installment_current! < 1 || tx.installment_current! > tx.installment_total!) {
      errors.push({
        field: 'installment_current',
        message: `installment_current (${tx.installment_current}) out of range [1, ${tx.installment_total}]`,
      })
    }
  }

  return errors
}

// ─── Aggregation Helpers ──────────────────────────────────────

/**
 * Groups transactions by competency month.
 * Returns a Map of month → transactions[].
 */
export function groupByMonth(transactions: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const key = tx.competency_month
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(tx)
  }
  return map
}

/**
 * Computes 3-month rolling average of expenses per category.
 * Used by the insight engine (Rule 10.1: compare vs last 3 months).
 */
export function computeRollingAverage(
  transactions: Transaction[],
  referenceMonth: string,
  monthsBack = 3,
): Map<string, number> {
  // Get the N months before referenceMonth
  const refDate = new Date(referenceMonth)
  const priorMonths: string[] = []

  for (let i = 1; i <= monthsBack; i++) {
    const d = new Date(refDate)
    d.setMonth(d.getMonth() - i)
    priorMonths.push(d.toISOString().slice(0, 7) + '-01')
  }

  // Sum per category per prior month, then average
  const categoryTotals = new Map<string, number[]>()

  for (const month of priorMonths) {
    const monthTxs = transactions.filter(
      (tx) => tx.competency_month === month && isCountableExpense(tx),
    )
    const breakdown = computeCategoryBreakdown(monthTxs)

    for (const cat of breakdown) {
      if (!categoryTotals.has(cat.category_id)) {
        categoryTotals.set(cat.category_id, [])
      }
      categoryTotals.get(cat.category_id)!.push(cat.total)
    }
  }

  const averages = new Map<string, number>()
  for (const [catId, totals] of categoryTotals) {
    const avg = totals.reduce((s, v) => s + v, 0) / monthsBack
    averages.set(catId, round(avg))
  }

  return averages
}

// ─── Utils ────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100
}

// Re-export helpers consumers need
export {
  applyFilters,
  computeCashFlow,
  computeCategoryBreakdown,
  computeCostOfLiving,
  computeNonEssentialRatio,
  computeInvestedAmount,
  isCountableExpense,
  isCountableIncome,
}
