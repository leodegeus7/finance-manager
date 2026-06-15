// Modal de lançamento de balanço mensal — abre ao clicar em "Pendente"/"Feito"
// na coluna Balanço do Checklist. Pré-carrega as contas ativas (com o último
// saldo conhecido como sugestão) e permite adicionar outras contas da lista.

import { useState, useEffect } from 'react'
import { AccountRow, fetchAccounts } from '@/lib/db/accounts'
import { fetchLatestAccountBalances, isAccountActive, upsertAccountBalance, AccountLatestEntry } from '@/lib/db/networth'
import { formatMonth } from '@/lib/format'

interface Props {
  userId: string
  month: string       // YYYY-MM-01
  onClose: () => void
  onSaved: () => void
}

export function BalanceEntryModal({ userId, month, onClose, onSaved }: Props) {
  const [accounts, setAccounts]   = useState<AccountRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const [includedIds, setIncludedIds] = useState<string[]>([])
  const [values, setValues]           = useState<Record<string, string>>({})
  const [addSelect, setAddSelect]     = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    Promise.all([fetchAccounts(userId), fetchLatestAccountBalances(userId, month)])
      .then(([accs, { entries }]) => {
        setAccounts(accs)

        const active = accs.filter((a) => isAccountActive(entries.get(a.id), month))
        setIncludedIds(active.map((a) => a.id))

        const initialValues: Record<string, string> = {}
        for (const a of active) {
          const last = (entries as Map<string, AccountLatestEntry>).get(a.id)?.balance
          if (last != null) initialValues[a.id] = String(last).replace('.', ',')
        }
        setValues(initialValues)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [userId, month])

  const includedSet = new Set(includedIds)
  const remainingAccounts = accounts.filter((a) => !includedSet.has(a.id))

  function addAccount(id: string) {
    if (!id) return
    setIncludedIds((prev) => [...prev, id])
    setAddSelect('')
  }

  function removeAccount(id: string) {
    setIncludedIds((prev) => prev.filter((x) => x !== id))
    setValues((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const toSave = includedIds
        .map((id) => ({ id, raw: values[id]?.trim() }))
        .filter((e) => e.raw)
        .map((e) => ({ id: e.id, balance: parseFloat(e.raw!.replace(',', '.')) }))
        .filter((e) => !Number.isNaN(e.balance))

      await Promise.all(toSave.map((e) => upsertAccountBalance(e.id, month, e.balance)))
      onSaved()
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Balanço — {formatMonth(month)}</h2>
            <p className="text-sm text-gray-400 mt-0.5">Saldo final do mês de cada conta</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5"
          >×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>
          ) : (
            <>
              {includedIds.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">Nenhuma conta ativa encontrada</p>
              )}

              {includedIds.map((id) => {
                const acc = accounts.find((a) => a.id === id)
                if (!acc) return null
                return (
                  <div key={id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{acc.name}</p>
                      <p className="text-xs text-gray-400 capitalize">{acc.bank}</p>
                    </div>
                    <input
                      type="text"
                      placeholder="0,00"
                      className="w-32 text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-right focus:outline-none focus:ring-1 focus:ring-gray-300"
                      value={values[id] ?? ''}
                      onChange={(e) => setValues((prev) => ({ ...prev, [id]: e.target.value }))}
                    />
                    <button
                      onClick={() => removeAccount(id)}
                      className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
                      title="Remover da lista"
                    >×</button>
                  </div>
                )
              })}

              {remainingAccounts.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <select
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
                    value={addSelect}
                    onChange={(e) => addAccount(e.target.value)}
                  >
                    <option value="">+ Adicionar outra conta...</option>
                    {remainingAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 pt-3 border-t border-gray-100 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 bg-gray-900 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-40 hover:bg-gray-700 transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
