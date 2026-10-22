import { createHash } from 'node:crypto'

type Row = Record<string, any>
const fields = ['category_id', 'context', 'scope', 'splits'] as const
const immutable = ['source', 'external_id', 'user_id', 'account_id', 'credit_card_id', 'date',
  'competency_month', 'statement_month', 'amount', 'signed_amount', 'direction', 'type',
  'description', 'installment_current', 'installment_total']
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
export const rowKey = (r: Row) => JSON.stringify([r.source, r.external_id])
const batchHash = (rows: Row[]) => sha256(JSON.stringify(rows.map(r =>
  immutable.map(k => r[k] ?? null)).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))))

export function exportReview(rows: Row[], fileHash: string, user: string) {
  return { version: 1, file_sha256: fileHash, user, batch_sha256: batchHash(rows),
    entries: rows.map(r => ({ source: r.source, external_id: r.external_id, approved: false,
      preview: Object.fromEntries(immutable.map(k => [k, r[k] ?? null])),
      changes: Object.fromEntries(fields.map(k => [k, r[k] ?? null])) })) }
}

export function applyReview<T extends Row>(rows: T[], review: any, fileHash: string, user: string,
  categoryIds: Set<string>): T[] {
  if (!review || review.version !== 1 || review.file_sha256 !== fileHash || review.user !== user ||
      review.batch_sha256 !== batchHash(rows) || !Array.isArray(review.entries)) {
    throw new Error('Review does not match file/user/account/card/month/batch; export a new review')
  }
  const byKey = new Map(rows.map(r => [rowKey(r), r]))
  if (byKey.size !== rows.length) throw new Error('Duplicate source/external_id in import')
  const seen = new Set<string>()
  const selected: T[] = []
  for (const entry of review.entries) {
    const key = rowKey(entry ?? {})
    if (seen.has(key) || !byKey.has(key)) throw new Error('Unknown or duplicate review identity')
    seen.add(key)
    if (typeof entry.approved !== 'boolean') throw new Error('approved must be boolean')
    if (!entry.approved) continue
    const c = entry.changes
    if (!c || Object.keys(c).some(k => !fields.includes(k as any)) ||
        fields.some(k => !Object.prototype.hasOwnProperty.call(c, k))) {
      throw new Error('Approved changes must explicitly contain only category_id, context, scope, splits')
    }
    if (c.category_id !== null && !categoryIds.has(c.category_id)) throw new Error('Unknown category')
    if (!['personal', 'professional'].includes(c.context)) throw new Error('Invalid context')
    if (!['individual', 'shared'].includes(c.scope)) throw new Error('Invalid scope')
    if (c.scope === 'individual' && c.splits !== null) throw new Error('Individual rows must have null splits')
    if (c.scope === 'shared') {
      if (!Array.isArray(c.splits) || c.splits.length < 2) throw new Error('Shared rows require explicit splits')
      const people = new Set<string>()
      let total = 0
      for (const s of c.splits) {
        if (!s || Object.keys(s).some(k => !['name', 'user_id', 'pct'].includes(k)) ||
            typeof s.name !== 'string' || !s.name.trim() || typeof s.pct !== 'number' ||
            !Number.isFinite(s.pct) || s.pct <= 0 || s.pct > 100 ||
            (s.user_id != null && !['leo', 'murilo'].includes(s.user_id))) throw new Error('Invalid split participant')
        const who = s.user_id ?? s.name.trim().toLowerCase()
        if (people.has(who)) throw new Error('Duplicate split participant')
        people.add(who)
        total += s.pct
      }
      if (Math.abs(total - 100) > 0.000001) throw new Error('Split percentages must total 100')
    }
    selected.push({ ...byKey.get(key)!, ...c })
  }
  if (!selected.length) throw new Error('No approved rows; nothing to import')
  return selected
}

/** Compare only requested fields; existing database metadata is not overwritten. */
export function sameRow(actual: Row, expected: Row): boolean {
  const canonical = (x: any): string => JSON.stringify(x == null ? null : Array.isArray(x)
    ? x.map(v => JSON.parse(canonical(v))) : typeof x === 'object'
      ? Object.fromEntries(Object.keys(x).sort().map(k => [k, JSON.parse(canonical(x[k]))])) : x)
  return Object.keys(expected).every(k => canonical(actual[k]) === canonical(expected[k]))
}
