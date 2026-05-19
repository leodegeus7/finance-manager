// ============================================================
// OWED SUMMARY — "Cobranças do mês"
// Agrega quanto cada pessoa deve ao pagador com base nos splits
// Só aparece quando há transações com splits definidos
// ============================================================

import { useMemo } from 'react'
import { Transaction } from '@/engine/types'
import { formatCurrency } from '@/lib/format'

interface OwedEntry {
  name: string
  amount: number
  count: number
}

interface Props {
  transactions: Transaction[]
  payerUserId: string
}

export function OwedSummary({ transactions, payerUserId }: Props) {
  const owed = useMemo(() => {
    const map = new Map<string, OwedEntry>()

    for (const tx of transactions) {
      if (!tx.splits || tx.splits.length <= 1) continue
      if (tx.direction !== 'expense') continue

      for (const participant of tx.splits) {
        if (participant.user_id === payerUserId) continue  // skip self
        if (participant.pct <= 0) continue

        const amount = tx.amount * (participant.pct / 100)
        const key = participant.name.toLowerCase()
        const existing = map.get(key)
        if (existing) {
          existing.amount += amount
          existing.count  += 1
        } else {
          map.set(key, { name: participant.name, amount, count: 1 })
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount)
  }, [transactions, payerUserId])

  if (owed.length === 0) return null

  const total = owed.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-amber-900">Cobranças do mês</p>
        <p className="text-sm font-bold text-amber-900 tabular-nums">{formatCurrency(total)}</p>
      </div>
      <div className="space-y-2">
        {owed.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-sm text-amber-800 font-medium">{entry.name}</span>
              <span className="text-xs text-amber-500">
                {entry.count} {entry.count === 1 ? 'item' : 'itens'}
              </span>
            </div>
            <span className="text-sm font-semibold text-amber-900 tabular-nums">
              {formatCurrency(entry.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
