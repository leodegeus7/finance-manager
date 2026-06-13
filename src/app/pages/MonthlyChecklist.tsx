import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatMonth } from '@/lib/format'
import { useUser } from '@/lib/UserContext'
import { useMonthlyStatus } from '@/lib/hooks/useMonthlyStatus'

/** Last N months as YYYY-MM-01 values, most recent first */
function recentMonths(n = 6): string[] {
  const months: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = 0; i < n; i++) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
    d.setMonth(d.getMonth() - 1)
  }
  return months
}

function StatusBadge({ done }: { done: boolean }) {
  return done
    ? <Badge variant="green">Feito</Badge>
    : <Badge variant="red">Pendente</Badge>
}

export function MonthlyChecklist() {
  const { userId, userName } = useUser()
  const months = useMemo(() => recentMonths(6), [])
  const { statuses, loading, error } = useMonthlyStatus(userId, months)

  if (error) return (
    <div className="p-8 text-red-600 text-sm">Erro ao carregar status: {error}</div>
  )

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Checklist</h1>
        <p className="text-sm text-gray-400 mt-0.5">{userName} · últimos 6 meses</p>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase tracking-wide">
                <th className="pb-2">Mês</th>
                <th className="pb-2">Cartão</th>
                <th className="pb-2">Conta</th>
                <th className="pb-2">Balanço</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((s) => (
                <tr key={s.month} className="border-t border-gray-100">
                  <td className="py-3 font-medium text-gray-900">{formatMonth(s.month)}</td>
                  <td className="py-3"><StatusBadge done={s.hasCard} /></td>
                  <td className="py-3"><StatusBadge done={s.hasAccount} /></td>
                  <td className="py-3"><StatusBadge done={s.hasBalance} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
