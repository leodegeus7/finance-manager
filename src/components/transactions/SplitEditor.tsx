// ============================================================
// SPLIT EDITOR — edição de divisão de gastos entre pessoas
// Controlado: recebe splits + onChange, sem estado interno
// Presets: Só eu | Casal 50/50 | 60% Leo | 100% [outro] | + Pessoa
// ============================================================

import { SplitParticipant } from '@/engine/types'

interface Props {
  splits: SplitParticipant[] | null  // null = individual (só o payer)
  payerUserId: string                 // user_id do pagador (ex: 'leo')
  onChange: (splits: SplitParticipant[] | null) => void
}

const COUPLE_USERS: Record<string, { name: string; user_id: string }> = {
  leo:    { name: 'Leonardo', user_id: 'leo' },
  murilo: { name: 'Murilo',   user_id: 'murilo' },
}

function getPartner(payerUserId: string) {
  return payerUserId === 'leo' ? COUPLE_USERS.murilo : COUPLE_USERS.leo
}

function getPayer(payerUserId: string) {
  return COUPLE_USERS[payerUserId] ?? { name: payerUserId, user_id: payerUserId }
}

// Fixed asymmetric preset: Leo always 60%, Murilo always 40%
const PRESET_LEO60: SplitParticipant[] = [
  { name: 'Leonardo', user_id: 'leo',    pct: 60 },
  { name: 'Murilo',   user_id: 'murilo', pct: 40 },
]

const PRESET_CASAL: SplitParticipant[] = [
  { name: 'Leonardo', user_id: 'leo',    pct: 50 },
  { name: 'Murilo',   user_id: 'murilo', pct: 50 },
]

function getOther100(payerUserId: string): SplitParticipant[] {
  const payer   = getPayer(payerUserId)
  const partner = getPartner(payerUserId)
  return [
    { name: payer.name,   user_id: payer.user_id,   pct: 0   },
    { name: partner.name, user_id: partner.user_id, pct: 100 },
  ]
}

function matchPreset(a: SplitParticipant[], b: SplitParticipant[]): boolean {
  return a.length === b.length && b.every((p, i) => a[i]?.user_id === p.user_id && a[i]?.pct === p.pct)
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
    if (payer?.pct === 0)  return `100% ${o.name}`
    if (payer?.pct === 50) return 'Casal 50/50'
    if (matchPreset(splits, PRESET_LEO60)) return '60% Leo'
    return `÷ ${o.name} (${o.pct}%)`
  }
  return `÷ ${splits.length} pessoas`
}

export function SplitEditor({ splits, payerUserId, onChange }: Props) {
  const payer   = getPayer(payerUserId)
  const partner = getPartner(payerUserId)
  const other100 = getOther100(payerUserId)

  const isIndividual = splits === null || splits.length <= 1
  const isCasal      = splits !== null && matchPreset(splits, PRESET_CASAL)
  const isLeo60      = splits !== null && matchPreset(splits, PRESET_LEO60)
  const isOther100   = splits !== null && matchPreset(splits, other100)
  const isCustom     = splits !== null && !isIndividual && !isCasal && !isLeo60 && !isOther100

  function addPerson() {
    const current = splits ?? [{ name: payer.name, user_id: payer.user_id, pct: 100 }]
    const others = current.filter((p) => p.user_id !== payerUserId)
    const newParticipant: SplitParticipant = { name: '', pct: 0 }
    const newOthers = [...others, newParticipant]
    const otherSum = newOthers.reduce((s, p) => s + (Number(p.pct) || 0), 0)
    const payerPct = Math.max(0, 100 - otherSum)
    onChange([{ name: payer.name, user_id: payer.user_id, pct: payerPct }, ...newOthers])
  }

  function updateParticipant(idx: number, field: 'name' | 'pct', value: string) {
    if (!splits) return
    const next = splits.map((p, i) => {
      if (i !== idx) return p
      return { ...p, [field]: field === 'pct' ? Math.min(100, Math.max(0, Number(value) || 0)) : value }
    })
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
    const payerIdx = next.findIndex((p) => p.user_id === payerUserId)
    if (payerIdx !== -1) {
      const otherSum = next.filter((_, i) => i !== payerIdx).reduce((s, p) => s + Number(p.pct), 0)
      next[payerIdx] = { ...next[payerIdx], pct: Math.max(0, 100 - otherSum) }
    }
    onChange(next)
  }

  const total = splits ? totalPct(splits) : 100
  const totalOk = total === 100

  const btnBase     = 'px-2 py-1 rounded-md text-xs font-medium transition-colors'
  const btnActive   = `${btnBase} bg-white shadow-sm text-gray-900`
  const btnInactive = `${btnBase} text-gray-400 hover:text-gray-600`

  return (
    <div className="space-y-2">
      {/* Preset buttons */}
      <div className="flex items-center gap-1 flex-wrap">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button className={isIndividual ? btnActive : btnInactive} onClick={() => onChange(null)}>
            Só eu
          </button>
          <button className={isCasal ? btnActive : btnInactive} onClick={() => onChange(PRESET_CASAL)}>
            Casal 50/50
          </button>
          <button className={isLeo60 ? btnActive : btnInactive} onClick={() => onChange(PRESET_LEO60)}>
            60% Leo
          </button>
          <button className={isOther100 ? btnActive : btnInactive} onClick={() => onChange(other100)}>
            100% {partner.name}
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
                    value={p.pct}
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
