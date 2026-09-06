// Aplica o seed da fazenda no Supabase via supabase-js (anon key, RLS allow-all).
// Idempotente: usa upsert com ignoreDuplicates (ON CONFLICT DO NOTHING).
//
// PRÉ-REQUISITO (DDL, rodar 1x no SQL Editor — o JS não roda ALTER TABLE):
//   alter table categories add column if not exists user_id text references users(id);
//
// Uso: node scripts/seed_fazenda.mjs [caminho.json]
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const JSON_PATH = process.argv[2] ?? 'supabase/migrations/20260708_fazenda_seed.json'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter(Boolean).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const data = JSON.parse(readFileSync(JSON_PATH, 'utf8'))

async function upsertAll(table, rows, onConflict, batch = 500) {
  let done = 0
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch)
    // ignoreDuplicates:false => ON CONFLICT DO UPDATE, para re-rodar sincronizar
    // os dados com o JSON (ex.: correção de competency_month). Preserva o id.
    const { error } = await sb.from(table).upsert(chunk, { onConflict, ignoreDuplicates: false })
    if (error) { console.error(`✗ ${table} [${i}..]:`, error.message); process.exit(1) }
    done += chunk.length
    process.stdout.write(`\r  ${table}: ${done}/${rows.length}`)
  }
  console.log(`\r✓ ${table}: ${rows.length} rows`)
}

// Pré-checagem: a coluna categories.user_id precisa existir.
const probe = await sb.from('categories').select('user_id').limit(1)
if (probe.error && /user_id/.test(probe.error.message)) {
  console.error('\n✗ Falta a coluna categories.user_id. Rode primeiro no SQL Editor:')
  console.error('    alter table categories add column if not exists user_id text references users(id);\n')
  process.exit(1)
}

console.log(`Aplicando seed da fazenda em ${env.VITE_SUPABASE_URL} ...`)
await upsertAll('users', data.users, 'id')
await upsertAll('accounts', data.accounts, 'id')
await upsertAll('credit_cards', data.credit_cards, 'id')
await upsertAll('categories', data.categories, 'id')
await upsertAll('transactions', data.transactions, 'external_id,source')
await upsertAll('account_balance_history', data.account_balance_history, 'account_id,month')

// Limpeza: remove categorias da fazenda que não estão mais no seed (ex.: as
// "categorias" lixo débito/crédito). Roda DEPOIS das transações (já re-apontadas
// para NULL), senão a FK bloqueia o delete.
const validIds = new Set(data.categories.map((c) => c.id))
const existing = await sb.from('categories').select('id,name').eq('user_id', 'fazenda')
const stale = (existing.data ?? []).filter((c) => !validIds.has(c.id))
for (const c of stale) {
  const { error } = await sb.from('categories').delete().eq('id', c.id)
  if (error) console.error(`✗ delete categoria ${c.id}:`, error.message)
  else console.log(`  removida categoria lixo: ${c.name} (${c.id})`)
}

// Resumo final
const { count } = await sb.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', 'fazenda')
console.log(`\n✔ Concluído. Transações da fazenda no banco: ${count}`)
