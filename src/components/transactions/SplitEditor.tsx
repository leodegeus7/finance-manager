// ============================================================
// SPLIT EDITOR — edição de divisão de gastos entre pessoas
// Controlado: recebe splits + onChange, sem estado interno
// Presets: Só eu | Casal 50/50 | 100% Murilo | + Pessoa
// ============================================================

import { SplitParticipant } from '@/engine/types'

interface Props {
  splits: SplitParticipant[] | null  // null = individual (só o payer)
  payerUserId: string                 // user_id do pagador (ex: 'leo')
  payerName: string                   // nome de exibição (ex: 'Leonardo')
  onChange: (splits: SplitParticipant[] | null) => void
}

const PRESETS = {
  individual: null as SplitParticipant[] | null,
  casal: [
    { name: 'Leonardo', user_id: 'leo',    pct: 50 },
    { name: 'Murilo',   user_id: 'murilo', pct: 50 },
  ] as SplitParticipant[],
  murilo: [
    { name: 'Leonardo', user_id: 'leo',    pct: 0   },
    { name: 'Murilo',   user_id: 'murilo', pct: 100 },
  ] as SplitParticipant[],
}

function totalPct(splits: SplitParticipant[]): number {
  return splits.reduce((s, p) => s + (Number(p.pct) || 0), 0)
}

function splitLabel(splits: SplitParticipant[] | null, payerUserId: string): string {
  if (!splits || splits.length <= 1) return 'Só eu'
  const others = splits.filter((p) => p.user_id !== payerUserId)
  if (others.length === 1) {
    const o = others[0]
    const payer = splits.find((p) => p.user_id === payerUserId)
    if (payer?.pct === 0) return `100% ${o.name}`
    if (payer?.pct === 50) return 'Casal 50/50'
    return `÷ ${o.name} (${o.pct}%)`
  }
  return `÷ ${splits.length} pessoas`
}

