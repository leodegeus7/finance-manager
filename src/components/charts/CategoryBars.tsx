// Dashboard Block 3 — top categorias com barras horizontais (UI Rule 3.2)
import clsx from 'clsx'
import { CategoryBreakdown } from '@/engine/types'
import { formatCurrency } from '@/lib/format'

interface Props {
  data: CategoryBreakdown[]
  maxItems?: number
}

export function CategoryBars({ data, maxItems = 6 }: Props) {
  const top = data.slice(0, maxItems)

  if (top.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        Sem gastos categorizados neste mês
      </p>
    )
  }

  const max = top[0].total  // already sorted desc

  return (
    <div className="space-y-3">
      {top.map((cat) => (
        <div key={cat.category_id}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-gray-700 font-medium truncate max-w-[55%]">
              {cat.category_name}
            </span>
            <span className="text-sm font-semibold text-gray-900 tabular-nums">
              {formatCurrency(cat.total)}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-500',
                cat.is_essential ? 'bg-blue-400' : 'bg-gray-400',
              )}
              style={{ width: `${(cat.total / max) * 100}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {cat.percentage_of_total.toFixed(1)}% do total
          </p>
        </div>
      ))}
    </div>
  )
}
