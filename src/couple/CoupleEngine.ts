// ============================================================
// COUPLE ENGINE
//
// Rules from business_rules § 6:
//
//   6.1  Scope types: individual | shared
//   6.2  shared = enters the couple calculation
//   6.3  Monthly percentage rule (ex: Leo 60%, Murilo 40%)
//   6.4  Calculate: total_shared, paid_by_user, expected_by_rule, difference
//
// CRITICAL constraints:
//   - NEVER mutate original transactions (UI Rule 7.3)
//   - Only ANALYSIS — no data is changed
//   - Only expense-type transactions count toward shared balance
//   - Transfers, CC payments, investments excluded (CashFlow rules)
// ============================================================

import { Transaction } from '../engine/types'
import { isCountableExpense } from '../engine/CashFlowEngine'
import {
  SharingRule,
  UserMonthlyBalance,
  CoupleMonthlyReport,
  Settlement,
  SharedTransaction,
  SharedCategoryBreakdown,
  SharingRuleValidationError,
} from './types'

// ─── Validation ───────────────────────────────────────────────

/**
 * Validates a set of sharing rules for a given month.
 *
 * Requirements:
 *   - Each user appears at most once per month
 *   - All percentages must be between 0 and 100
 *   - All percentages for the same month must sum to exactly 100
 */
export function validateSharingRules(rules: SharingRule[]): SharingRuleValidationError[] {
  const errors: SharingRuleValidationError[] = []

  if (rules.length === 0) {
    errors.push({ field: 'rules', message: 'at least one sharing rule is required' })
    return errors
  }

  // Check individual percentages
  for (const rule of rules) {
    if (rule.percentage < 0 || rule.percentage > 100) {
      errors.push({
        field: 'percentage',
        message: `user ${rule.user_id}: percentage must be between 0 and 100 (got ${rule.percentage})`,
      })
    }
  }

  // Check for duplicate user in same month
  const seen = new Set<string>()
  for (const rule of rules) {
    const key = `${rule.user_id}::${rule.month}`
    if (seen.has(key)) {
      errors.push({
        field: 'user_id',
        message: `user ${rule.user_id} appears more than once for month ${rule.month}`,
      })
    }
    seen.add(key)
  }

  // Group by month and verify each month sums to 100
  const byMonth = new Map<string, SharingRule[]>()
  for (const rule of rules) {
    if (!byMonth.has(rule.month)) byMonth.set(rule.month, [])
    byMonth.get(rule.month)!.push(rule)
  }

  for (const [month, monthRules] of byMonth) {
    const total = monthRules.reduce((s, r) => s + r.percentage, 0)
    if (Math.abs(total - 100) > 0.01) {
      errors.push({
        field: 'percentage',
        message: `sharing rules for month ${month} sum to ${total}%, must be exactly 100%`,
      })
    }
  }

  return errors
}

// ─── Core Calculation ─────────────────────────────────────────

/**
 * Extracts shared expense transactions for a given month.
 *
 * Only countable expenses are included (Rule 6.2 + CashFlow rules).
 * Transfers, CC payments, and investments are excluded.
 */
export function getSharedExpenses(
  transactions: Transaction[],
  month: string,
): Transaction[] {
  return transactions.filter(
    (tx) =>
      tx.competency_month === month &&
      tx.scope === 'shared' &&
      isCountableExpense(tx),
  )
}

/**
 * Computes the full monthly couple report.
 *
 * Rule 6.4:
 *   total_shared     = sum(shared expenses that month)
 *   paid             = sum(shared expenses owned by this user)
 *   expected         = total_shared * (user's percentage / 100)
 *   difference       = paid - expected
 *
 * DOES NOT mutate any transaction.
 *
 * @param transactions  Full transaction list for both users
 * @param month         YYYY-MM-01
 * @param rules         Sharing rules for that month (must sum to 100)
 * @param userNames     Map of user_id → display name
 */
export function computeCoupleReport(
  transactions: Transaction[],
  month: string,
  rules: SharingRule[],
  userNames: Map<string, string>,
): CoupleMonthlyReport {
  const sharedExpenses = getSharedExpenses(transactions, month)
  const totalShared = round(sharedExpenses.reduce((s, tx) => s + tx.amount, 0))

  // Compute per-user balance
  const users: UserMonthlyBalance[] = rules.map((rule) => {
    const userTxs = sharedExpenses.filter((tx) => tx.user_id === rule.user_id)
    const paid = round(userTxs.reduce((s, tx) => s + tx.amount, 0))
    const expected = round(totalShared * (rule.percentage / 100))
    const difference = round(paid - expected)

    return {
      user_id: rule.user_id,
      user_name: userNames.get(rule.user_id) ?? rule.user_id,
      percentage: rule.percentage,
      paid,
      expected,
      difference,
      transaction_count: userTxs.length,
    }
  })

  return {
    month,
    total_shared: totalShared,
    users,
    settlement: computeSettlement(users),
  }
}

/**
 * Computes who owes whom after the month closes.
 *
 * Finds the user with a negative difference (underpaid) and the one
 * with a positive difference (overpaid). If perfectly balanced, returns null.
 */
