-- ============================================================
-- Categorias por ledger (casal × fazenda)
--
-- Adiciona `categories.user_id` para escopar categorias por perfil:
--   NULL       → categorias globais do casal (leo/murilo)
--   'fazenda'  → categorias próprias da fazenda
-- Idempotente: seguro rodar mais de uma vez no SQL Editor.
-- Ver fetchCategories em src/lib/db/categories.ts.
-- ============================================================

-- Perfil da fazenda (3º ledger)
insert into users (id, name, investment_target_pct) values
  ('fazenda', 'Fazenda', 20)
on conflict (id) do nothing;

-- Coluna de dono da categoria (NULL = casal/global)
alter table categories
  add column if not exists user_id text references users(id);
