// ============================================================
// INSIGHT ENGINE — TYPES
// ============================================================

// UI Rule 9.4: three severity levels
export type InsightSeverity = 'info' | 'warning' | 'critical'

// Rule 10.3: each insight has message + severity + suggested action
export interface Insight {
  id: string               // rule identifier, e.g. 'overspending:alimentacao'
  rule: InsightRule        // which rule produced this
  severity: InsightSeverity
  message: string          // human-readable, e.g. "Você gastou 32% a mais em Restaurantes"
  detail: string           // supporting numbers/context
  action: string           // suggested action, e.g. "Revise seus gastos com alimentação"
  value?: number           // primary numeric value for the insight
  reference?: number       // comparison value (e.g. average)
}

// Rule names — one per implemented rule
export type InsightRule =
  | 'overspending'
  | 'top_increases'
  | 'non_essential_ratio'
  | 'micro_expenses'
  | 'investment_target'
  | 'investment_capacity'
  | 'spending_trend'
  | 'couple_balance'

// Input passed to every rule function
export interface InsightContext {
  month: string                          // YYYY-MM-01 — the month being analyzed
  transactions: import('../engine/types').Transaction[]   // ALL transactions (multi-month)
  investmentTargetPct?: number           // user's investment goal (% of income)
  coupleRules?: import('../couple/types').SharingRule[]
  userIds?: string[]                     // [leo_id, murilo_id]
}

// Each rule is a pure function: context → Insight | null
export type InsightRuleFn = (ctx: InsightContext) => Insight[]
