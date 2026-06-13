// Casal — gráfico de barras com gastos compartilhados por categoria
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts'
import { SharedCategoryBreakdown } from '@/couple/types'
import { formatCurrency, formatCurrencyCompact } from '@/lib/format'

interface Props {
  data: SharedCategoryBreakdown[]
  maxItems?: number
  onCategoryClick?: (categoryId: string) => void
}

export function SharedCategoryBarChart({ data, maxItems = Infinity, onCategoryClick }: Props) {
  const top = data.slice(0, maxItems)

  if (top.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        Sem gastos compartilhados neste mês
      </p>
    )
  }

  const chartData = top.map((c) => ({
    category_id: c.category_id,
    name: c.category_name,
    total: c.total,
  }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, top.length * 36)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
        onClick={(state) => {
          const payload = (state as unknown as { activePayload?: { payload: { category_id: string } }[] })?.activePayload
          const categoryId = payload?.[0]?.payload?.category_id
          if (categoryId) onCategoryClick?.(categoryId)
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tick={{ fontSize: 12, fill: '#374151' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(v: number) => [formatCurrency(v), 'Total']}
          contentStyle={{
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            fontSize: '13px',
          }}
        />
        <Bar
          dataKey="total"
          radius={[0, 6, 6, 0]}
          cursor={onCategoryClick ? 'pointer' : 'default'}
        >
          {chartData.map((entry) => (
            <Cell key={entry.category_id} fill="#60a5fa" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
