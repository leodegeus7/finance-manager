// ============================================================
// IMPORT MODAL
// Flow: file → detect → preview+classify → save → done
// Transactions are NOT saved until the user clicks "Salvar".
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react'
import { resolveHandler, isCardHandler, isMuriloHandler } from '@/import/HandlerRegistry'
import { runImportPipeline } from '@/import/ImportPipeline'
import { NormalizedTransaction } from '@/import/types'
import { InterCreditPDFHandler } from '@/import/handlers/InterCreditPDFHandler'
import { extractPDFText } from '@/import/utils/pdf'
import { upsertTransactions, ImportClassification } from '@/lib/db/import'
import { AccountRow, CardRow } from '@/lib/db/accounts'
import { CategoryRow, filterCategories } from '@/lib/db/categories'
import { SplitParticipant } from '@/engine/types'
import { SplitEditor } from '@/components/transactions/SplitEditor'
import { CategorySelect } from '@/components/ui/CategorySelect'
import { formatMonth, formatCurrency, formatDate } from '@/lib/format'

interface Props {
  userId: string
  accounts: AccountRow[]
  cards: CardRow[]
  categories: CategoryRow[]
  initialFile?: File
  onClose: () => void
  onSuccess: (month?: string) => void  // month = primary competency_month of imported txs
}

type Step = 'idle' | 'detecting' | 'preview' | 'saving' | 'done' | 'error'

const SOURCE_LABELS: Record<string, string> = {
  nubank_account:    'Nubank Conta',
  nubank_credit:     'Nubank Cartão',
  c6_credit:         'C6 Cartão',
  inter_credit:      'Inter Cartão',
  murilo_transacoes: 'Murilo — Todas as Transações',
}

