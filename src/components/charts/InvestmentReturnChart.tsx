// Evolução do valor total investido ao longo do tempo (todas as corretoras).
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { MonthValue } from '@/investments/PerformanceEngine'
import { formatCurrency, formatCurrencyCompact, formatMonth } from '@/lib/format'

interface Props {
  data: MonthValue[]
}

export function InvestmentReturnChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        Sem dados de investimento para o gráfico
      </div>
    )
  }

  const chartData = data.map((d) => ({
    month: formatMonth(d.month).split(' ')[0].slice(0, 3) + '/' + d.month.slice(2, 4),
    label: formatMonth(d.month),
    Investido: d.value,
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="investFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip
          formatter={(v: number) => [formatCurrency(v), 'Investido']}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
          contentStyle={{
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            fontSize: '13px',
          }}
        />
        <Area
          type="monotone"
          dataKey="Investido"
          stroke="#2563eb"
          strokeWidth={2.5}
          fill="url(#investFill)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
