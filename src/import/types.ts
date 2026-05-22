// ============================================================
// IMPORT SYSTEM — SHARED TYPES
// ============================================================

import type { SplitParticipant } from '@/engine/types'

export type TransactionDirection = 'income' | 'expense'

export type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'credit_card_payment'
  | 'credit_card_purchase'
  | 'investment_contribution'
  | 'investment_withdrawal'
  | 'investment_adjustment'
  | 'bill_payment'

export type TransactionContext = 'personal' | 'professional'
export type TransactionScope = 'individual' | 'shared'
export type FixedType = 'fixed' | 'variable' | 'occasional'

// Raw row as parsed from CSV — strings only, no transformation yet
export interface RawRow {
  [key: string]: string
}

// Fully normalized transaction ready for DB insertion
export interface NormalizedTransaction {
  // Source
  source: string           // 'nubank_account' | 'nubank_credit' | 'c6_credit'
  external_id: string      // unique per source — idempotency key

  // Date fields
  date: string             // ISO: YYYY-MM-DD
  competency_month: string // ISO: YYYY-MM-01 (first day of month)
  statement_month?: string // ISO: YYYY-MM-01 (CC only)

  // Amount fields (Rule 2.2)
  amount: number           // absolute, always >= 0
  signed_amount: number    // positive=income, negative=expense
  direction: TransactionDirection

  // Type (Rule 2.3)
  type: TransactionType

  // Description
  description: string

  // Classification (defaults — user can override)
  context: TransactionContext
  scope: TransactionScope

  // Installments — C6 only
  installment_current?: number
  installment_total?: number

  // Per-transaction linkage — overrides context when set (multi-source handlers)
  // null = explicitly no ID; undefined = fall back to context
  credit_card_id?: string | null
  account_id?: string | null

  // Pre-populated classification hints from handler (user can override in UI)
  suggested_category_id?: string
  suggested_context?: TransactionContext
  suggested_splits?: SplitParticipant[] | null
}

// Handler interface — every handler MUST implement these three
export interface ImportHandler {
  source: string

  /** Returns true if this handler owns the given file */
  identify(fileName: string, headers: string[]): boolean

  /** Parses raw CSV text into rows */
  parse(fileContent: string): RawRow[]

  /** Normalizes raw rows into NormalizedTransactions */
  normalize(rows: RawRow[], context: HandlerContext): NormalizedTransaction[]
}

// Context passed to normalize() — carries runtime IDs
export interface HandlerContext {
  userId: string
  accountId?: string
  accountIdRdb?: string       // RDB/investment account (e.g. Nubank RDB)
  creditCardId?: string
  creditCardIdInter?: string  // secondary card for multi-source handlers
  statementMonth?: string     // YYYY-MM-01 — caller sets this for CC imports
}

// Full result of a pipeline run
export interface ImportResult {
  source: string
  filename: string
  total: number
  imported: number
  skipped: number
  errors: ImportError[]
  transactions: NormalizedTransaction[]
}

export interface ImportError {
  row: number
  rawData: RawRow
  message: string
}
