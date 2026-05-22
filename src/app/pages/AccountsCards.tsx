import { useState, useEffect } from 'react'
import { Card, CardTitle } from '@/components/ui/Card'
import { InvoiceBadge } from '@/components/ui/Badge'
import { formatCurrency, formatMonth } from '@/lib/format'
import { useAccounts } from '@/lib/hooks/useAccounts'
import { useUser } from '@/lib/UserContext'
import {
  createAccount, deleteAccount,
  createCard, deleteCard,
  AccountRow, CardRow,
} from '@/lib/db/accounts'
import { fetchLatestAccountBalances, AccountLatestEntry } from '@/lib/db/networth'
import { CardTransactionsModal } from '@/components/cards/CardTransactionsModal'

const BANKS = ['nubank', 'inter', 'c6', 'itaú', 'bradesco', 'santander', 'caixa', 'bb', 'sicoob', 'outro']

// ── Delete confirmation state ─────────────────────────────────
// step 0 = idle
// step 1 = "tem certeza?" shown
// step 2 = "digite o nome para confirmar" shown
interface DeleteState {
  step: 0 | 1 | 2
  id: string
  expectedName: string
  input: string
}
const IDLE: DeleteState = { step: 0, id: '', expectedName: '', input: '' }

export function AccountsCards() {
  const { userId, userName, month } = useUser()
  const { accounts, cards, loading, error, refetch } = useAccounts(userId, month)

  // Latest balances from history
  const [latestEntries, setLatestEntries] = useState<Map<string, AccountLatestEntry>>(new Map())
  const [maxMonth, setMaxMonth] = useState('')
  useEffect(() => {
    fetchLatestAccountBalances(userId, month)
      .then(({ entries, maxMonth: mx }) => { setLatestEntries(entries); setMaxMonth(mx) })
      .catch(() => {/* ignore */})
  }, [userId, month])

  // Add account form
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [accName, setAccName]       = useState('')
  const [accBank, setAccBank]       = useState('nubank')
  const [accBalance, setAccBalance] = useState('')
  const [savingAcc, setSavingAcc]   = useState(false)
  const [accError, setAccError]     = useState('')

  // Card transactions drawer
  const [openCard, setOpenCard] = useState<CardRow | null>(null)

  // Add card form
  const [showAddCard, setShowAddCard] = useState(false)
  const [cardName, setCardName]     = useState('')
  const [cardBank, setCardBank]     = useState('nubank')
  const [savingCard, setSavingCard] = useState(false)
  const [cardError, setCardError]   = useState('')

  // Delete confirmation
  const [accDel, setAccDel]   = useState<DeleteState>(IDLE)
  const [cardDel, setCardDel] = useState<DeleteState>(IDLE)

  async function handleAddAccount() {
    if (!accName.trim()) return
    setSavingAcc(true)
    setAccError('')
    try {
      await createAccount(userId, {
        name:    accName.trim(),
        bank:    accBank,
        balance: parseFloat(accBalance.replace(',', '.')) || 0,
      })
      setAccName(''); setAccBalance(''); setShowAddAccount(false)
      refetch()
    } catch (e) {
      setAccError(String(e))
    } finally {
      setSavingAcc(false)
    }
  }

  async function handleAddCard() {
    if (!cardName.trim()) return
    setSavingCard(true)
    setCardError('')
    try {
      await createCard(userId, { name: cardName.trim(), bank: cardBank })
      setCardName(''); setShowAddCard(false)
      refetch()
    } catch (e) {
      setCardError(String(e))
    } finally {
      setSavingCard(false)
    }
  }

  async function confirmDeleteAccount() {
    await deleteAccount(accDel.id)
    setAccDel(IDLE)
    refetch()
  }

  async function confirmDeleteCard() {
    await deleteCard(cardDel.id)
    setCardDel(IDLE)
    refetch()
  }

  // An account is considered active if its last recorded month is within 3 months
  // of the most recent month in the whole dataset.
  // This catches accounts that silently went to 0 without an explicit zero record
  // (e.g. Avenue: last record is May/2021, global max is Aug/2025 → clearly closed).
  function isActive(entry: AccountLatestEntry | undefined, _fallbackBalance: number): boolean {
    if (!entry) return true                 // no history = newly created or never tracked → always show
    if (entry.balance <= 0) return false    // explicitly zeroed
    if (!month) return true
    // Compare entry's last recorded month against the viewed month — 12-month tolerance
    const [vy, vm] = month.split('-').map(Number)
    const [ey, em] = entry.month.split('-').map(Number)
    const monthsAgo = (vy - ey) * 12 + (vm - em)
    return monthsAgo <= 12
  }

  const enrichedAccounts = accounts
    .map((acc) => ({
      ...acc,
      latestBalance: latestEntries.get(acc.id)?.balance ?? acc.balance,
      latestMonth:   latestEntries.get(acc.id)?.month,
    }))
    .filter((acc) => isActive(latestEntries.get(acc.id), acc.balance))

  const totalBalance = enrichedAccounts.reduce((s, a) => s + a.latestBalance, 0)

  if (error) return (
    <div className="p-8 text-red-600 text-sm">Erro ao carregar contas: {error}</div>
  )

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contas & Cartões</h1>
        <p className="text-sm text-gray-400 mt-0.5">{userName} · {formatMonth(month)}</p>
      </div>

      {/* ── Accounts ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contas</h2>
          <div className="flex items-center gap-3">
            {!loading && (
              <span className="text-sm font-semibold text-gray-900">
                Total: {formatCurrency(totalBalance)}
              </span>
            )}
            <button
              onClick={() => setShowAddAccount((v) => !v)}
              className="text-xs text-blue-600 font-medium hover:underline"
            >
              {showAddAccount ? 'Cancelar' : '+ Adicionar'}
            </button>
          </div>
        </div>

        {/* Add account form */}
        {showAddAccount && (
          <Card padding="md" className="mb-3">
            <p className="text-xs font-medium text-gray-500 mb-3">Nova conta</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Nome</label>
                <input
                  type="text"
                  placeholder="Ex: Nubank Conta"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Banco</label>
                <select
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300 capitalize"
                  value={accBank}
                  onChange={(e) => setAccBank(e.target.value)}
                >
                  {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="text-xs text-gray-400 block mb-1">Saldo atual (R$)</label>
              <input
                type="text"
                placeholder="0,00"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300"
                value={accBalance}
                onChange={(e) => setAccBalance(e.target.value)}
              />
            </div>
            {accError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-2">{accError}</p>
            )}
            <button
              onClick={handleAddAccount}
              disabled={savingAcc || !accName.trim()}
              className="w-full bg-gray-900 text-white text-sm font-medium py-2 rounded-xl disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              {savingAcc ? 'Salvando...' : 'Salvar conta'}
            </button>
          </Card>
        )}

        <div className="space-y-3">
          {loading ? (
            <Card padding="md"><p className="text-sm text-gray-400">Carregando...</p></Card>
          ) : enrichedAccounts.length === 0 ? (
            <Card padding="md"><p className="text-sm text-gray-400 text-center py-2">Nenhuma conta com saldo cadastrada</p></Card>
          ) : (
            enrichedAccounts.map((acc) => (
              <Card key={acc.id} padding="md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{acc.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5 capitalize">{acc.bank}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xl font-bold text-gray-900 tabular-nums">
                        {formatCurrency(acc.latestBalance)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">último saldo registrado</p>
                    </div>
                    {/* Delete button — only shows when not in delete flow for this account */}
                    {accDel.id !== acc.id && (
                      <button
                        onClick={() => setAccDel({ step: 1, id: acc.id, expectedName: acc.name, input: '' })}
                        className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
                        title="Remover conta"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Delete confirmation (inline, multi-step) ── */}
                {accDel.id === acc.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {accDel.step === 1 && (
                      <div className="rounded-xl bg-red-50 border border-red-100 p-3">
                        <p className="text-sm font-semibold text-red-800 mb-0.5">Remover "{acc.name}"?</p>
                        <p className="text-xs text-red-600 mb-3">
                          Transações vinculadas não serão apagadas, mas a conta sumirá das listas.
                          Esta ação não pode ser desfeita.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setAccDel(IDLE)}
                            className="flex-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50 transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => setAccDel((s) => ({ ...s, step: 2 }))}
                            className="flex-1 text-xs font-semibold text-red-700 border border-red-200 bg-red-50 rounded-lg py-1.5 hover:bg-red-100 transition-colors"
                          >
                            Sim, continuar →
                          </button>
                        </div>
                      </div>
                    )}

                    {accDel.step === 2 && (
                      <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                        <p className="text-sm font-semibold text-red-800 mb-1">Confirmação final</p>
                        <p className="text-xs text-red-600 mb-2">
                          Digite <strong>{acc.name}</strong> para confirmar a exclusão:
                        </p>
                        <input
                          type="text"
                          autoFocus
                          placeholder={acc.name}
                          className="w-full text-sm border border-red-200 rounded-lg px-3 py-1.5 mb-2 focus:outline-none focus:ring-1 focus:ring-red-300 bg-white"
                          value={accDel.input}
                          onChange={(e) => setAccDel((s) => ({ ...s, input: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setAccDel(IDLE)}
                            className="flex-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50 transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={confirmDeleteAccount}
                            disabled={accDel.input !== acc.name}
                            className="flex-1 text-xs font-bold text-white bg-red-600 rounded-lg py-1.5 hover:bg-red-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            Deletar definitivamente
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </section>

      {/* ── Credit Cards ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Cartões de Crédito</h2>
          <button
            onClick={() => setShowAddCard((v) => !v)}
            className="text-xs text-blue-600 font-medium hover:underline"
          >
            {showAddCard ? 'Cancelar' : '+ Adicionar'}
          </button>
        </div>

        {/* Add card form */}
        {showAddCard && (
          <Card padding="md" className="mb-3">
            <p className="text-xs font-medium text-gray-500 mb-3">Novo cartão</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Nome</label>
                <input
                  type="text"
                  placeholder="Ex: Nubank Roxinho"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Banco</label>
                <select
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300 capitalize"
                  value={cardBank}
                  onChange={(e) => setCardBank(e.target.value)}
                >
                  {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>
            {cardError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-2">{cardError}</p>
            )}
            <button
              onClick={handleAddCard}
              disabled={savingCard || !cardName.trim()}
              className="w-full bg-gray-900 text-white text-sm font-medium py-2 rounded-xl disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              {savingCard ? 'Salvando...' : 'Salvar cartão'}
            </button>
          </Card>
        )}

        <div className="space-y-3">
          {loading ? (
            <Card padding="md"><p className="text-sm text-gray-400">Carregando...</p></Card>
          ) : cards.length === 0 ? (
            <Card padding="md"><p className="text-sm text-gray-400 text-center py-2">Nenhum cartão cadastrado</p></Card>
          ) : (
            cards.map((card) => {
              const remaining = card.invoice_total - card.invoice_paid
              const paidPct   = card.invoice_total > 0
                ? (card.invoice_paid / card.invoice_total) * 100 : 0

              return (
                <Card key={card.id} padding="md" onClick={() => setOpenCard(card)}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{card.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">{card.bank}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <InvoiceBadge status={card.status} />
                      {cardDel.id !== card.id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setCardDel({ step: 1, id: card.id, expectedName: card.name, input: '' })
                          }}
                          className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
                          title="Remover cartão"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          card.status === 'paid'    ? 'bg-green-400' :
                          card.status === 'partial' ? 'bg-yellow-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${paidPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-gray-400">Fatura total</p>
                      <p className="text-base font-bold text-gray-900 tabular-nums mt-0.5">
                        {formatCurrency(card.invoice_total)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Pago</p>
                      <p className="text-base font-bold text-green-600 tabular-nums mt-0.5">
                        {formatCurrency(card.invoice_paid)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Falta</p>
                      <p className="text-base font-bold text-red-600 tabular-nums mt-0.5">
                        {formatCurrency(remaining)}
                      </p>
                    </div>
                  </div>

                  {card.status !== 'paid' && (
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="mt-4 w-full text-sm font-medium text-blue-600 border border-blue-200 rounded-xl py-2 hover:bg-blue-50 transition-colors"
                    >
                      Marcar como pagamento de fatura
                    </button>
                  )}

                  {/* ── Card delete confirmation ── */}
                  {cardDel.id === card.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      {cardDel.step === 1 && (
                        <div className="rounded-xl bg-red-50 border border-red-100 p-3">
                          <p className="text-sm font-semibold text-red-800 mb-0.5">Remover "{card.name}"?</p>
                          <p className="text-xs text-red-600 mb-3">
                            Transações vinculadas não serão apagadas, mas o cartão sumirá das listas.
                            Esta ação não pode ser desfeita.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setCardDel(IDLE)}
                              className="flex-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50 transition-colors"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => setCardDel((s) => ({ ...s, step: 2 }))}
                              className="flex-1 text-xs font-semibold text-red-700 border border-red-200 bg-red-50 rounded-lg py-1.5 hover:bg-red-100 transition-colors"
                            >
                              Sim, continuar →
                            </button>
                          </div>
                        </div>
                      )}

                      {cardDel.step === 2 && (
                        <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                          <p className="text-sm font-semibold text-red-800 mb-1">Confirmação final</p>
                          <p className="text-xs text-red-600 mb-2">
                            Digite <strong>{card.name}</strong> para confirmar a exclusão:
                          </p>
                          <input
                            type="text"
                            autoFocus
                            placeholder={card.name}
                            className="w-full text-sm border border-red-200 rounded-lg px-3 py-1.5 mb-2 focus:outline-none focus:ring-1 focus:ring-red-300 bg-white"
                            value={cardDel.input}
                            onChange={(e) => setCardDel((s) => ({ ...s, input: e.target.value }))}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setCardDel(IDLE)}
                              className="flex-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50 transition-colors"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={confirmDeleteCard}
                              disabled={cardDel.input !== card.name}
                              className="flex-1 text-xs font-bold text-white bg-red-600 rounded-lg py-1.5 hover:bg-red-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              Deletar definitivamente
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              )
            })
          )}
        </div>
      </section>

      {openCard && (
        <CardTransactionsModal
          card={openCard}
          month={month}
          onClose={() => setOpenCard(null)}
        />
      )}
    </div>
  )
}
