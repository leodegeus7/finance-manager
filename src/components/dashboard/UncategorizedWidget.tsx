// ============================================================
// UNCATEGORIZED WIDGET (Dashboard)
//
// Mostra quantas transações do mês estão sem categoria. Ao clicar,
// expande a lista de contas/cartões que têm pendências — clicar em
// uma delas abre a página de Transações já filtrada por aquela
// conta/cartão + "sem categoria". Também há a opção "Ver todas".
//
// O que conta como "sem categoria": as transações já vêm filtradas
// pelo mês e pelas regras de fluxo de caixa (sem transfer / pagamento
// de cartão / investimentos) — aqui só sobra o filtro `!category_id`.
// ============================================================

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Transaction } from '@/engine/types'
import { AccountRow, CardRow } from '@/lib/db/accounts'

interface SourceBucket {
  key: string
  type: 'card' | 'account'
  id: string
  name: string
  count: number
}

interface Props {
  transactions: Transaction[]   // já filtradas por mês + regras de fluxo de caixa
  accounts: AccountRow[]
  cards: CardRow[]
}

export function UncategorizedWidget({ transactions, accounts, cards }: Props) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const uncategorized = useMemo(
    () => transactions.filter((t) => !t.category_id),
    [transactions],
  )

  const buckets = useMemo<SourceBucket[]>(() => {
    const map = new Map<string, SourceBucket>()
    for (const tx of uncategorized) {
      let bucket: Omit<SourceBucket, 'count'>
      if (tx.credit_card_id) {
        bucket = {
          key: `card:${tx.credit_card_id}`,
          type: 'card',
          id: tx.credit_card_id,
          name: cards.find((c) => c.id === tx.credit_card_id)?.name ?? 'Cartão',
        }
      } else if (tx.account_id) {
        bucket = {
          key: `account:${tx.account_id}`,
          type: 'account',
          id: tx.account_id,
          name: accounts.find((a) => a.id === tx.account_id)?.name ?? 'Conta',
        }
      } else {
        continue
      }
      const existing = map.get(bucket.key)
      if (existing) existing.count++
      else map.set(bucket.key, { ...bucket, count: 1 })
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [uncategorized, accounts, cards])

  const total = uncategorized.length

  const goToSource = (b: SourceBucket) => {
    const param = b.type === 'card' ? `cardId=${b.id}` : `accountId=${b.id}`
    navigate(`/transacoes?uncat=1&${param}`)
  }
  const goToAll = () => navigate('/transacoes?uncat=1')

  // Nada pendente — confirmação discreta.
  if (total === 0) {
    return (
      <Card padding="sm">
        <div className="flex items-center gap-2 px-1 py-0.5">
          <span className="text-green-600 text-base">✓</span>
          <p className="text-sm text-gray-500">Tudo classificado neste mês</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-yellow-200 shadow-sm overflow-hidden">
      {/* Cabeçalho clicável */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-yellow-50/50 transition-colors rounded-2xl"
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-yellow-100 text-yellow-700 text-base shrink-0">
            ⚠
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {total} transaç{total !== 1 ? 'ões' : 'ão'} sem categoria
            </p>
            <p className="text-xs text-gray-400">
              {buckets.length} {buckets.length !== 1 ? 'fontes' : 'fonte'} · clique para ver
            </p>
          </div>
        </div>
        <span className={`text-gray-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {/* Detalhe por conta/cartão */}
      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {buckets.map((b) => (
            <button
              key={b.key}
              onClick={() => goToSource(b)}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] uppercase tracking-wide font-medium text-gray-400 shrink-0">
                  {b.type === 'card' ? 'Cartão' : 'Conta'}
                </span>
                <span className="text-sm text-gray-800 truncate">{b.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-yellow-700 tabular-nums">{b.count}</span>
                <span className="text-gray-300 text-xs">→</span>
              </div>
            </button>
          ))}

          {/* Ver todas */}
          <button
            onClick={goToAll}
            className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="text-sm font-medium text-gray-900">Ver todas</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-gray-500 tabular-nums">{total}</span>
              <span className="text-gray-300 text-xs">→</span>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}
