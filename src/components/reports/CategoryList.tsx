// Lista de categorias com progressive disclosure: mostra as top N por
// padrão e um "ver mais" expande o resto — evita repetir a barra inteira
// de categorias da planilha original de uma vez.
import { useState } from 'react'
import { CategoryBreakdown } from '@/engine/types'
import { formatCurrency } from '@/lib/format'

interface Props {
  data: CategoryBreakdown[]
  collapsedCount?: number
  emptyLabel: string
  tone: 'expense' | 'income'
}

export function CategoryList({ data, collapsedCount = 6, emptyLabel, tone }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (data.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">{emptyLabel}</p>
  }

  const visible = expanded ? data : data.slice(0, collapsedCount)
  const max = data[0].total
  const hidden = data.length - visible.length
  const barColor = tone === 'expense' ? 'bg-gray-400' : 'bg-green-400'

  return (
    <div className="space-y-3">
      {visible.map((cat) => (
        <div key={cat.category_id}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-gray-700 font-medium truncate max-w-[60%]">
              {cat.category_name}
            </span>
            <span className="text-sm font-semibold text-gray-900 tabular-nums">
              {formatCurrency(cat.total)}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${(cat.total / max) * 100}%` }} />
          </div>
        </div>
      ))}

      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-gray-400 hover:text-gray-700 transition-colors pt-1"
        >
          Ver mais {hidden} categoria{hidden !== 1 ? 's' : ''} →
        </button>
      )}
      {expanded && data.length > collapsedCount && (
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-gray-400 hover:text-gray-700 transition-colors pt-1"
        >
          Ver menos
        </button>
      )}
    </div>
  )
}
