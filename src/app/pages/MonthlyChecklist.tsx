import { Fragment, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatMonth } from '@/lib/format'
import { useUser } from '@/lib/UserContext'
import { useMonthlyStatus } from '@/lib/hooks/useMonthlyStatus'
import { BalanceEntryModal } from '@/components/checklist/BalanceEntryModal'

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

function StatusBadge({ done, label, onClick }: { done: boolean; label?: string; onClick?: () => void }) {
  const badge = done
    ? <Badge variant="green">{label ?? 'Feito'}</Badge>
    : <Badge variant="red">{label ?? 'Pendente'}</Badge>

  if (!onClick) return badge

  return (
    <button onClick={onClick} className="cursor-pointer hover:opacity-70 transition-opacity">
      {badge}
    </button>
  )
}

export function MonthlyChecklist() {
  const { userId, userName } = useUser()
  const months = useMemo(() => recentMonths(6), [])
  const { statuses, loading, error, refetch } = useMonthlyStatus(userId, months)
  const [balanceMonth, setBalanceMonth] = useState<string | null>(null)
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)

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
              {statuses.map((s) => {
                const pendingCount = s.missingBalanceAccounts.length
                const expanded = expandedMonth === s.month

                return (
                  <Fragment key={s.month}>
                    <tr className="border-t border-gray-100">
                      <td className="py-3 font-medium text-gray-900">{formatMonth(s.month)}</td>
                      <td className="py-3"><StatusBadge done={s.hasCard} /></td>
                      <td className="py-3"><StatusBadge done={s.hasAccount} /></td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge
                            done={s.hasBalance}
                            label={s.hasBalance ? 'Feito' : `${pendingCount} pendente${pendingCount !== 1 ? 's' : ''}`}
                            onClick={() => setBalanceMonth(s.month)}
                          />
                          {pendingCount > 0 && (
                            <button
                              onClick={() => setExpandedMonth(expanded ? null : s.month)}
                              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                              title="Ver quais contas faltam"
                            >
                              {expanded ? '▲' : '▼'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded && pendingCount > 0 && (
                      <tr className="bg-gray-50/60">
                        <td colSpan={4} className="px-3 py-2.5">
                          <p className="text-xs text-gray-400 mb-1.5">
                            Contas sem saldo lançado em {formatMonth(s.month)}:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {s.missingBalanceAccounts.map((a) => (
                              <span key={a.id} className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-600">
                                {a.name}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      {balanceMonth && (
        <BalanceEntryModal
          userId={userId}
          month={balanceMonth}
          onClose={() => setBalanceMonth(null)}
          onSaved={refetch}
        />
      )}
    </div>
  )
}
