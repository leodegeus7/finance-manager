// ============================================================
// INSIGHT ENGINE — ORCHESTRATOR
//
// Rule 10.3:
//   - max 5 insights
//   - each insight: message + severity + suggested action
//
// Runs all rules, deduplicates, ranks by severity, returns top 5.
//
// Rules run in priority order:
//   1. overspending      (critical/warning — most actionable)
//   2. top_increases     (warning)
//   3. spending_trend    (warning/critical/info)
//   4. non_essential     (warning/critical)
//   5. investment_target (warning/info)
//   6. investment_capacity (info)
//   7. couple_balance    (warning/info)
//   8. micro_expenses    (info — least urgent)
//
// Severity ranking for sorting:
//   critical > warning > info
// ============================================================

import { Insight, InsightContext, InsightRuleFn } from './types'
import { overspendingRule }        from './rules/overspending'
import { topIncreasesRule }        from './rules/topIncreases'
import { nonEssentialRatioRule }   from './rules/nonEssentialRatio'
import { microExpensesRule }       from './rules/microExpenses'
import { investmentTargetRule }    from './rules/investmentTarget'
import { investmentCapacityRule }  from './rules/investmentCapacity'
import { spendingTrendRule }       from './rules/spendingTrend'
import { coupleBalanceRule }       from './rules/coupleBalance'

// ─── Configuration ────────────────────────────────────────────

const MAX_INSIGHTS = 5

const SEVERITY_RANK: Record<Insight['severity'], number> = {
  critical: 3,
  warning:  2,
  info:     1,
}

// All rules in priority order
const ALL_RULES: InsightRuleFn[] = [
  overspendingRule,
  topIncreasesRule,
  spendingTrendRule,
  nonEssentialRatioRule,
  investmentTargetRule,
  investmentCapacityRule,
  coupleBalanceRule,
  microExpensesRule,
]

// ─── Engine ───────────────────────────────────────────────────

/**
 * Runs all insight rules for a given month and returns at most 5 insights,
 * ranked by severity (critical first) then by rule priority order.
 *
 * Rule 10.3: max 5 insights, each with message + severity + action.
 *
 * Rules that throw are silently skipped — insight engine failures
 * must never crash the UI.
 */
export function generateInsights(ctx: InsightContext): Insight[] {
  const allInsights: Insight[] = []
  const seenIds = new Set<string>()

  for (const rule of ALL_RULES) {
    try {
      const results = rule(ctx)
      for (const insight of results) {
        // Deduplicate by id
        if (seenIds.has(insight.id)) continue
        seenIds.add(insight.id)
        allInsights.push(insight)
      }
    } catch {
      // Silently skip failing rules — never crash the dashboard
    }
  }

  return rankInsights(allInsights).slice(0, MAX_INSIGHTS)
}

/**
 * Sorts insights by severity descending (critical first),
 * then preserves rule priority order within the same severity.
 */
function rankInsights(insights: Insight[]): Insight[] {
  return [...insights].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  )
}

// ─── Single-rule execution (for testing / previewing) ─────────

/**
 * Runs a single rule by name. Useful for:
 *   - Testing individual rules in isolation
 *   - Previewing what a rule would produce before finalizing
 */
export function runRule(
  ruleName: Insight['rule'],
  ctx: InsightContext,
): Insight[] {
  const ruleMap: Record<Insight['rule'], InsightRuleFn> = {
    overspending:         overspendingRule,
    top_increases:        topIncreasesRule,
    non_essential_ratio:  nonEssentialRatioRule,
    micro_expenses:       microExpensesRule,
    investment_target:    investmentTargetRule,
    investment_capacity:  investmentCapacityRule,
    spending_trend:       spendingTrendRule,
    couple_balance:       coupleBalanceRule,
  }

  const fn = ruleMap[ruleName]
  if (!fn) return []

  try {
    return fn(ctx)
  } catch {
    return []
  }
}

// ─── Severity helpers (used by UI) ────────────────────────────

export function insightColor(severity: Insight['severity']): string {
  switch (severity) {
    case 'critical': return 'red'
    case 'warning':  return 'yellow'
    case 'info':     return 'gray'
  }
}

export function insightIcon(severity: Insight['severity']): string {
  switch (severity) {
    case 'critical': return '🔴'
    case 'warning':  return '🟡'
    case 'info':     return '🔵'
  }
}
