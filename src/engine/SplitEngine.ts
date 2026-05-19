// ============================================================
// SPLIT ENGINE
// Computa quem deve quanto ao pagador a partir das transactions
// com splits do mês.
// ============================================================

import { Transaction } from './types'

export interface ParticipantSummary {
  name: string
  user_id?: string
  owed: number    // quanto deve ao payer (Leo)
  count: number   // nº de transações
  transactions: Transaction[]
}

export interface SplitReport {
  // Visão Casal (Leo + Murilo)
  couple: {
    total: number           // total das despesas compartilhadas casal
    leoShare: number        // parcela do Leo
    muriloShare: number     // parcela que Murilo deve pagar
    count: number
    transactions: Transaction[]
  } | null

  // Outros splits (terceiros)
  others: ParticipantSummary[]
}

export function computeSplitReport(
  transactions: Transaction[],
  payerUserId: string,
): SplitReport {
  const coupleTransactions: Transaction[] = []
  let leoShare    = 0
  let muriloShare = 0

  const othersMap = new Map<string, ParticipantSummary>()

  for (const tx of transactions) {
    if (!tx.splits || tx.splits.length <= 1) continue
    if (tx.direction !== 'expense') continue

    let isCoupleOnly = true

    for (const p of tx.splits) {
      if (p.user_id === payerUserId) continue // skip self
      if (p.pct <= 0) continue

      // Is this a known system user (leo/murilo)?
      const isSystemUser = p.user_id === 'leo' || p.user_id === 'murilo'

      if (!isSystemUser) {
        isCoupleOnly = false
      }

      const amount = tx.amount * (p.pct / 100)

      if (p.user_id === 'murilo') {
        muriloShare += amount
      } else {
        // Third-party participant
        isCoupleOnly = false
        const key = p.name.toLowerCase()
        const existing = othersMap.get(key)
        if (existing) {
          existing.owed  += amount
          existing.count += 1
          existing.transactions.push(tx)
        } else {
          othersMap.set(key, {
            name: p.name,
            user_id: p.user_id,
            owed: amount,
            count: 1,
            transactions: [tx],
          })
        }
      }
    }

    // Compute Leo's own share for couple-only transactions
    if (isCoupleOnly || tx.splits.some((p) => p.user_id === 'murilo' && p.pct > 0)) {
      const leoPct = tx.splits.find((p) => p.user_id === payerUserId)?.pct ?? 0
      leoShare += tx.amount * (leoPct / 100)
      coupleTransactions.push(tx)
    }
  }

  const coupleTotal = leoShare + muriloShare
  const others = Array.from(othersMap.values()).sort((a, b) => b.owed - a.owed)

  return {
    couple: coupleTransactions.length > 0
      ? { total: coupleTotal, leoShare, muriloShare, count: coupleTransactions.length, transactions: coupleTransactions }
      : null,
    others,
  }
}
