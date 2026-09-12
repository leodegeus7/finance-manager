// ============================================================
// MONTHLY REPORT ENGINE
//
// Fechamento mensal por categoria, separado por origem (conta/cartão) e
// consolidado (total) — o mesmo recorte que o financeiro da fazenda usava
// numa planilha à parte. Função pura, não muta as transações.
//
// Diferença deliberada do CashFlowEngine "de verdade" (Dashboard/Transações):
// aqui `investment_contribution`/`investment_withdrawal` (ex.: a aplicação
// automática do Sicredi, que sobra/resgata o saldo todo dia) ENTRAM como
// despesa/receita — o financeiro precisa ver esse movimento pra reconciliar
// com o extrato e calcular o lucro real, mesmo não sendo gasto/renda "de
// verdade" pro fluxo de caixa do dia a dia (por isso ficam fora dos
// gráficos da Home). `include_investments: true` no applyFilters do
// caller é obrigatório pra essas transações chegarem até aqui.
// ============================================================

import { Transaction, CategoryBreakdown } from './types'
import { isCountableExpense, isCountableIncome, buildCategoryBreakdown } from './CashFlowEngine'

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

export function isReportExpense(tx: Transaction): boolean {
  return isCountableExpense(tx) || tx.type === 'investment_contribution'
}

export function isReportIncome(tx: Transaction): boolean {
  return isCountableIncome(tx) || tx.type === 'investment_withdrawal'
}

function buildSection(txs: Transaction[]): ReportSection {
  const despesas = buildCategoryBreakdown(txs.filter(isReportExpense))
  const receitas = buildCategoryBreakdown(txs.filter(isReportIncome))
  return {
    despesas,
    receitas,
    totalDespesa: round(despesas.reduce((s, c) => s + c.total, 0)),
    totalReceita: round(receitas.reduce((s, c) => s + c.total, 0)),
  }
}

/**
 * `transactions` should already be filtered to the target month, WITH
 * `include_investments: true` (see applyFilters) so the automatic sweep
 * shows up here — this only splits by origin (conta vs cartão) and builds
 * the three sections.
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