function guessStatementMonth(fileName: string): string {
  const m = fileName.match(/(\d{4})[_\-](0[1-9]|1[0-2])/)
  if (m) return `${m[1]}-${m[2]}-01`
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function guessCard(source: string, cards: CardRow[]): CardRow | undefined {
  if (source === 'nubank_credit') return cards.find((c) => c.bank === 'nubank') ?? cards[0]
  if (source === 'c6_credit')     return cards.find((c) => c.bank === 'c6')     ?? cards[0]
  if (source === 'inter_credit')  return cards.find((c) => c.bank === 'inter')  ?? cards[0]
  return cards[0]
}

function guessAccount(source: string, accounts: AccountRow[]): AccountRow | undefined {
  if (source === 'nubank_account') return accounts.find((a) => a.bank === 'nubank') ?? accounts[0]
  if (source === 'c6_account')     return accounts.find((a) => a.bank === 'c6')     ?? accounts[0]
  return accounts[0]
}

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

interface Draft {
  category_id: string
  context: 'personal' | 'professional'
  splits: SplitParticipant[] | null
  is_transfer: boolean
  to_account_id: string
}

function txIsTransfer(tx: NormalizedTransaction) {
  return tx.type === 'transfer' || tx.type === 'credit_card_payment'
}

export function ImportModal({ userId, accounts, cards, categories, initialFile, onClose, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep]                   = useState<Step>('idle')
  const [file, setFile]                   = useState<File | null>(null)
  const [source, setSource]               = useState('')
  const [extractedText, setExtractedText] = useState('')
  const [needsCard, setNeedsCard]         = useState(false)
  const [selectedCardId, setSelectedCardId]         = useState('')
  const [selectedInterCardId, setSelectedInterCardId] = useState('')
  const [selectedAccountId, setSelectedAccountId]   = useState('')
  const [statementMonth, setStatementMonth]     = useState('')
  const [normalizedTxs, setNormalizedTxs]       = useState<NormalizedTransaction[]>([])
  const [drafts, setDrafts]               = useState<Map<string, Draft>>(new Map())
  const [result, setResult]               = useState<{ inserted: number; skipped: number; month?: string } | null>(null)
  const [validationWarning, setValidationWarning] = useState('')
  const [errorMsg, setErrorMsg]           = useState('')
  const [saving, setSaving]               = useState(false)

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setStep('detecting')
    setErrorMsg('')
    setValidationWarning('')

    try {
      let content = ''
      if (f.name.toLowerCase().endsWith('.pdf')) {
        const buf = await f.arrayBuffer()
        content = await extractPDFText(buf)
      } else {
        content = await f.text()
      }
      setExtractedText(content)

      const { handler } = resolveHandler(f.name, content)
      const isCard    = isCardHandler(handler.source)
      const isMurilo  = isMuriloHandler(handler.source)
      setSource(handler.source)
      setNeedsCard(isCard)

      const monthGuess = guessStatementMonth(f.name)
      setStatementMonth(monthGuess)

      let resolvedCardId: string | undefined
      let resolvedInterCardId: string | undefined
      let resolvedAccountId: string | undefined

      if (isMurilo) {
        resolvedCardId      = cards.find((c) => c.bank === 'nubank')?.id  ?? cards[0]?.id ?? ''
        resolvedInterCardId = cards.find((c) => c.bank === 'inter')?.id   ?? ''
        resolvedAccountId   = accounts.find((a) => a.bank === 'nubank')?.id ?? accounts[0]?.id ?? ''
        setSelectedCardId(resolvedCardId)
        setSelectedInterCardId(resolvedInterCardId)
        setSelectedAccountId(resolvedAccountId)
      } else if (isCard) {
        resolvedCardId = guessCard(handler.source, cards)?.id ?? cards[0]?.id ?? ''
        setSelectedCardId(resolvedCardId)
      } else {
        resolvedAccountId = guessAccount(handler.source, accounts)?.id ?? accounts[0]?.id ?? ''
        setSelectedAccountId(resolvedAccountId)
      }

      // Parse and preview immediately — do NOT save yet
      const ctx = {
        userId,
        creditCardId:      resolvedCardId,
        creditCardIdInter: resolvedInterCardId,
        accountId:         resolvedAccountId,
        statementMonth:    isCard ? monthGuess : undefined,
      }

      // Only run the pipeline if we have the required context (card or account).
      // If cards haven't loaded yet, skip — reparse() will fire when selectedCardId changes.
      let pipeline = { transactions: [] as NormalizedTransaction[] }
      if (!isCard || resolvedCardId) {
        pipeline = runImportPipeline({ fileName: f.name, fileContent: content, context: ctx })
      }

      // PDF validation warning
      if (f.name.toLowerCase().endsWith('.pdf') && handler.source === 'inter_credit') {
        const pdfHandler = new InterCreditPDFHandler()
        const val = pdfHandler.validateTotal(content, pipeline.transactions)
        if (!val.ok) {
          const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
          setValidationWarning(
            `Soma extraída (${fmt(val.extracted)}) difere do total (${fmt(val.expected ?? 0)})`
          )
        }
      }

      setNormalizedTxs(pipeline.transactions)

      // Initialise drafts — use handler-suggested values when available
      const initDrafts = new Map<string, Draft>()
      for (const tx of pipeline.transactions) {
        initDrafts.set(tx.external_id, {
          category_id:  tx.suggested_category_id ?? '',
          context:      tx.suggested_context     ?? 'personal',
          splits:       tx.suggested_splits      ?? null,
          is_transfer:  false,
          to_account_id: '',
        })
      }
      setDrafts(initDrafts)

      setStep('preview')
    } catch (e) {
      setErrorMsg(String(e))
      setStep('error')
    }
  }, [accounts, cards, userId])

  // Re-run parse when account/card/month selection changes in preview
  const reparse = useCallback(() => {
    if (!file || !extractedText) return
    if (needsCard && !selectedCardId) return  // wait for card to be selected
    const isMurilo = isMuriloHandler(source)
    const ctx = {
      userId,
      creditCardId:      needsCard || isMurilo ? selectedCardId      : undefined,
      creditCardIdInter: isMurilo               ? selectedInterCardId : undefined,
      accountId:         !needsCard || isMurilo ? selectedAccountId   : undefined,
      statementMonth:    needsCard               ? statementMonth      : undefined,
    }
    try {
      const pipeline = runImportPipeline({ fileName: file.name, fileContent: extractedText, context: ctx })
      setNormalizedTxs(pipeline.transactions)
      setDrafts((prev) => {
        const next = new Map<string, Draft>()
        for (const tx of pipeline.transactions) {
          next.set(tx.external_id, prev.get(tx.external_id) ?? {
            category_id:  tx.suggested_category_id ?? '',
            context:      tx.suggested_context     ?? 'personal',
            splits:       tx.suggested_splits      ?? null,
            is_transfer:  false,
            to_account_id: '',
          })
        }
        return next
      })
    } catch {}
  }, [file, extractedText, userId, source, needsCard, selectedCardId, selectedInterCardId, selectedAccountId, statementMonth])

  useEffect(() => {
    if (step === 'preview') reparse()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCardId, selectedInterCardId, selectedAccountId, statementMonth])

  useEffect(() => {
    if (initialFile) handleFile(initialFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateDraft(externalId: string, patch: Partial<Draft>) {
    setDrafts((prev) => {
      const next = new Map(prev)
      next.set(externalId, { ...prev.get(externalId)!, ...patch })
      return next
    })
  }

  async function handleSave() {
    if (!file) return
    setSaving(true)
    try {
      const isMurilo = isMuriloHandler(source)
      const ctx = {
        userId,
        creditCardId:      needsCard || isMurilo ? selectedCardId      : undefined,
        creditCardIdInter: isMurilo               ? selectedInterCardId : undefined,
        accountId:         !needsCard || isMurilo ? selectedAccountId   : undefined,
        statementMonth:    needsCard               ? statementMonth      : undefined,
      }

      // Build classification map for the upsert
      const classifications = new Map<string, ImportClassification>()
      for (const [extId, d] of drafts.entries()) {
        classifications.set(extId, {
          category_id: d.category_id || undefined,
          context: d.context,
          splits: d.splits,
          is_transfer: d.is_transfer,
          to_account_id: d.to_account_id || undefined,
        })
      }

      const res = await upsertTransactions(
        normalizedTxs,
        userId,
        ctx.accountId,
        ctx.creditCardId,
        classifications,
      )

      // Find the primary competency_month (most frequent among imported txs)
      const monthCounts: Record<string, number> = {}
      for (const tx of normalizedTxs) {
        monthCounts[tx.competency_month] = (monthCounts[tx.competency_month] ?? 0) + 1
      }
      const primaryMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0]

      setResult({ inserted: res.inserted, skipped: res.skipped, month: primaryMonth })

      if (res.errors.length) {
        setErrorMsg(res.errors.join('; '))
        setStep('error')
      } else {
        setStep('done')
      }
    } catch (e) {
      setErrorMsg(String(e))
      setStep('error')
    } finally {
      setSaving(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const selCls = 'text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400'
  const isPreview = step === 'preview'

  const income  = normalizedTxs.filter((t) => t.direction === 'income').length
  const expense = normalizedTxs.filter((t) => t.direction === 'expense').length

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-xl w-full p-6 space-y-5 flex flex-col ${isPreview ? 'max-w-2xl max-h-[90vh]' : 'max-w-md'}`}>

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {isPreview ? 'Conferir e classificar' : 'Importar extrato'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* ── idle / detecting ── */}
        {(step === 'idle' || step === 'detecting') && (
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-gray-300 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {step === 'detecting' ? (
              <p className="text-sm text-gray-400">Detectando formato...</p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-600">Arraste ou clique para selecionar</p>
                <p className="text-xs text-gray-400 mt-1">CSV · Nubank, C6 · PDF · Inter</p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".csv,.pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>
        )}

        {/* ── preview ── */}
        {step === 'preview' && file && (
          <>
            {/* File + source + account/card selector */}
            <div className="shrink-0 space-y-3">
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                <div>
                  <p className="text-xs text-gray-400 truncate max-w-xs">{file.name}</p>
                  <p className="text-xs text-blue-600 font-medium mt-0.5">{SOURCE_LABELS[source] ?? source}</p>
                </div>
                <div className="flex gap-2 text-xs text-gray-500">
                  {income > 0 && <span className="text-green-600 font-medium">+{income} crédito{income !== 1 ? 's' : ''}</span>}
                  {expense > 0 && <span className="font-medium">{expense} débito{expense !== 1 ? 's' : ''}</span>}
                </div>
              </div>

              {isMuriloHandler(source) ? (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Nubank Cartão</label>
                    <select className="w-full text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none"
                      value={selectedCardId} onChange={(e) => setSelectedCardId(e.target.value)}>
                      {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Inter Cartão</label>
                    <select className="w-full text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none"
                      value={selectedInterCardId} onChange={(e) => setSelectedInterCardId(e.target.value)}>
                      {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Nubank Conta</label>
                    <select className="w-full text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none"
                      value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
              ) : needsCard ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Cartão</label>
                    <select className="w-full text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none"
                      value={selectedCardId} onChange={(e) => setSelectedCardId(e.target.value)}>
                      {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Mês da fatura</label>
                    <select className="w-full text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none"
                      value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)}>
                      {recentMonths().map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Conta</label>
                  <select className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none"
                    value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}

              {validationWarning && (
                <p className="text-xs text-yellow-600 bg-yellow-50 rounded-lg px-3 py-2">{validationWarning}</p>
              )}
            </div>

            {/* Transaction list */}
            <div className="flex-1 overflow-y-auto -mx-1 px-1 rounded-xl border border-gray-100 divide-y divide-gray-50 min-h-0">
              {normalizedTxs.map((tx) => {
                const draft = drafts.get(tx.external_id)
                if (!draft) return null
                const isIncome = tx.direction === 'income'
                const transfer = draft.is_transfer
                const cats = filterCategories(categories, tx.direction)

                return (
                  <div key={tx.external_id} className="px-3 py-2.5 space-y-1.5 hover:bg-gray-50">
                    {/* Row 1: date + desc + amount */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 tabular-nums">{formatDate(tx.date)}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-sm font-medium text-gray-900 truncate">{tx.description}</p>
                          {tx.type === 'credit_card_payment' && (
                            <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-400 shrink-0">pag. fatura</span>
                          )}
                        </div>
                      </div>
                      <span className={`text-sm font-semibold tabular-nums shrink-0 ${isIncome ? 'text-green-600' : 'text-gray-900'}`}>
                        {isIncome ? '+' : '-'}{formatCurrency(tx.amount)}
                      </span>
                    </div>

                    {/* Row 2: transfer toggle + classification */}
                    {tx.type !== 'credit_card_payment' && (
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Transfer toggle */}
                        <button
                          onClick={() => updateDraft(tx.external_id, { is_transfer: !draft.is_transfer, category_id: '', splits: null })}
                          className={`text-xs px-2 py-1 rounded-lg border transition-colors font-medium shrink-0 ${
                            draft.is_transfer
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          ⇄ Transferência
                        </button>

                        {transfer && accounts.length > 0 && (
                          <select
                            className={selCls + ' flex-1 min-w-0'}
                            value={draft.to_account_id}
                            onChange={(e) => updateDraft(tx.external_id, { to_account_id: e.target.value })}
                          >
                            <option value="">Conta destino...</option>
                            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        )}

                        {!transfer && (
                          <>
                            <CategorySelect
                              className="flex-1 min-w-0"
                              inputClassName={selCls}
                              value={draft.category_id}
                              onChange={(id) => updateDraft(tx.external_id, { category_id: id })}
                              categories={cats}
                              placeholder="Sem categoria"
                            />

                            <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs shrink-0">
                              {(['personal', 'professional'] as const).map((v) => (
                                <button key={v}
                                  onClick={() => updateDraft(tx.external_id, { context: v })}
                                  className={`px-2 py-1 rounded-md transition-colors font-medium ${draft.context === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}
                                >
                                  {v === 'personal' ? 'Pessoal' : 'Prof.'}
                                </button>
                              ))}
                            </div>

                            {!isIncome && (
                              <SplitEditor
                                splits={draft.splits}
                                payerUserId={userId}
                                onChange={(s) => updateDraft(tx.external_id, { splits: s })}
                              />
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Actions */}
            <div className="flex gap-2 shrink-0 pt-1">
              <button onClick={onClose}
                className="flex-1 border border-gray-200 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-gray-900 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-40">
                {saving ? 'Salvando...' : `Salvar ${normalizedTxs.length} transações`}
              </button>
            </div>
          </>
        )}

        {/* ── saving ── */}
        {step === 'saving' && (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-500">Salvando transações...</p>
          </div>
        )}

        {/* ── done ── */}
        {step === 'done' && result && (
          <>
            <div className="bg-green-50 rounded-xl p-4 space-y-1">
              <p className="text-sm font-semibold text-green-800">
                {result.inserted} transaç{result.inserted !== 1 ? 'ões' : 'ão'} salva{result.inserted !== 1 ? 's' : ''}
              </p>
              {result.skipped > 0 && (
                <p className="text-xs text-green-600">{result.skipped} já existiam e foram ignoradas</p>
              )}
            </div>
            <button onClick={() => onSuccess(result.month)}
              className="w-full bg-gray-900 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-gray-700 transition-colors">
              {result.month ? `Ver transações de ${formatMonth(result.month)}` : 'Fechar'}
            </button>
          </>
        )}

        {/* ── error ── */}
        {step === 'error' && (
          <>
            <div className="bg-red-50 rounded-xl p-4">
              <p className="text-sm font-semibold text-red-800 mb-1">Erro na importação</p>
              <p className="text-xs text-red-600 break-words">{errorMsg}</p>
            </div>
            <button onClick={() => setStep('idle')}
              className="w-full border border-gray-200 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
              Tentar novamente
            </button>
          </>
        )}

      </div>
    </div>
  )
}
