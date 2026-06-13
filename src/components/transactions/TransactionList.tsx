// UI Rule 4.5 — uncategorized first
// UI Rule 4.6 — instant feedback, no reload
import { useMemo, useState, useCallback } from 'react'
import { Transaction } from '@/engine/types'
import { TransactionRow } from './TransactionRow'
import { SimilarTxModal } from './SimilarTxModal'
import { sortWithUncategorizedFirst } from '@/engine/CategoryEngine'
import { normalizeDesc, shouldSkip, Classification } from '@/lib/classificationMemory'

interface Category { id: string; name: string; parent_name?: string }
interface Account  { id: string; name: string }

interface Props {
  transactions: Transaction[]
  categories: Category[]
  accounts?: Account[]
  /** Optional map of user_id → display name. When provided, shows who paid. */
  userNames?: Record<string, string>
  onUpdate: (id: string, patch: Partial<Transaction> & { notes?: string | null }) => void
  onDelete?: (id: string) => void
}

interface PendingModal {
  similar: Transaction[]
  classification: Classification
  patch: Partial<Transaction>
}

export function TransactionList({ transactions, categories, accounts, userNames, onUpdate, onDelete }: Props) {
  const [pending, setPending] = useState<PendingModal | null>(null)

  // UI Rule 4.5: uncategorized transactions shown first
  const sorted = useMemo(
    () => sortWithUncategorizedFirst(transactions),
    [transactions],
  )

  const handleUpdate = useCallback((id: string, patch: Partial<Transaction> & { notes?: string | null }) => {
    // Always apply the primary update immediately
    onUpdate(id, patch)

    // Build classification object for memory comparison
    const clf: Classification = {
      category_id: patch.category_id,
      context: (patch.context as Classification['context']) ?? 'personal',
      splits: (patch as any).splits ?? null,
    }

    // Find the source transaction
    const source = transactions.find((t) => t.id === id)
    if (!source) return

    // Check if any field actually changed (skip if user just closed without editing)
    const hasChange =
      patch.category_id !== source.category_id ||
      patch.context     !== source.context     ||
      JSON.stringify((patch as any).splits ?? null) !== JSON.stringify(source.splits ?? null)
    if (!hasChange) return

    // If user already said "don't ask again" for this exact clf, skip modal
    if (shouldSkip(source.description, clf)) return

    // Find similar transactions: same normalized description, no category yet
    const normSource = normalizeDesc(source.description)
    const similar = transactions.filter((t) => {
      if (t.id === id) return false
      if (normalizeDesc(t.description) !== normSource) return false
      // Only suggest if transaction hasn't been categorized yet
      return !t.category_id
    })

    if (similar.length === 0) return

    setPending({ similar, classification: clf, patch })
  }, [transactions, onUpdate])

  function handleApply(ids: string[]) {
    if (!pending) return
    ids.forEach((id) => onUpdate(id, pending.patch))
    setPending(null)
  }

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        Nenhuma transação encontrada
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-0.5">
        {sorted.map((tx) => (
          <TransactionRow
            key={tx.id}
            tx={tx}
            categories={categories}
            accounts={accounts}
            userNames={userNames}
            onUpdate={handleUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>

      {pending && (
        <SimilarTxModal
          similar={pending.similar}
          classification={pending.classification}
          categories={categories}
          onApply={handleApply}
          onDismiss={() => setPending(null)}
        />
      )}
    </div>
  )
}
