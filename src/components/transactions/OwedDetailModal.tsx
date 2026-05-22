import { useMemo } from 'react'
import { Transaction, SplitParticipant } from '@/engine/types'
import { formatCurrency, formatDate } from '@/lib/format'

interface Props {
  personName: string
  transactions: Transaction[]
  payerUserId: string
  onClose: () => void
}

const PRESET_CASAL = { leo: 50, murilo: 50 }
const PRESET_LEO60 = { leo: 60, murilo: 40 }

function splitLabel(splits: SplitParticipant[], payerUserId: string): string {
  if (splits.length <= 1) return 'Só eu'
  const leo    = splits.find(p => p.user_id === 'leo')
  const murilo = splits.find(p => p.user_id === 'murilo')
  if (leo && murilo) {
    if (leo.pct === PRESET_CASAL.leo && murilo.pct === PRESET_CASAL.murilo) return 'Casal 50/50'
    if (leo.pct === PRESET_LEO60.leo  && murilo.pct === PRESET_LEO60.murilo)  return '60% Leo'
    const payer   = splits.find(p => p.user_id === payerUserId)
    const partner = splits.find(p => p.user_id !== payerUserId)
    if (payer?.pct === 0 && partner)   return `100% ${partner.name}`
    if (partner) return `${partner.pct}% ${partner.name}`
  }
  const others = splits.filter(p => p.user_id !== payerUserId)
  return others.map(p => `${p.pct}% ${p.name}`).join(', ')
}

const SPLIT_COLORS: Record<string, string> = {
  'Casal 50/50': 'bg-purple-50 text-purple-600',
  '60% Leo':     'bg-blue-50 text-blue-600',
}
function splitBadgeStyle(label: string, payerUserId: string): string {
  if (SPLIT_COLORS[label]) return SPLIT_COLORS[label]
  if (label.startsWith('100%')) return payerUserId === 'leo' ? 'bg-orange-50 text-orange-600' : 'bg-indigo-50 text-indigo-600'
  return 'bg-gray-100 text-gray-500'
}

export function OwedDetailModal({ personName, transactions, payerUserId, onClose }: Props) {
  const nameKey = personName.toLowerCase()

  const txs = useMemo(() => {
    return transactions
      .filter(tx => {
        if (!tx.splits || tx.splits.length <= 1) return false
        if (tx.direction !== 'expense') return false
        return tx.splits.some(p => p.name.toLowerCase() === nameKey && p.pct > 0 && p.user_id !== payerUserId)
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [transactions, nameKey, payerUserId])

  const total = txs.reduce((s, tx) => {
    const p = tx.splits!.find(p => p.name.toLowerCase() === nameKey)!
    return s + tx.amount * (p.pct / 100)
  }, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div>
            <p className="text-base font-semibold text-gray-900">{personName}</p>
            <p className="text-xs text-gray-400">{txs.length} {txs.length === 1 ? 'transação' : 'transações'}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-gray-400">Total a receber</p>
              <p className="text-base font-bold text-amber-700 tabular-nums">{formatCurrency(total)}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        </div>

        {/* Transaction list */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
          {txs.map(tx => {
            const participant = tx.splits!.find(p => p.name.toLowerCase() === nameKey)!
            const share = tx.amount * (participant.pct / 100)
            const label = splitLabel(tx.splits!, payerUserId)
            const badgeStyle = splitBadgeStyle(label, payerUserId)

            return (
              <div key={tx.id} className="px-5 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400 tabular-nums shrink-0">{formatDate(tx.date)}</span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md shrink-0 ${badgeStyle}`}>
                      {label}
                    </span>
                    {tx.category_name && (
                      <span className="text-xs text-gray-400 truncate">
                        {tx.parent_category_name ? `${tx.parent_category_name} › ` : ''}{tx.category_name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 truncate mt-0.5">{tx.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatCurrency(share)}</p>
                  <p className="text-xs text-gray-400">{participant.pct}% de {formatCurrency(tx.amount)}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
