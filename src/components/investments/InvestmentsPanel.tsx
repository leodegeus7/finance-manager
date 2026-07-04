// Painel de rendimento dos investimentos (Dashboard): resumo + gráfico.
import { Card, CardTitle } from '@/components/ui/Card'
import { InvestmentReturnChart } from '@/components/charts/InvestmentReturnChart'
import { InvestmentSummary, MonthValue } from '@/investments/PerformanceEngine'
import { formatCurrency } from '@/lib/format'

interface Props {
  summary: InvestmentSummary
  total: MonthValue[]
  loading?: boolean
}

function Signed({ value }: { value: number }) {
  const color = value > 0 ? 'text-green-600' : value < 0 ? 'text-red-600' : 'text-gray-900'
  const sign = value > 0 ? '+' : ''
  return <span className={color}>{sign}{formatCurrency(value)}</span>
}

export function InvestmentsPanel({ summary, total, loading }: Props) {
  return (
    <Card padding="md">
      <CardTitle>Rendimento dos investimentos</CardTitle>
      <p className="text-xs text-gray-400 -mt-0.5 mb-3">
        XP, Binance, Bitso e demais contas marcadas como investimento
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Carregando...</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-400">Investido</p>
              <p className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">
                {formatCurrency(summary.invested_value)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Rendimento no ano</p>
              <p className="text-lg font-bold tabular-nums mt-0.5">
                <Signed value={summary.year_rendimento} />
                {summary.year_return_pct != null && (
                  <span className="text-xs text-gray-400 font-normal ml-1">
                    ({summary.year_return_pct > 0 ? '+' : ''}{summary.year_return_pct}%)
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Variação no mês</p>
              <p className="text-lg font-bold tabular-nums mt-0.5">
                <Signed value={summary.month_change} />
              </p>
            </div>
          </div>

          <div className="mt-4">
            <InvestmentReturnChart data={total} />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            "Variação no mês" inclui aportes. O rendimento anual usa os dados oficiais da corretora
            quando disponíveis (ex.: XP); para as demais é estimado pela variação de valor.
          </p>
        </>
      )}
    </Card>
  )
}
