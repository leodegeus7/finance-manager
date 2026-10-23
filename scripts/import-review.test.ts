import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyReview, exportReview, sameRow, sha256 } from './import-review'

const hash = sha256('fixture')
const rows = [1, 2, 3].map(n => ({ source: 'c6_credit', external_id: `id-${n}`, user_id: 'leo',
  amount: n * 10, signed_amount: -n * 10, description: `purchase ${n}`, account_id: null,
  credit_card_id: 'card-leo', statement_month: '2026-10-01', type: 'credit_card_purchase',
  category_id: null, context: 'personal', scope: 'individual', splits: null }))
const categories = new Set(['food', 'gift'])
const review = () => { const m = exportReview(rows, hash, 'leo'); m.entries[0].approved = true; return m }
const apply = (m: any, sourceRows = rows, fileHash = hash, user = 'leo') =>
  applyReview(sourceRows, m, fileHash, user, categories)

test('selects only approved identity, ignoring unapproved historical suggestions; no mutation', () => {
  const m = review(); m.entries[0].changes.category_id = 'food'
  m.entries[1].changes.category_id = 'gift'
  const result = apply(m)
  assert.equal(result.length, 1); assert.equal(result[0].external_id, 'id-1')
  assert.equal(result[0].category_id, 'food'); assert.equal(rows[0].category_id, null)
})
test('preserves approved category and exact 50/50 couple split', () => {
  const m = review(); Object.assign(m.entries[0].changes, { category_id: 'gift', scope: 'shared',
    splits: [{ name: 'Leo', user_id: 'leo', pct: 50 }, { name: 'Murilo', user_id: 'murilo', pct: 50 }] })
  assert.deepEqual(apply(m)[0].splits, m.entries[0].changes.splits)
})
test('requires explicit approval, does not import whole file by default', () => {
  assert.throws(() => apply(exportReview(rows, hash, 'leo')), /No approved/)
  const m = review(); (m.entries[0] as any).approved = 'true'; assert.throws(() => apply(m), /boolean/)
})
test('rejects changed file, person, card, amount or month', () => {
  assert.throws(() => apply(review(), rows, sha256('changed')), /does not match/)
  assert.throws(() => apply(review(), rows, hash, 'murilo'), /does not match/)
  for (const patch of [{ credit_card_id: 'other' }, { amount: 1 }, { statement_month: '2026-11-01' }])
    assert.throws(() => apply(review(), rows.map(r => ({ ...r, ...patch }))), /does not match/)
})
test('rejects duplicate and nonexistent identities, including unapproved entries', () => {
  const m = review(); m.entries.push(m.entries[0]); assert.throws(() => apply(m), /duplicate/)
  const n = review(); n.entries[1].external_id = 'unknown'; assert.throws(() => apply(n), /Unknown/)
})
test('cannot alter financial values, ownership or account through review changes', () => {
  for (const field of ['amount', 'signed_amount', 'user_id', 'credit_card_id', 'type', '__proto__']) {
    const m = review(); Object.defineProperty(m.entries[0].changes, field, { enumerable: true, value: 42 })
    assert.throws(() => apply(m), /only category_id/)
  }
})
test('requires complete explicit classification and existing category', () => {
  const m = review(); delete m.entries[0].changes.scope; assert.throws(() => apply(m), /explicitly/)
  const n = review(); n.entries[0].changes.category_id = 'made-up'; assert.throws(() => apply(n), /Unknown category/)
})
test('rejects inconsistent scope and invalid context', () => {
  const m = review(); m.entries[0].changes.context = 'business'; assert.throws(() => apply(m), /context/)
  const n = review(); n.entries[0].changes.splits = []; assert.throws(() => apply(n), /Individual/)
  const p = review(); p.entries[0].changes.scope = 'shared'; assert.throws(() => apply(p), /explicit splits/)
})
test('rejects bad percentages, duplicate people and nonfinite values', () => {
  for (const pct of [20, -50, Number.NaN, 150]) {
    const m = review(); Object.assign(m.entries[0].changes, { scope: 'shared',
      splits: [{ name: 'Leo', user_id: 'leo', pct }, { name: 'Murilo', user_id: 'murilo', pct: 50 }] })
    assert.throws(() => apply(m), /Split|split/)
  }
  const m = review(); Object.assign(m.entries[0].changes, { scope: 'shared',
    splits: [{ name: 'Leo', user_id: 'leo', pct: 50 }, { name: 'Leo', user_id: 'leo', pct: 50 }] })
  assert.throws(() => apply(m), /Duplicate split/)
})
test('existing row comparison ignores database metadata and object-key order, not revisions', () => {
  const expected = apply(review())[0]
  assert.ok(sameRow({ ...expected, id: 'db-id', created_at: 'now' }, expected))
  assert.ok(sameRow({ ...expected, splits: [{ pct: 50, name: 'Leo' }] }, { ...expected, splits: [{ name: 'Leo', pct: 50 }] }))
  assert.ok(!sameRow({ ...expected, category_id: 'wrong' }, expected))
  assert.ok(!sameRow({ ...expected, user_id: 'murilo' }, expected))
})
