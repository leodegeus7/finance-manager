// Contas & Cartões — histórico de fatura por mês, com a parte parcelada
// destacada e uma projeção (tracejada) dos meses futuros com base em
// parcelamentos em andamento.
import {
  ResponsiveContainer, ComposedChart, Bar, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { CardInvoiceMonth } from '@/engine/CardInvoiceEngine'
import { formatCurrency, formatCurrencyCompact, formatMonth } from '@/lib/format'

interface Props {
  data: CardInvoiceMonth[]
}

export function CardInvoiceChart({ data }: Props) {
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
    normal: round2(d.total - d.installments),
    Parcelado: d.installments,
    total: d.total,
    projected: d.projected,
  }))

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
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
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload
              if (!p) return ''
              return `${p.label}${p.projected ? ' (projeção)' : ''}`
            }}
            contentStyle={{
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              fontSize: '13px',
            }}
          />
          <Bar dataKey="normal" name="Fatura" stackId="invoice" radius={[0, 0, 0, 0]}>
            {chartData.map((d, i) => (
              <Cell
                key={i}
                fill="#93c5fd"
                fillOpacity={d.projected ? 0.4 : 1}
                stroke={d.projected ? '#93c5fd' : 'none'}
                strokeDasharray={d.projected ? '4 3' : undefined}
              />
            ))}
          </Bar>
          <Bar dataKey="Parcelado" name="Parcelado" stackId="invoice" radius={[4, 4, 0, 0]}>
            {chartData.map((d, i) => (
              <Cell
                key={i}
                fill="#f59e0b"
                fillOpacity={d.projected ? 0.4 : 1}
                stroke={d.projected ? '#f59e0b' : 'none'}
                strokeDasharray={d.projected ? '4 3' : undefined}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#93c5fd' }} />
          Fatura
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#f59e0b' }} />
          Parcelado
        </span>
        {chartData.some((d) => d.projected) && (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-gray-400 opacity-60" />
            Projeção
          </span>
        )}
      </div>
    </div>
  )
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
