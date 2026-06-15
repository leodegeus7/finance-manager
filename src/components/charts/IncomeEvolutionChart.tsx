import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { Transaction } from '@/engine/types'
import { formatCurrencyCompact, formatCurrency } from '@/lib/format'

// Historical income data (Dec/2018 – Jan/2025). Zero-fill gap Feb/2025–Mar/2026.
// From Apr/2026 onwards, computed from live transactions.
const HISTORICAL: { month: string; salario: number; freelancer: number; fazenda: number }[] = [
  { month: '2018-12-01', salario: 1209.30,  freelancer: 0,       fazenda: 0 },
  { month: '2019-01-01', salario: 1041.19,  freelancer: 0,       fazenda: 0 },
  { month: '2019-02-01', salario: 1209.30,  freelancer: 0,       fazenda: 0 },
  { month: '2019-03-01', salario: 2515.68,  freelancer: 0,       fazenda: 0 },
  { month: '2019-04-01', salario: 2803.72,  freelancer: 0,       fazenda: 0 },
  { month: '2019-05-01', salario: 4285.13,  freelancer: 0,       fazenda: 0 },
  { month: '2019-06-01', salario: 3620.54,  freelancer: 0,       fazenda: 0 },
  { month: '2019-07-01', salario: 6049.18,  freelancer: 0,       fazenda: 0 },
  { month: '2019-08-01', salario: 3865.32,  freelancer: 0,       fazenda: 0 },
  { month: '2019-09-01', salario: 3910.31,  freelancer: 0,       fazenda: 0 },
  { month: '2019-10-01', salario: 7453.27,  freelancer: 0,       fazenda: 0 },
  { month: '2019-11-01', salario: 7461.68,  freelancer: 0,       fazenda: 0 },
  { month: '2019-12-01', salario: 10427.21, freelancer: 0,       fazenda: 0 },
  { month: '2020-01-01', salario: 0,        freelancer: 0,       fazenda: 0 },
  { month: '2020-02-01', salario: 6121.00,  freelancer: 0,       fazenda: 0 },
  { month: '2020-03-01', salario: 7708.00,  freelancer: 0,       fazenda: 0 },
  { month: '2020-04-01', salario: 7224.10,  freelancer: 0,       fazenda: 0 },
  { month: '2020-05-01', salario: 7289.00,  freelancer: 0,       fazenda: 0 },
  { month: '2020-06-01', salario: 7309.00,  freelancer: 0,       fazenda: 0 },
  { month: '2020-07-01', salario: 7289.00,  freelancer: 0,       fazenda: 0 },
  { month: '2020-08-01', salario: 7289.00,  freelancer: 0,       fazenda: 0 },
  { month: '2020-09-01', salario: 7289.00,  freelancer: 0,       fazenda: 0 },
  { month: '2020-10-01', salario: 7239.00,  freelancer: 0,       fazenda: 0 },
  { month: '2020-11-01', salario: 7707.00,  freelancer: 0,       fazenda: 0 },
  { month: '2020-12-01', salario: 11592.35, freelancer: 0,       fazenda: 0 },
  { month: '2021-01-01', salario: 13972.00, freelancer: 0,       fazenda: 0 },
  { month: '2021-02-01', salario: 19785.02, freelancer: 0,       fazenda: 0 },
  { month: '2021-03-01', salario: 9535.00,  freelancer: 0,       fazenda: 0 },
  { month: '2021-04-01', salario: 9334.00,  freelancer: 0,       fazenda: 0 },
  { month: '2021-05-01', salario: 9354.00,  freelancer: 0,       fazenda: 0 },
  { month: '2021-06-01', salario: 9354.00,  freelancer: 0,       fazenda: 0 },
  { month: '2021-07-01', salario: 9353.00,  freelancer: 0,       fazenda: 0 },
  { month: '2021-08-01', salario: 9354.00,  freelancer: 0,       fazenda: 0 },
  { month: '2021-09-01', salario: 9354.00,  freelancer: 0,       fazenda: 0 },
  { month: '2021-10-01', salario: 9353.00,  freelancer: 0,       fazenda: 0 },
  { month: '2021-11-01', salario: 58408.90, freelancer: 0,       fazenda: 0 },
  { month: '2021-12-01', salario: 8446.49,  freelancer: 0,       fazenda: 0 },
  { month: '2022-01-01', salario: 9024.18,  freelancer: 0,       fazenda: 0 },
  { month: '2022-02-01', salario: 8968.78,  freelancer: 0,       fazenda: 0 },
  { month: '2022-03-01', salario: 8968.78,  freelancer: 0,       fazenda: 0 },
  { month: '2022-04-01', salario: 8968.78,  freelancer: 0,       fazenda: 0 },
  { month: '2022-05-01', salario: 8968.78,  freelancer: 0,       fazenda: 0 },
  { month: '2022-06-01', salario: 11868.78, freelancer: 0,       fazenda: 0 },
  { month: '2022-07-01', salario: 11868.78, freelancer: 0,       fazenda: 0 },
  { month: '2022-08-01', salario: 11868.78, freelancer: 0,       fazenda: 0 },
  { month: '2022-09-01', salario: 11818.78, freelancer: 0,       fazenda: 0 },
  { month: '2022-10-01', salario: 11818.78, freelancer: 0,       fazenda: 0 },
  { month: '2022-11-01', salario: 22867.78, freelancer: 0,       fazenda: 0 },
  { month: '2022-12-01', salario: 15687.56, freelancer: 0,       fazenda: 0 },
  { month: '2023-01-01', salario: 11818.78, freelancer: 0,       fazenda: 0 },
  { month: '2023-02-01', salario: 11783.38, freelancer: 0,       fazenda: 0 },
  { month: '2023-03-01', salario: 11783.38, freelancer: 285.00,  fazenda: 0 },
  { month: '2023-04-01', salario: 11783.38, freelancer: 0,       fazenda: 0 },
  { month: '2023-05-01', salario: 11783.38, freelancer: 0,       fazenda: 0 },
  { month: '2023-06-01', salario: 12083.66, freelancer: 0,       fazenda: 0 },
  { month: '2023-07-01', salario: 12083.66, freelancer: 0,       fazenda: 0 },
  { month: '2023-08-01', salario: 37877.64, freelancer: 0,       fazenda: 0 },
  { month: '2023-09-01', salario: 8112.37,  freelancer: 0,       fazenda: 0 },
  { month: '2023-10-01', salario: 8816.98,  freelancer: 0,       fazenda: 0 },
  { month: '2023-11-01', salario: 12083.66, freelancer: 0,       fazenda: 0 },
  { month: '2023-12-01', salario: 31204.02, freelancer: 0,       fazenda: 0 },
  { month: '2024-01-01', salario: 12083.66, freelancer: 0,       fazenda: 0 },
  { month: '2024-02-01', salario: 7504.20,  freelancer: 0,       fazenda: 0 },
  { month: '2024-03-01', salario: 12071.57, freelancer: 0,       fazenda: 0 },
  { month: '2024-04-01', salario: 12071.57, freelancer: 0,       fazenda: 0 },
  { month: '2024-05-01', salario: 12071.57, freelancer: 1130.00, fazenda: 706.00 },
  { month: '2024-06-01', salario: 12276.05, freelancer: 0,       fazenda: 706.00 },
  { month: '2024-07-01', salario: 75127.96, freelancer: 1130.00, fazenda: 706.00 },
  { month: '2024-08-01', salario: 19126.99, freelancer: 0,       fazenda: 706.00 },
  { month: '2024-09-01', salario: 0,        freelancer: 2200.00, fazenda: 706.00 },
  { month: '2024-10-01', salario: 16911.10, freelancer: 1300.00, fazenda: 706.00 },
  { month: '2024-11-01', salario: 19786.08, freelancer: 1300.00, fazenda: 706.00 },
  { month: '2024-12-01', salario: 18648.47, freelancer: 0,       fazenda: 706.00 },
  { month: '2025-01-01', salario: 12280.09, freelancer: 1300.00, fazenda: 706.00 },
  // Gap Feb/2025 – Mar/2026: zero
  { month: '2025-02-01', salario: 0, freelancer: 0, fazenda: 0 },
  { month: '2025-03-01', salario: 0, freelancer: 0, fazenda: 0 },
  { month: '2025-04-01', salario: 0, freelancer: 0, fazenda: 0 },
  { month: '2025-05-01', salario: 0, freelancer: 0, fazenda: 0 },
  { month: '2025-06-01', salario: 0, freelancer: 0, fazenda: 0 },
  { month: '2025-07-01', salario: 0, freelancer: 0, fazenda: 0 },
  { month: '2025-08-01', salario: 0, freelancer: 0, fazenda: 0 },
  { month: '2025-09-01', salario: 0, freelancer: 0, fazenda: 0 },
  { month: '2025-10-01', salario: 0, freelancer: 0, fazenda: 0 },
  { month: '2025-11-01', salario: 0, freelancer: 0, fazenda: 0 },
  { month: '2025-12-01', salario: 0, freelancer: 0, fazenda: 0 },
  { month: '2026-01-01', salario: 0, freelancer: 0, fazenda: 0 },
  { month: '2026-02-01', salario: 0, freelancer: 0, fazenda: 0 },
  { month: '2026-03-01', salario: 0, freelancer: 0, fazenda: 0 },
]

