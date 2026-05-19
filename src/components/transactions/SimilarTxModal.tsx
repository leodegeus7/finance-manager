// ============================================================
// SIMILAR TX MODAL
// Aparece após classificar uma transação quando existem outras
// com descrição parecida ainda sem a mesma classificação.
// ============================================================

import { useState } from 'react'
import { Transaction, SplitParticipant } from '@/engine/types'
import { formatCurrency, formatDate, formatMonth } from '@/lib/format'
import { splitBadge } from './SplitEditor'
import { Classification, saveSkip } from '@/lib/classificationMemory'

interface Category { id: string; name: string; parent_name?: string }

interface Props {
  similar: Transaction[]               // transações similares encontradas
  classification: Classification       // clf recém aplicada
  categories: Category[]
  onApply: (ids: string[]) => void     // aplica clf às selecionadas
  onDismiss: () => void
}

export function SimilarTxModal({ similar, classification, categories, onApply, onDismiss }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(similar.map((t) => t.id)))
  const [dontAsk, setDontAsk]   = useState(false)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleApply() {
    if (dontAsk && similar.length > 0) {
      saveSkip(similar[0].description, classification)
    }
    onApply(Array.from(selected))
  }

  function handleDismiss() {
    if (dontAsk && similar.length > 0) {
      saveSkip(similar[0].description, classification)
    }
    onDismiss()
  }

  const catLabel = (id?: string) => {
    if (!id) return null
    const c = categories.find((c) => c.id === id)
    return c ? (c.parent_name ? `${c.parent_name} › ${c.name}` : c.name) : null
  }

  const badge = splitBadge(
    classification.splits as SplitParticipant[] | undefined,
    'leo',
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[85vh] flex flex-col">

        {/* Header */}
        <div>
          <h2 className="text-base font-semibold text-gray-900">Aplicar às similares?</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Encontrei {similar.length} transaç{similar.length > 1 ? 'ões' : 'ão'} com descrição parecida ainda sem essa classificação.
          </p>
        </div>

        {/* Classification summary */}
        <div className="bg-gray-50 rounded-xl px-4 py-2.5 flex flex-wrap gap-2 items-center text-xs">
          {catLabel(classification.category_id) ? (
            <span className="font-medium text-gray-700">{catLabel(classification.category_id)}</span>
          ) : (
            <span className="text-gray-400">Sem categoria</span>
          )}
          <span className="text-gray-300">·</span>
          <span className="text-gray-500">
            {classification.context === 'professional' ? 'Profissional' : 'Pessoal'}
          </span>
          <span className="text-gray-300">·</span>
          <span className={`px-1.5 py-0.5 rounded-md ${badge.style}`}>{badge.label}</span>
        </div>

        {/* Transaction list */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1">
          {similar.map((tx) => (
            <label
              key={tx.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                selected.has(tx.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(tx.id)}
                onChange={() => toggle(tx.id)}
                className="accent-blue-600 w-4 h-4 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{tx.description}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDate(tx.date)} · {formatMonth(tx.competency_month)}
                </p>
              </div>
              <span className="text-sm font-semibold text-gray-700 tabular-nums shrink-0">
                {formatCurrency(tx.amount)}
              </span>
            </label>
          ))}
        </div>

        {/* Select all / none */}
        <div className="flex gap-3 text-xs text-blue-600">
          <button onClick={() => setSelected(new Set(similar.map((t) => t.id)))}>
            Marcar todas
          </button>
          <span className="text-gray-300">·</span>
          <button onClick={() => setSelected(new Set())}>Desmarcar todas</button>
        </div>

        {/* Don't ask again */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
            className="accent-gray-700 w-4 h-4"
          />
          <span className="text-xs text-gray-500">
            Não perguntar novamente para esse tipo de transação com essa classificação
          </span>
        </label>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleDismiss}
            className="flex-1 text-sm text-gray-500 border border-gray-200 py-2 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Ignorar
          </button>
          <button
            onClick={handleApply}
            disabled={selected.size === 0}
            className="flex-1 text-sm bg-gray-900 text-white py-2 rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
          >
            Aplicar {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
