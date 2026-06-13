// Casal — gráfico dia a dia dos gastos compartilhados do mês, subdividido por categoria
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { Transaction } from '@/engine/types'
import { formatCurrency, formatCurrencyCompact } from '@/lib/format'

interface Props {
  transactions: Transaction[]
  month: string       // YYYY-MM-01
  maxCategories?: number
}

const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee', '#9ca3af']
const OTHERS_LABEL = 'Outros'

export function DailySpendingChart({ transactions, month, maxCategories = 5 }: Props) {
  if (transactions.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        Sem gastos compartilhados neste mês
      </p>
    )
  }

  const [year, monthNum] = month.split('-').map(Number)
  const daysInMonth = new Date(year, monthNum, 0).getDate()

  // Top categories by total spend, the rest are grouped into "Outros"
  const totalsByCategory = new Map<string, number>()
  for (const tx of transactions) {
    const name = tx.category_name ?? 'Sem categoria'
    totalsByCategory.set(name, (totalsByCategory.get(name) ?? 0) + tx.amount)
  }
  const topCategories = [...totalsByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCategories)
    .map(([name]) => name)
  const hasOthers = totalsByCategory.size > topCategories.length

  const seriesNames = hasOthers ? [...topCategories, OTHERS_LABEL] : topCategories

  // Build per-day data
  const chartData = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const row: Record<string, number | string> = { day, total: 0 }
    for (const name of seriesNames) row[name] = 0
    return row
  })

  for (const tx of transactions) {
    const day = Number(tx.date.split('-')[2])
    if (!day || day < 1 || day > daysInMonth) continue
    const row = chartData[day - 1]
    const name = tx.category_name ?? 'Sem categoria'
    const key = topCategories.includes(name) ? name : OTHERS_LABEL
    row[key] = (row[key] as number) + tx.amount
    row.total = (row.total as number) + tx.amount
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip
          formatter={(v: number, name: string) => [formatCurrency(v), name]}
          labelFormatter={(day) => `Dia ${day}`}
          contentStyle={{
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            fontSize: '13px',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        {seriesNames.map((name, i) => (
          <Bar
            key={name}
            dataKey={name}
            stackId="day"
            fill={COLORS[i % COLORS.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
