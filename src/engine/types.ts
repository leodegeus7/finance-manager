// ============================================================
// TRANSACTION ENGINE — TYPES
// ============================================================

import { TransactionType, TransactionContext, TransactionScope } from '../import/types'

// A transaction as it exists in the DB (after import + enrichment)
export interface Transaction {
  id: string
  user_id: string
  account_id?: string
  credit_card_id?: string
  to_account_id?: string | null

  date: string             // ISO: YYYY-MM-DD
  competency_month: string // ISO: YYYY-MM-01
  statement_month?: string // ISO: YYYY-MM-01 (CC only)

  amount: number           // absolute, always >= 0
  signed_amount: number    // positive=income, negative=expense
  direction: 'income' | 'expense'
  type: TransactionType

  description: string
  category_id?: string
  category_name?: string   // joined from categories table
  parent_category_name?: string

  context: TransactionContext
  scope: TransactionScope
  splits?: SplitParticipant[] | null

  is_essential: boolean
  fixed_type?: 'fixed' | 'variable' | 'occasional'

  installment_current?: number
  installment_total?: number

  external_id: string
  source: string
  notes?: string
}

// ─── Splits ───────────────────────────────────────────────────
export interface SplitParticipant {
  name: string
  user_id?: string   // 'leo' | 'murilo' se usuário do sistema; null = terceiro
  pct: number        // 0–100; soma de todos os participantes deve = 100
}

// ─── Cash Flow ────────────────────────────────────────────────
export interface CashFlowSummary {
  income: number
  expenses: number
  balance: number          // income - expenses
  investment_out: number   // money that left as contributions (informational)
  investment_in: number    // money that came back as withdrawals (informational)
}

export interface CategoryBreakdown {
  category_id: string
  category_name: string
  parent_category_name?: string
  total: number            // absolute sum
  transaction_count: number
  is_essential: boolean
  percentage_of_total: number
}

export interface MonthlyBreakdown {
  month: string            // YYYY-MM-01
  summary: CashFlowSummary
  top_categories: CategoryBreakdown[]
  transactions: Transaction[]
}

// ─── Filters ──────────────────────────────────────────────────
export interface TransactionFilter {
  month?: string                    // YYYY-MM-01 — filter by competency_month
  context?: TransactionContext
  scope?: TransactionScope
  category_id?: string
  uncategorized_only?: boolean
  include_transfers?: boolean       // default false
  include_cc_payments?: boolean     // default false
  include_investments?: boolean     // default false
}

// ─── Categorization ───────────────────────────────────────────
export interface CategoryRule {
  id: string
  pattern: string          // text to match in description (case-insensitive)
  category_id: string
  category_name: string
  priority: number
}

export interface CategorySuggestion {
  category_id: string
  category_name: string
  confidence: 'high' | 'medium' | 'low'
  reason: 'exact_match' | 'pattern_rule' | 'history'
}