export function computeSettlement(users: UserMonthlyBalance[]): Settlement | null {
  // Find the net debtor (difference < 0 = paid less than expected)
  const debtor = users.find((u) => u.difference < 0)
  const creditor = users.find((u) => u.difference > 0)

  if (!debtor || !creditor) return null

  return {
    debtor_user_id: debtor.user_id,
    creditor_user_id: creditor.user_id,
    amount: round(Math.abs(debtor.difference)),
  }
}

// ─── Timeline ─────────────────────────────────────────────────

/**
 * Builds a monthly couple balance history for all available months.
 * Used to show trends: "has the split been fair over time?"
 */
export function buildCoupleTimeline(
  transactions: Transaction[],
  rules: SharingRule[],
  userNames: Map<string, string>,
): CoupleMonthlyReport[] {
  // Get all months that have sharing rules defined
  const months = [...new Set(rules.map((r) => r.month))].sort()

  return months.map((month) => {
    const monthRules = rules.filter((r) => r.month === month)
    return computeCoupleReport(transactions, month, monthRules, userNames)
  })
}

// ─── Shared Category Breakdown ────────────────────────────────

/**
 * Breaks down shared expenses by category for a given month,
 * showing how much each user contributed to each category.
 *
 * Used to answer: "who spent more on food this month?"
 */
export function computeSharedCategoryBreakdown(
  transactions: Transaction[],
  month: string,
  userIds: [string, string],  // [leo_id, murilo_id]
): SharedCategoryBreakdown[] {
  const shared = getSharedExpenses(transactions, month)

  const map = new Map<string, SharedCategoryBreakdown>()

  for (const tx of shared) {
    const key = tx.category_id ?? '__uncategorized__'
    const name = tx.category_name ?? 'Sem categoria'

    if (!map.has(key)) {
      map.set(key, {
        category_id: key,
        category_name: name,
        total: 0,
        leo_paid: 0,
        murilo_paid: 0,
        transaction_count: 0,
      })
    }

    const entry = map.get(key)!
    entry.total = round(entry.total + tx.amount)
    entry.transaction_count++

    if (tx.user_id === userIds[0]) {
      entry.leo_paid = round(entry.leo_paid + tx.amount)
    } else if (tx.user_id === userIds[1]) {
      entry.murilo_paid = round(entry.murilo_paid + tx.amount)
    }
  }

  return [...map.values()].sort((a, b) => b.total - a.total)
}

// ─── Shared Transaction List ──────────────────────────────────

/**
 * Returns shared transactions for a month formatted for the UI.
 * Sorted by date descending.
 *
 * NEVER mutates the original transactions.
 */
export function listSharedTransactions(
  transactions: Transaction[],
  month: string,
): SharedTransaction[] {
  return getSharedExpenses(transactions, month)
    .map((tx) => ({
      id: tx.id,
      user_id: tx.user_id,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      category_name: tx.category_name,
      context: tx.context,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

// ─── Monthly Couple Summary (Casal page) ──────────────────────

/** First month the couple started using the system for shared tracking. */
export const COUPLE_START_MONTH = '2026-04-01'

export interface CoupleMonthSummary {
  month: string
  total: number        // total shared expenses (leoShare + muriloShare)
  leoPaid: number       // sum of tx.amount where tx.user_id === 'leo'
  muriloPaid: number    // sum of tx.amount where tx.user_id === 'murilo'
  leoShare: number      // sum of tx.amount * (leo's split pct / 100)
  muriloShare: number   // sum of tx.amount * (murilo's split pct / 100)
  settlement: Settlement | null
}

/**
 * Computes, for a single month, how much each partner actually paid vs.
 * how much they were supposed to pay according to each transaction's
 * splits — and the resulting settlement (who owes whom).
 *
 * Only considers shared, countable expenses (Rule 6.2 + CashFlow rules).
 * NEVER mutates any transaction.
 */
export function computeCoupleMonthSummary(
  transactions: Transaction[],
  month: string,
): CoupleMonthSummary {
  const shared = getSharedExpenses(transactions, month)

  let leoPaid = 0
  let muriloPaid = 0
  let leoShare = 0
  let muriloShare = 0

  for (const tx of shared) {
    const leoPct = tx.splits?.find((p) => p.user_id === 'leo')?.pct ?? 0
    const muriloPct = tx.splits?.find((p) => p.user_id === 'murilo')?.pct ?? 0

    leoShare += tx.amount * (leoPct / 100)
    muriloShare += tx.amount * (muriloPct / 100)

    if (tx.user_id === 'leo') {
      leoPaid += tx.amount
    } else if (tx.user_id === 'murilo') {
      muriloPaid += tx.amount
    }
  }

  leoPaid = round(leoPaid)
  muriloPaid = round(muriloPaid)
  leoShare = round(leoShare)
  muriloShare = round(muriloShare)

  const diff = round(leoPaid - leoShare)

  let settlement: Settlement | null = null
  if (diff > 0.01) {
    settlement = { debtor_user_id: 'murilo', creditor_user_id: 'leo', amount: diff }
  } else if (diff < -0.01) {
    settlement = { debtor_user_id: 'leo', creditor_user_id: 'murilo', amount: round(Math.abs(diff)) }
  }

  return {
    month,
    total: round(leoShare + muriloShare),
    leoPaid,
    muriloPaid,
    leoShare,
    muriloShare,
    settlement,
  }
}

// ─── Utils ────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100
}
