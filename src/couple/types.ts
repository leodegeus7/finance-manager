// ============================================================
// COUPLE LOGIC — TYPES
// ============================================================

// ─── Sharing Rule ─────────────────────────────────────────────

/**
 * A sharing rule defines one user's percentage for a given month.
 * All users' percentages for the same month must sum to 100.
 *
 * Rule 6.3: ex: April → Leonardo 60%, Murilo 40%
 */
export interface SharingRule {
  id: string
  user_id: string
  month: string       // YYYY-MM-01
  percentage: number  // 0–100
}

// ─── User Balance ─────────────────────────────────────────────

/**
 * The financial position of one user in a shared month.
 *
 * Rule 6.4:
 *   total_shared     = sum of all shared expense transactions that month
 *   paid             = what THIS user actually paid (their transactions, scope=shared)
 *   expected         = total_shared * (percentage / 100)
 *   difference       = paid - expected
 *     positive → overpaid (partner owes them)
 *     negative → underpaid (they owe partner)
 */
export interface UserMonthlyBalance {
  user_id: string
  user_name: string
  percentage: number

  paid: number        // actual amount paid by this user
  expected: number    // what they should pay per rule
  difference: number  // paid - expected

  transaction_count: number
}

// ─── Couple Monthly Report ────────────────────────────────────

export interface CoupleMonthlyReport {
  month: string

  total_shared: number        // total shared expenses that month
  users: UserMonthlyBalance[]

  // Convenience: who owes whom, and how much
  settlement: Settlement | null
}

/**
 * The net settlement: one user owes the other a specific amount.
 * null if perfectly balanced (difference === 0).
 */
export interface Settlement {
  debtor_user_id: string    // who needs to pay
  creditor_user_id: string  // who should receive
  amount: number            // absolute amount to transfer
}

// ─── Shared Transaction ───────────────────────────────────────

/**
 * A transaction marked as shared, with its user attribution.
 * These are the source records — never mutated (Rule 7.3 / UI Rule 7.3).
 */
export interface SharedTransaction {
  id: string
  user_id: string
  date: string
  description: string
  amount: number
  category_name?: string
  context: string
}

// ─── Category Breakdown (couple view) ─────────────────────────

export interface SharedCategoryBreakdown {
  category_id: string
  category_name: string
  total: number
  leo_paid: number
  murilo_paid: number
  transaction_count: number
}

// ─── Validation ───────────────────────────────────────────────

export interface SharingRuleValidationError {
  field: string
  message: string
}