const LIVE_START = '2026-04-01'

// Category name matching (case-insensitive substrings)
function classifyCategory(name?: string): 'salario' | 'freelancer' | 'fazenda' | null {
  if (!name) return null
  const n = name.toLowerCase()
  if (n.includes('fazenda')) return 'fazenda'
  if (n.includes('freelancer') || n.includes('freelance')) return 'freelancer'
  if (n.includes('salario') || n.includes('salário')) return 'salario'
  return null
}

interface Props {
  liveTxs: Transaction[]
}

export function IncomeEvolutionChart({ liveTxs }: Props) {
  // Aggregate live transactions (income only, Apr/2026+) by competency_month
  const liveByMonth = new Map<string, { salario: number; freelancer: number; fazenda: number }>()

  for (const tx of liveTxs) {
    if (tx.direction !== 'income') continue
    const m = tx.competency_month ?? tx.date.slice(0, 7) + '-01'
    if (m < LIVE_START) continue
    const type = classifyCategory(tx.category_name)
    if (!type) continue

    let entry = liveByMonth.get(m)
    if (!entry) { entry = { salario: 0, freelancer: 0, fazenda: 0 }; liveByMonth.set(m, entry) }
    entry[type] += tx.amount
  }

  const liveRows = Array.from(liveByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }))

  const data = [...HISTORICAL, ...liveRows].map((d) => ({
    label: fmtLabel(d.month),
    salario: round(d.salario),
    freelancer: round(d.freelancer),
    fazenda: round(d.fazenda),
    total: round(d.salario + d.freelancer + d.fazenda),
  }))

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            interval={5}
          />
          <YAxis
            tickFormatter={formatCurrencyCompact}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            formatter={(v: number, name: string) => [formatCurrency(v), LABELS[name as keyof typeof LABELS] ?? name]}
            labelStyle={{ fontWeight: 600, marginBottom: 4 }}
            contentStyle={{
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              fontSize: '13px',
            }}
          />
          <Legend formatter={(v) => LABELS[v as keyof typeof LABELS] ?? v} wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="salario"    stroke="#3b82f6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="freelancer" stroke="#f59e0b" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="fazenda"    stroke="#10b981" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="total"      stroke="#8b5cf6" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const LABELS = { salario: 'Salário', freelancer: 'Freelancer', fazenda: 'Fazenda', total: 'Total' }

function fmtLabel(month: string): string {
  const [y, m] = month.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`
}

function round(n: number): number { return Math.round(n * 100) / 100 }
