// Composição por ativo de uma corretora (o que tem DENTRO), agrupado por classe.
// Snapshot do PosicaoDetalhada (XP). Só visualização.
import { useMemo, useState } from 'react'
import { Card, CardTitle } from '@/components/ui/Card'
import { HoldingRow } from '@/lib/db/investments'
import { formatCurrency, formatMonth } from '@/lib/format'

interface Props {
  holdings: HoldingRow[]
}

const CLASS_LABEL: Record<string, string> = {
  acao: 'Ações',
  fii: 'Fundos Imobiliários',
  fundo: 'Fundos',
  renda_fixa: 'Renda Fixa',
}
const CLASS_ORDER = ['acao', 'fii', 'fundo', 'renda_fixa']

function Pct({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-300">—</span>
  const color = value > 0 ? 'text-green-600' : value < 0 ? 'text-red-600' : 'text-gray-500'
  return <span className={`tabular-nums ${color}`}>{value > 0 ? '+' : ''}{value}%</span>
}

function ClassSection({ label, rows }: { label: string; rows: HoldingRow[] }) {
  const [open, setOpen] = useState(true)
  const subtotal = rows.reduce((s, r) => s + r.market_value, 0)

  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-2.5 text-left"
      >
        <span className="text-sm font-semibold text-gray-800">
          {label} <span className="text-xs font-normal text-gray-400">· {rows.length}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-gray-900">{formatCurrency(subtotal)}</span>
          <span className={`text-gray-400 text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
        </span>
      </button>

      {open && (
        <div className="pb-2">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between py-1.5 pl-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-gray-800 truncate">{r.ticker ?? r.name}</p>
                {r.ticker && r.ticker !== r.name && (
                  <p className="text-[11px] text-gray-400 truncate">{r.name}</p>
                )}
              </div>
              <div className="flex items-center gap-4 shrink-0 text-right">
                <span className="w-12 text-xs text-gray-400 tabular-nums">
                  {r.pct_alloc != null ? `${r.pct_alloc}%` : ''}
                </span>
                <span className="w-24 tabular-nums text-gray-900">{formatCurrency(r.market_value)}</span>
                <span className="w-16"><Pct value={r.return_pct} /></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function HoldingsCard({ holdings }: Props) {
  const custodian = holdings[0]?.custodian ?? ''
  const snapshot = holdings[0]?.snapshot_date

  const sections = useMemo(() => {
    const byClass = new Map<string, HoldingRow[]>()
    for (const h of holdings) {
      if (!byClass.has(h.asset_class)) byClass.set(h.asset_class, [])
      byClass.get(h.asset_class)!.push(h)
    }
    return [...byClass.entries()]
      .sort((a, b) => CLASS_ORDER.indexOf(a[0]) - CLASS_ORDER.indexOf(b[0]))
      .map(([cls, rows]) => ({
        cls,
        label: CLASS_LABEL[cls] ?? cls,
        rows: [...rows].sort((x, y) => y.market_value - x.market_value),
      }))
  }, [holdings])

  if (holdings.length === 0) return null

  const total = holdings.reduce((s, h) => s + h.market_value, 0)

  return (
    <Card padding="md">
      <div className="flex items-baseline justify-between gap-3">
        <CardTitle className="mb-0">Composição da {custodian}</CardTitle>
        <span className="text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(total)}</span>
      </div>
      <p className="text-xs text-gray-400 -mt-0.5 mb-1">
        {holdings.length} ativos{snapshot ? ` · ${formatMonth(snapshot.slice(0, 7) + '-01')}` : ''} · rentabilidade = preço atual vs. preço médio
      </p>

      <div className="mt-2">
        {sections.map((s) => (
          <ClassSection key={s.cls} label={s.label} rows={s.rows} />
        ))}
      </div>
    </Card>
  )
}
