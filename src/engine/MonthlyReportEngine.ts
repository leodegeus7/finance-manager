// ============================================================
// MONTHLY REPORT ENGINE
//
// Fechamento mensal por categoria, separado por origem (conta/cartão) e
// consolidado (total) — o mesmo recorte que o financeiro da fazenda usava
// numa planilha à parte. Reaproveita computeCategoryBreakdown/
// computeIncomeCategoryBreakdown (CashFlowEngine); só decide o agrupamento
// por origem. Função pura, não muta as transações.
// ============================================================

import { Transaction, CategoryBreakdown } from './types'
import { computeCategoryBreakdown, computeIncomeCategoryBreakdown } from './CashFlowEngine'

export interface ReportSection {
  despesas: CategoryBreakdown[]
  receitas: CategoryBreakdown[]
  totalDespesa: number
  totalReceita: number
}

export interface MonthlyReport {
  total: ReportSection
  conta: ReportSection
  cartao: ReportSection
}

function buildSection(txs: Transaction[]): ReportSection {
  const despesas = computeCategoryBreakdown(txs)
  const receitas = computeIncomeCategoryBreakdown(txs)
  return {
    despesas,
    receitas,
    totalDespesa: round(despesas.reduce((s, c) => s + c.total, 0)),
    totalReceita: round(receitas.reduce((s, c) => s + c.total, 0)),
  }
}

/**
 * `transactions` should already be filtered to the target month and to
 * cash-flow-countable types (see applyFilters) — this only splits by
 * origin (conta vs cartão) and builds the three sections.
 */
export function computeMonthlyReport(transactions: Transaction[]): MonthlyReport {
  const cartao = transactions.filter((tx) => tx.credit_card_id != null)
  const conta = transactions.filter((tx) => tx.credit_card_id == null)

  return {
    total: buildSection(transactions),
    conta: buildSection(conta),
    cartao: buildSection(cartao),
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
