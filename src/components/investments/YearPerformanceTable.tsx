// Tabela de performance ano a ano por corretora (+ consolidado), estilo XP.
import { useMemo, useState } from 'react'
import { Card, CardTitle } from '@/components/ui/Card'
import { YearRow } from '@/investments/PerformanceEngine'
import { formatCurrency } from '@/lib/format'

interface Props {
  rows: YearRow[]        // por corretora
  totals: YearRow[]      // consolidado por ano
}

function Money({ value }: { value: number }) {
  const color = value > 0 ? 'text-green-600' : value < 0 ? 'text-red-600' : 'text-gray-500'
  const sign = value > 0 ? '+' : ''
  return <span className={`tabular-nums ${color}`}>{sign}{formatCurrency(value)}</span>
}

export function YearPerformanceTable({ rows, totals }: Props) {
  const custodians = useMemo(
    () => [...new Set(rows.map((r) => r.custodian))].sort(),
    [rows],
  )
  const [selected, setSelected] = useState<string>('Total')

  const shown = useMemo(() => {
    const list = selected === 'Total' ? totals : rows.filter((r) => r.custodian === selected)
    return [...list].sort((a, b) => b.year - a.year)
  }, [selected, rows, totals])

  if (rows.length === 0) {
    return (
      <Card padding="md">
        <CardTitle>Rendimento ano a ano</CardTitle>
        <p className="text-sm text-gray-400 mt-2">
          Nenhuma conta marcada como investimento (ou sem histórico). Marque as corretoras em
          Contas &amp; Cartões.
        </p>
      </Card>
    )
  }

  const hasEstimate = shown.some((r) => r.estimated)

  return (
    <Card padding="md">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CardTitle className="mb-0">Rendimento ano a ano</CardTitle>
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs flex-wrap">
          {['Total', ...custodians].map((c) => (
            <button
              key={c}
              onClick={() => setSelected(c)}
              className={`px-3 py-1 rounded-md transition-colors ${
                selected === c ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="text-left font-medium py-2 pr-3">Ano</th>
              <th className="text-right font-medium py-2 px-3">Patrimônio</th>
              <th className="text-right font-medium py-2 px-3">Movimentações</th>
              <th className="text-right font-medium py-2 px-3">Rendimento</th>
              <th className="text-right font-medium py-2 pl-3">Rent.</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.custodian}-${r.year}`} className="border-b border-gray-50">
                <td className="py-2 pr-3 font-medium text-gray-900">
                  {r.year}{r.estimated && <span className="text-gray-300" title="estimado">*</span>}
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-gray-900">
                  {formatCurrency(r.patrimonio_final)}
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-gray-500">
                  {r.movimentacoes !== 0 ? <Money value={r.movimentacoes} /> : '—'}
                </td>
                <td className="py-2 px-3 text-right font-medium"><Money value={r.rendimento} /></td>
                <td className="py-2 pl-3 text-right tabular-nums text-gray-500">
                  {r.rentabilidade_pct != null
                    ? `${r.rentabilidade_pct > 0 ? '+' : ''}${r.rentabilidade_pct}%`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasEstimate && (
        <p className="text-[11px] text-gray-400 mt-2">
          * Estimado pela variação de valor (aportes ainda não importados desta corretora).
        </p>
      )}
    </Card>
  )
}
