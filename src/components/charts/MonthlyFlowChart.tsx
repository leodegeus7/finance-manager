// Dashboard — receita, despesas e investimentos mês a mês
import {
  ResponsiveContainer, BarChart, Bar, Line, ComposedChart,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { MonthlyFinancialPoint } from '@/engine/CashFlowEngine'
import { formatCurrency, formatCurrencyCompact, formatMonth } from '@/lib/format'

interface Props {
  data: MonthlyFinancialPoint[]
}

export function MonthlyFlowChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        Sem dados suficientes para o gráfico
      </div>
    )
  }

  const chartData = data.map((d) => ({
    month: formatMonth(d.month).split(' ')[0].slice(0, 3),
    label: formatMonth(d.month),
    Receita: d.income,
    Despesas: d.expenses,
    Investimentos: d.investments,
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
          width={56}
        />
        <Tooltip
          formatter={(v: number, name: string) => [formatCurrency(v), name]}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
          contentStyle={{
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            fontSize: '13px',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        <Bar dataKey="Receita" fill="#34d399" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Despesas" fill="#f87171" radius={[4, 4, 0, 0]} />
        <Line type="monotone" dataKey="Investimentos" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
