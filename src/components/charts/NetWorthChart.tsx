// Dashboard Block 2 — patrimônio ao longo do tempo (UI Rule 3.2)
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { NetWorthSnapshot } from '@/investments/types'
import { formatCurrencyCompact, formatMonth } from '@/lib/format'

interface Props {
  data: NetWorthSnapshot[]
}

export function NetWorthChart({ data }: Props) {
  const sorted = [...data].sort((a, b) => a.month.localeCompare(b.month))

  const chartData = sorted.map((s) => ({
    month: formatMonth(s.month).split(' ')[0].slice(0, 3), // 'Abr'
    value: s.net_worth,
    label: formatMonth(s.month),
  }))

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        Sem dados suficientes para o gráfico
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          formatter={(v: number) => [formatCurrencyCompact(v), 'Patrimônio']}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
          contentStyle={{
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            fontSize: '13px',
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#2563eb"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5, fill: '#2563eb' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
