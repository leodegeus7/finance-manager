// ============================================================
// ADD TRANSACTION MODAL — manual entry form
// Types: expense | income | credit_card_purchase | transfer
// ============================================================

import { useState } from 'react'
import { createManualTransaction, ManualTransactionInput } from '@/lib/db/transactions'
import { AccountRow, CardRow } from '@/lib/db/accounts'
import { CategoryRow } from '@/lib/db/categories'
import { SplitParticipant } from '@/engine/types'
import { SplitEditor } from '@/components/transactions/SplitEditor'
import { formatMonth } from '@/lib/format'
import { filterCategories } from '@/lib/db/categories'
import { CategorySelect } from '@/components/ui/CategorySelect'

interface Props {
  userId: string
  accounts: AccountRow[]
  cards: CardRow[]
  categories: CategoryRow[]
  onClose: () => void
  onSuccess: () => void
}

type TxKind = 'expense' | 'income' | 'credit_card_purchase' | 'transfer'

const KIND_LABELS: Record<TxKind, string> = {
  expense:              'Despesa',
  income:               'Receita',
  credit_card_purchase: 'Cartão de crédito',
  transfer:             'Transferência',
}

/** Last N months as YYYY-MM-01 options */
function recentMonths(n = 18): string[] {
  const months: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = 0; i < n; i++) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
    d.setMonth(d.getMonth() - 1)
  }
  return months
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AddTransactionModal({ userId, accounts, cards, categories, onClose, onSuccess }: Props) {
  const [kind, setKind]                       = useState<TxKind>('expense')
  const [date, setDate]                       = useState(todayISO())
  const [description, setDescription]         = useState('')
  const [amountStr, setAmountStr]             = useState('')
  const [accountId, setAccountId]             = useState(accounts[0]?.id ?? '')
  const [toAccountId, setToAccountId]         = useState(accounts[1]?.id ?? accounts[0]?.id ?? '')
  const [cardId, setCardId]                   = useState(cards[0]?.id ?? '')
  const [statementMonth, setStatementMonth]   = useState(recentMonths()[0])
  const [categoryId, setCategoryId]           = useState('')
  const [context, setContext]                 = useState<'personal' | 'professional'>('personal')
  const [splits, setSplits]                   = useState<SplitParticipant[] | null>(null)
  const [notes, setNotes]                     = useState('')
  const [saving, setSaving]                   = useState(false)
  const [errorMsg, setErrorMsg]               = useState('')

  const amount = parseFloat(amountStr.replace(',', '.'))
  const isValid = (
    date.trim() !== '' &&
    description.trim() !== '' &&
    !isNaN(amount) && amount > 0 &&
    (kind === 'credit_card_purchase' ? cardId !== '' : accountId !== '')
  )

  async function handleSubmit() {
    if (!isValid || saving) return
    setSaving(true)
    setErrorMsg('')

    try {
      if (kind === 'transfer') {
        // Two rows: expense from source, income to destination
        const base: Omit<ManualTransactionInput, 'direction' | 'type' | 'account_id' | 'signed_amount'> = {
          user_id: userId, date, description, amount,
          context, splits, notes: notes || undefined,
          category_id: categoryId || undefined,
        }
        await Promise.all([
          createManualTransaction({ ...base, direction: 'expense', type: 'transfer', account_id: accountId }),
          createManualTransaction({ ...base, direction: 'income',  type: 'transfer', account_id: toAccountId }),
        ])
      } else {
        const input: ManualTransactionInput = {
          user_id:     userId,
          date,
          description,
          amount,
          direction:   kind === 'income' ? 'income' : 'expense',
          type:        kind,
          account_id:        kind !== 'credit_card_purchase' ? accountId : undefined,
          credit_card_id:    kind === 'credit_card_purchase' ? cardId    : undefined,
          statement_month:   kind === 'credit_card_purchase' ? statementMonth : undefined,
          category_id:       categoryId || undefined,
          context,
          splits,
          notes: notes || undefined,
        }
        await createManualTransaction(input)
      }

      onSuccess()
    } catch (e) {
      setErrorMsg(String(e))
      setSaving(false)
    }
  }

  const inputCls = 'w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300'
  const labelCls = 'text-xs text-gray-500 font-medium block mb-1'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Nova transação</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Type selector */}
        <div className="flex bg-gray-100 rounded-xl p-0.5 text-xs gap-0.5">
          {(Object.keys(KIND_LABELS) as TxKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`flex-1 py-1.5 px-2 rounded-lg transition-colors font-medium ${
                kind === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>

        {/* Date + Description */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Data</label>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Valor (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              className={inputCls}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Descrição</label>
          <input
            type="text"
            placeholder="Ex: Supermercado, Salário..."
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Account / Card / Transfer accounts */}
        {kind === 'credit_card_purchase' && (
          <>
            <div>
              <label className={labelCls}>Cartão</label>
              <select className={inputCls} value={cardId} onChange={(e) => setCardId(e.target.value)}>
                {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Mês da fatura</label>
              <select className={inputCls} value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)}>
                {recentMonths().map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
              </select>
            </div>
          </>
        )}

        {kind === 'transfer' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Conta origem</label>
              <select className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Conta destino</label>
              <select className={inputCls} value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {(kind === 'expense' || kind === 'income') && (
          <div>
            <label className={labelCls}>Conta</label>
            <select className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        {/* Category */}
        <div>
          <label className={labelCls}>Categoria <span className="text-gray-400">(opcional)</span></label>
          <CategorySelect
            inputClassName={inputCls}
            value={categoryId}
            onChange={setCategoryId}
            categories={filterCategories(categories, kind === 'income' ? 'income' : 'expense')}
            placeholder="— sem categoria —"
          />
        </div>

        {/* Context toggle */}
        <div>
          <label className={labelCls}>Contexto</label>
          <div className="flex bg-gray-100 rounded-xl p-0.5 text-xs">
            {(['personal', 'professional'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setContext(v)}
                className={`flex-1 py-1.5 rounded-lg transition-colors font-medium ${
                  context === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
                }`}
              >
                {v === 'personal' ? 'Pessoal' : 'Profissional'}
              </button>
            ))}
          </div>
        </div>

        {/* Split editor */}
        <div>
          <label className={labelCls}>Divisão</label>
          <SplitEditor
            splits={splits}
            payerUserId={userId}
            onChange={setSplits}
          />
        </div>

        {/* Notes */}
        <div>
          <label className={labelCls}>Notas <span className="text-gray-400">(opcional)</span></label>
          <input
            type="text"
            placeholder="Observações..."
            className={inputCls}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Error */}
        {errorMsg && (
          <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{errorMsg}</p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!isValid || saving}
          className="w-full bg-gray-900 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Salvando...' : 'Salvar transação'}
        </button>
      </div>
    </div>
  )
}
