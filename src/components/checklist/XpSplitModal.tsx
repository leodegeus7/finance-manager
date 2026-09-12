// Modal de lançamento da divisão pessoal/profissional da conta XP única
// (faz-acc-xp) — só existe no perfil Fazenda. A fazenda sempre transfere um
// valor único pra XP; esta é a planilha à parte que separa quanto daquele
// saldo é pessoal vs profissional, lançada manualmente todo mês.

import { useState, useEffect } from 'react'
import { fetchXpSplitHistory, latestXpSplit, upsertXpSplit } from '@/lib/db/xpSplit'
import { formatMonth } from '@/lib/format'

interface Props {
  userId: string
  month: string       // YYYY-MM-01
  onClose: () => void
  onSaved: () => void
}

export function XpSplitModal({ userId, month, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [personal, setPersonal]         = useState('')
  const [professional, setProfessional] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetchXpSplitHistory(userId)
      .then((history) => {
        const existing = history.find((r) => r.month === month) ?? latestXpSplit(history, month)
        if (existing) {
          setPersonal(String(existing.personal).replace('.', ','))
          setProfessional(String(existing.professional).replace('.', ','))
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [userId, month])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const p = parseFloat(personal.replace(',', '.'))
      const pr = parseFloat(professional.replace(',', '.'))
      if (Number.isNaN(p) || Number.isNaN(pr)) {
        setError('Preencha os dois valores')
        return
      }
      await upsertXpSplit(userId, month, p, pr)
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>

        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Divisão XP — {formatMonth(month)}</h2>
            <p className="text-sm text-gray-400 mt-0.5">Quanto do saldo da XP é pessoal vs profissional</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">×</button>
        </div>

        <div className="p-4 space-y-3">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Carregando...</p>
          ) : (
            <>
              <Field label="Pessoal" value={personal} onChange={setPersonal} />
              <Field label="Profissional" value={professional} onChange={setProfessional} />
            </>
          )}
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

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

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-1 text-sm font-medium text-gray-900">{label}</span>
      <input
        type="text"
        placeholder="0,00"
        className="w-32 text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-right focus:outline-none focus:ring-1 focus:ring-gray-300"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