export function SplitEditor({ splits, payerUserId, payerName, onChange }: Props) {
  const isCustom = splits !== null && !isPreset(splits)

  function isPreset(s: SplitParticipant[] | null): boolean {
    if (!s) return true // individual
    const casal = PRESETS.casal
    const murilo = PRESETS.murilo
    const matchCasal   = s.length === 2 && casal.every((p, i) => s[i]?.user_id === p.user_id && s[i]?.pct === p.pct)
    const matchMurilo  = s.length === 2 && murilo.every((p, i) => s[i]?.user_id === p.user_id && s[i]?.pct === p.pct)
    return matchCasal || matchMurilo
  }

  function addPerson() {
    const current = splits ?? [{ name: payerName, user_id: payerUserId, pct: 100 }]
    // Recalculate payer pct
    const others = current.filter((p) => p.user_id !== payerUserId)
    const newParticipant: SplitParticipant = { name: '', pct: 0 }
    const newOthers = [...others, newParticipant]
    const otherSum = newOthers.reduce((s, p) => s + (Number(p.pct) || 0), 0)
    const payerPct = Math.max(0, 100 - otherSum)
    onChange([{ name: payerName, user_id: payerUserId, pct: payerPct }, ...newOthers])
  }

  function updateParticipant(idx: number, field: 'name' | 'pct', value: string) {
    if (!splits) return
    const next = splits.map((p, i) => {
      if (i !== idx) return p
      return { ...p, [field]: field === 'pct' ? Math.min(100, Math.max(0, Number(value) || 0)) : value }
    })
    // Auto-adjust payer pct
    const payerIdx = next.findIndex((p) => p.user_id === payerUserId)
    if (payerIdx !== -1 && field === 'pct' && idx !== payerIdx) {
      const otherSum = next.filter((_, i) => i !== payerIdx).reduce((s, p) => s + Number(p.pct), 0)
      next[payerIdx] = { ...next[payerIdx], pct: Math.max(0, 100 - otherSum) }
    }
    onChange(next)
  }

  function removeParticipant(idx: number) {
    if (!splits) return
    const next = splits.filter((_, i) => i !== idx)
    if (next.length <= 1) { onChange(null); return }
    // Rebalance payer
    const payerIdx = next.findIndex((p) => p.user_id === payerUserId)
    if (payerIdx !== -1) {
      const otherSum = next.filter((_, i) => i !== payerIdx).reduce((s, p) => s + Number(p.pct), 0)
      next[payerIdx] = { ...next[payerIdx], pct: Math.max(0, 100 - otherSum) }
    }
    onChange(next)
  }

  const total = splits ? totalPct(splits) : 100
  const totalOk = total === 100

  const btnBase = 'px-2 py-1 rounded-md text-xs font-medium transition-colors'
  const btnActive = `${btnBase} bg-white shadow-sm text-gray-900`
  const btnInactive = `${btnBase} text-gray-400 hover:text-gray-600`

  const isIndividual = splits === null || splits.length <= 1
  const isCasal  = splits !== null && splits.length === 2 &&
    splits[0]?.user_id === 'leo' && splits[0]?.pct === 50 &&
    splits[1]?.user_id === 'murilo' && splits[1]?.pct === 50
  const isMurilo = splits !== null && splits.length === 2 &&
    splits[0]?.user_id === 'leo' && splits[0]?.pct === 0 &&
    splits[1]?.user_id === 'murilo' && splits[1]?.pct === 100

  return (
    <div className="space-y-2">
      {/* Preset buttons */}
      <div className="flex items-center gap-1 flex-wrap">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button className={isIndividual ? btnActive : btnInactive} onClick={() => onChange(null)}>
            Só eu
          </button>
          <button className={isCasal ? btnActive : btnInactive} onClick={() => onChange(PRESETS.casal)}>
            Casal 50/50
          </button>
          <button className={isMurilo ? btnActive : btnInactive} onClick={() => onChange(PRESETS.murilo)}>
            100% Murilo
          </button>
        </div>
        <button
          onClick={addPerson}
          className="text-xs text-blue-600 font-medium px-2 py-1 hover:underline"
        >
          + Pessoa
        </button>
      </div>

      {/* Custom participants list */}
      {splits && splits.length > 1 && (
        <div className="space-y-1.5 pl-1">
          {splits.map((p, idx) => {
            const isPayer = p.user_id === payerUserId
            return (
              <div key={idx} className="flex items-center gap-2">
                {isPayer ? (
                  <span className="text-xs text-gray-500 flex-1 truncate">{p.name} (eu)</span>
                ) : (
                  <input
                    type="text"
                    placeholder="Nome"
                    value={p.name}
                    onChange={(e) => updateParticipant(idx, 'name', e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={isPayer ? p.pct : p.pct}
                    readOnly={isPayer}
                    onChange={(e) => !isPayer && updateParticipant(idx, 'pct', e.target.value)}
                    className={`text-xs border rounded-lg px-2 py-1 w-14 text-right focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                      isPayer ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-default' : 'border-gray-200'
                    }`}
                  />
                  <span className="text-xs text-gray-400">%</span>
                </div>
                {!isPayer && (
                  <button
                    onClick={() => removeParticipant(idx)}
                    className="text-gray-300 hover:text-red-400 text-base leading-none w-4"
                  >×</button>
                )}
              </div>
            )
          })}
          {/* Total indicator */}
          <p className={`text-xs font-medium ${totalOk ? 'text-green-600' : 'text-red-500'}`}>
            Total: {total}% {totalOk ? '✓' : `(faltam ${100 - total}%)`}
          </p>
        </div>
      )}
    </div>
  )
}

/** Returns a compact display label for non-editing mode */
export function splitBadge(splits: SplitParticipant[] | null | undefined, payerUserId: string) {
  if (!splits || splits.length <= 1) return { label: 'individual', style: 'bg-gray-50 text-gray-400' }
  const label = splitLabel(splits, payerUserId)
  const hasShared = splits.some((p) => p.user_id !== payerUserId && p.pct > 0)
  return {
    label: hasShared ? `÷ ${label.replace('÷ ', '')}` : 'individual',
    style: hasShared ? 'bg-purple-50 text-purple-600' : 'bg-gray-50 text-gray-400',
  }
}
