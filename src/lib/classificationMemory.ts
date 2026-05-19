// ============================================================
// CLASSIFICATION MEMORY
// Guarda regras "não perguntar novamente" no localStorage.
// Chave: descrição normalizada (sem números de parcela/final)
// Valor: classificação serializada — se a clf mudar, pergunta de novo
// ============================================================

import { SplitParticipant } from '@/engine/types'

export interface Classification {
  category_id?: string
  context: 'personal' | 'professional'
  splits: SplitParticipant[] | null
}

const STORAGE_KEY = 'finance-clf-skip-v1'

/** Remove parcelas (X/Y), números soltos no final, espaços extras */
export function normalizeDesc(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\s*[-–]\s*\d+\/\d+\s*$/, '')   // "Mercado - 2/3"
    .replace(/\s*#?\d+\s*$/, '')              // trailing number
    .replace(/\s+/g, ' ')
    .trim()
}

function load(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } catch { return {} }
}

function persist(data: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function key(desc: string) { return normalizeDesc(desc) }
function serialize(clf: Classification) { return JSON.stringify(clf) }

/** Returns true if the user previously said "don't ask again" for this exact classification */
export function shouldSkip(desc: string, clf: Classification): boolean {
  return load()[key(desc)] === serialize(clf)
}

/** Save the "don't ask again" rule */
export function saveSkip(desc: string, clf: Classification): void {
  const data = load()
  data[key(desc)] = serialize(clf)
  persist(data)
}
