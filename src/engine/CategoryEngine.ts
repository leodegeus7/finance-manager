// ============================================================
// CATEGORY ENGINE
//
// Rules:
//   4.1 — Categories are GLOBAL (same for account, card, any source)
//   4.3 — System suggests based on history; user can override
//
// Strategy:
//   1. Exact description match (history from previous transactions)
//   2. Pattern rule match (category_rules table)
//   3. No suggestion if no match found (user must categorize manually)
//
// The engine NEVER creates categories — it only suggests.
// User override is always respected.
// ============================================================

import { Transaction, CategoryRule, CategorySuggestion } from './types'

/**
 * Suggests a category for a transaction based on:
 *   1. Exact description match in transaction history
 *   2. Pattern rule match from category_rules
 *
 * Returns null if no confident suggestion can be made.
 */
export function suggestCategory(
  tx: Pick<Transaction, 'description' | 'type' | 'source'>,
  history: Transaction[],
  rules: CategoryRule[],
): CategorySuggestion | null {
  const description = tx.description.toLowerCase().trim()

  // ── Step 1: Exact match in history ───────────────────────
  // Find most recently used category for the same description
  const exactMatches = history.filter(
    (h) =>
      h.description.toLowerCase().trim() === description &&
      h.category_id != null,
  )

  if (exactMatches.length > 0) {
    // Use the most recent match
    const best = exactMatches[exactMatches.length - 1]
    return {
      category_id: best.category_id!,
      category_name: best.category_name ?? '',
      confidence: 'high',
      reason: 'exact_match',
    }
  }

  // ── Step 2: Pattern rule match ────────────────────────────
  // Rules sorted by priority descending (higher priority = checked first)
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority)

  for (const rule of sortedRules) {
    if (description.includes(rule.pattern.toLowerCase())) {
      return {
        category_id: rule.category_id,
        category_name: rule.category_name,
        confidence: 'medium',
        reason: 'pattern_rule',
      }
    }
  }

  // ── Step 3: Partial description match in history ─────────
  // Useful for "Uber Eats" matching "Uber" history
  const words = description.split(/\s+/).filter((w) => w.length > 3)

  for (const word of words) {
    const partialMatches = history.filter(
      (h) =>
        h.description.toLowerCase().includes(word) &&
        h.category_id != null,
    )

    if (partialMatches.length >= 2) {
      // Only suggest if seen at least twice (reduces false positives)
      const best = partialMatches[partialMatches.length - 1]
      return {
        category_id: best.category_id!,
        category_name: best.category_name ?? '',
        confidence: 'low',
        reason: 'history',
      }
    }
  }

  return null
}

/**
 * Batch-suggests categories for a list of transactions.
 * Transactions that already have a category_id are skipped.
 *
 * Returns a map of transaction_id → CategorySuggestion.
 */
export function batchSuggestCategories(
  uncategorized: Transaction[],
  history: Transaction[],
  rules: CategoryRule[],
): Map<string, CategorySuggestion> {
  const suggestions = new Map<string, CategorySuggestion>()

  for (const tx of uncategorized) {
    if (tx.category_id) continue  // already categorized

    const suggestion = suggestCategory(tx, history, rules)
    if (suggestion) {
      suggestions.set(tx.id, suggestion)
    }
  }

  return suggestions
}

/**
 * Counts how many transactions in a list have no category.
 * Used to drive the "uncategorized first" sort in the Transactions page (UI Rule 4.5).
 */
export function countUncategorized(transactions: Transaction[]): number {
  return transactions.filter((tx) => !tx.category_id).length
}

/**
 * Sorts transactions putting uncategorized first, then by date descending.
 * Implements UI Rule 4.5: "mostrar transações sem categoria primeiro".
 */
export function sortWithUncategorizedFirst(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    const aUncat = !a.category_id ? 0 : 1
    const bUncat = !b.category_id ? 0 : 1

    if (aUncat !== bUncat) return aUncat - bUncat

    // Same categorization status → sort by date descending
    return b.date.localeCompare(a.date)
  })
}
