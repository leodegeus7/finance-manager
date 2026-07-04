import { supabase } from '@/lib/supabase'

export interface NewAccountInput {
  name: string
  bank: string
  balance: number
}

export interface NewCardInput {
  name: string
  bank: string
}

export async function createAccount(userId: string, input: NewAccountInput): Promise<void> {
  const { error } = await supabase
    .from('accounts')
    .insert({ id: crypto.randomUUID(), user_id: userId, name: input.name, bank: input.bank, balance: input.balance })
  if (error) throw error
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from('accounts').delete().eq('id', id)
  if (error) throw error
}

export async function createCard(userId: string, input: NewCardInput): Promise<void> {
  const { error } = await supabase
    .from('credit_cards')
    .insert({ id: crypto.randomUUID(), user_id: userId, name: input.name, bank: input.bank, invoice_total: 0, invoice_paid: 0 })
  if (error) throw error
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from('credit_cards').delete().eq('id', id)
  if (error) throw error
}

export interface AccountRow {
  id: string
  name: string
  bank: string
  balance: number
  is_investment: boolean
  custodian?: string | null
}

export interface CardRow {
  id: string
  name: string
  bank: string
  invoice_total: number
  invoice_paid: number
  status: 'paid' | 'partial' | 'open'
}

export async function fetchAccounts(userId: string): Promise<AccountRow[]> {
  // select('*') keeps this resilient to the is_investment/custodian columns not
  // existing yet (before the investments migration runs).
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .order('name')

  if (error) throw error
  return (data ?? []).map((r) => ({
    id:            r.id,
    name:          r.name,
    bank:          r.bank,
    balance:       Number(r.balance),
    is_investment: Boolean(r.is_investment),
    custodian:     (r.custodian as string | null) ?? null,
  }))
}

/** Marks/unmarks an account as an investment custodian (with optional broker label). */
export async function updateAccountInvestment(
  id: string,
  isInvestment: boolean,
  custodian?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = { is_investment: isInvestment }
  if (custodian !== undefined) patch.custodian = custodian
  const { error } = await supabase.from('accounts').update(patch).eq('id', id)
  if (error) throw error
}

export async function fetchCards(userId: string, month: string): Promise<CardRow[]> {
  const [cardsRes, txRes] = await Promise.all([
    supabase
      .from('credit_cards')
      .select('id, name, bank, invoice_paid')
      .eq('user_id', userId)
      .order('name'),
    supabase
      .from('transactions')
      .select('credit_card_id, amount, direction')
      .eq('user_id', userId)
      .eq('statement_month', month)
      .not('credit_card_id', 'is', null),
  ])

  if (cardsRes.error) throw cardsRes.error

  // Build totals map from actual transactions.
  // Expenses add to the invoice total; income (refunds/credits) reduce it —
  // matches CardTransactionsModal's "Total fatura" calculation.
  const totalsMap = new Map<string, number>()
  for (const tx of txRes.data ?? []) {
    const cid = tx.credit_card_id as string
    const delta = tx.direction === 'expense' ? Number(tx.amount) : -Number(tx.amount)
    totalsMap.set(cid, (totalsMap.get(cid) ?? 0) + delta)
  }

  return (cardsRes.data ?? []).map((r) => {
    const total = totalsMap.get(r.id) ?? 0
    const paid  = Number(r.invoice_paid)
    const status: CardRow['status'] =
      total > 0 && paid >= total ? 'paid' : paid > 0 ? 'partial' : 'open'
    return { id: r.id, name: r.name, bank: r.bank, invoice_total: total, invoice_paid: paid, status }
  })
}
