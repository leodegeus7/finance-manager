// ============================================================
// RULE: COUPLE BALANCE
//
// Rule 10.2: diferença entre esperado e real
//
// Fires when the split is significantly off from the agreed rule.
// The threshold is relative to total_shared to avoid noise on
// small imbalances (R$ 2 difference on a R$ 5000 month is irrelevant).
// ============================================================

import { Insight, InsightContext } from '../types'
import { computeCoupleReport } from '../../couple/CoupleEngine'

// Minimum imbalance as % of total_shared to trigger insight
const IMBALANCE_THRESHOLD_PCT = 0.05  // 5% of total_shared

export function coupleBalanceRule(ctx: InsightContext): Insight[] {
  const { month, transactions, coupleRules, userIds } = ctx

  if (!coupleRules || coupleRules.length === 0) return []
  if (!userIds || userIds.length < 2) return []

  const monthRules = coupleRules.filter((r) => r.month === month)
  if (monthRules.length === 0) return []

  const userNames = new Map([
    [userIds[0], 'Leonardo'],
    [userIds[1], 'Murilo'],
  ])

  const report = computeCoupleReport(transactions, month, monthRules, userNames)

  if (report.total_shared === 0) return []
  if (!report.settlement) return []

  const { settlement } = report
  const imbalancePct = settlement.amount / report.total_shared

  if (imbalancePct < IMBALANCE_THRESHOLD_PCT) return []

  const debtor = report.users.find((u) => u.user_id === settlement.debtor_user_id)!
  const creditor = report.users.find((u) => u.user_id === settlement.creditor_user_id)!
  const imbalancePctDisplay = Math.round(imbalancePct * 100)
  const severity = imbalancePct >= 0.15 ? 'warning' : 'info'

  return [
    {
      id: 'couple_balance',
      rule: 'couple_balance',
      severity,
      message: `${debtor.user_name} pagou R$ ${fmt(settlement.amount)} a menos que o combinado`,
      detail: `${debtor.user_name}: pagou R$ ${fmt(debtor.paid)}, deveria R$ ${fmt(debtor.expected)} (${debtor.percentage}%) · Total compartilhado: R$ ${fmt(report.total_shared)}`,
      action: `${debtor.user_name} deve R$ ${fmt(settlement.amount)} para ${creditor.user_name} referente a este mês`,
      value: settlement.amount,
      reference: report.total_shared,
    },
  ]
}

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',')
}
