import { supabase } from '@/lib/supabase'
import { upsertAccountBalance } from './networth'

// Conta única criada pela migração 20260709_fazenda_xp_unify.sql
const XP_ACCOUNT_ID = 'faz-acc-xp'

export interface XpSplitRow {
  month: string   // YYYY-MM-01
  personal: number
  professional: number
}

export async function fetchXpSplitHistory(userId: string): Promise<XpSplitRow[]> {
  const { data, error } = await supabase
    .from('fazenda_xp_split')
    .select('month, personal_amount, professional_amount')
    .eq('user_id', userId)
    .order('month', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    month: r.month as string,
    personal: Number(r.personal_amount),
    professional: Number(r.professional_amount),
  }))
}

/** Latest split recorded up to (and including) `upToMonth`. */
export function latestXpSplit(history: XpSplitRow[], upToMonth: string): XpSplitRow | undefined {
  return [...history].filter((r) => r.month <= upToMonth).sort((a, b) => b.month.localeCompare(a.month))[0]
}

/**
 * Salva a divisão pessoal/profissional do mês E o saldo total da conta única
 * XP (soma dos dois) — o Balanço não precisa ser lançado à parte pra essa
 * conta, já que o total é sempre pessoal + profissional.
 */
export async function upsertXpSplit(
  userId: string,
  month: string,
  personal: number,
  professional: number,
): Promise<void> {
  const { error } = await supabase
    .from('fazenda_xp_split')
    .upsert(
      { user_id: userId, month, personal_amount: personal, professional_amount: professional },
      { onConflict: 'user_id,month' },
    )
  if (error) throw error

  await upsertAccountBalance(XP_ACCOUNT_ID, month, personal + professional)
}
