-- ============================================================
-- Unifica XP Pessoal + XP Profissional numa conta só
--
-- A fazenda sempre transferiu um valor único da conta Sicredi pra XP —
-- a divisão pessoal/profissional era só uma planilha à parte do usuário,
-- nunca duas contas de verdade. Isso criava ambiguidade na hora de
-- reconciliar transferências Sicredi ↔ XP (ver §6 do CLAUDE.md).
--
-- Esta migração:
--   1. Cria a conta única `faz-acc-xp`.
--   2. Migra o histórico de saldo (soma pessoal + profissional por mês)
--      pra essa conta nova.
--   3. Cria `fazenda_xp_split`, que guarda a divisão pessoal/profissional
--      por mês (preenchida com o histórico existente) — é o que a página
--      Pessoal × Profissional (FazendaSplit.tsx) passa a ler, e o que o
--      Checklist mensal passa a pedir pra lançar.
--   4. Remove as contas antigas (faz-acc-xp-pessoal / faz-acc-xp-profissional)
--      e seu histórico de saldo.
--
-- Idempotente: seguro rodar mais de uma vez no SQL Editor.
-- ============================================================

-- ── Divisão pessoal/profissional por mês ──────────────────────
create table if not exists fazenda_xp_split (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text not null references users(id),
  month               date not null,               -- YYYY-MM-01
  personal_amount     numeric(14,2) not null,
  professional_amount numeric(14,2) not null,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique (user_id, month)
);
create index if not exists idx_fazenda_xp_split_month on fazenda_xp_split(user_id, month);

alter table fazenda_xp_split enable row level security;
drop policy if exists "allow all" on fazenda_xp_split;
create policy "allow all" on fazenda_xp_split for all using (true) with check (true);

-- ── Conta única XP ─────────────────────────────────────────────
insert into accounts (id, user_id, name, bank, balance, is_investment, custodian) values
  ('faz-acc-xp', 'fazenda', 'XP', 'xp', 0, true, 'XP')
on conflict (id) do nothing;

-- ── Migra o histórico de saldo (soma pessoal + profissional) ──
insert into account_balance_history (account_id, month, balance)
select 'faz-acc-xp', month, sum(balance)
from account_balance_history
where account_id in ('faz-acc-xp-pessoal', 'faz-acc-xp-profissional')
group by month
on conflict (account_id, month) do update set balance = excluded.balance;

-- ── Seed da divisão histórica pessoal/profissional ────────────
insert into fazenda_xp_split (user_id, month, personal_amount, professional_amount)
select
  'fazenda',
  p.month,
  p.balance,
  coalesce(pr.balance, 0)
from account_balance_history p
left join account_balance_history pr
  on pr.account_id = 'faz-acc-xp-profissional' and pr.month = p.month
where p.account_id = 'faz-acc-xp-pessoal'
on conflict (user_id, month) do update set
  personal_amount     = excluded.personal_amount,
  professional_amount = excluded.professional_amount;

-- ── Reaponta transações que já apontavam pras contas antigas ──
-- (marcadas como transferência na importação, antes da conta única existir)
update transactions set to_account_id = 'faz-acc-xp'
where to_account_id in ('faz-acc-xp-pessoal', 'faz-acc-xp-profissional');

-- ── Remove as contas antigas e seu histórico ──────────────────
delete from account_balance_history
where account_id in ('faz-acc-xp-pessoal', 'faz-acc-xp-profissional');

delete from accounts
where id in ('faz-acc-xp-pessoal', 'faz-acc-xp-profissional');

-- ── Converte os pares confirmados Sicredi ↔ XP em transferência de verdade ──
-- Reconciliado contra os extratos da XP (conta 3181708) de jan-set/2026 —
-- ver conversa. Os R$60.000 (18/03) e R$6.000 (18/08) ficaram de fora por
-- não terem contrapartida encontrada no extrato da XP; permanecem como
-- despesa categorizada "XP Caixinha" até serem verificados.

-- Saída Sicredi → XP (R$250.000, 03/06/2026)
update transactions set type = 'transfer', to_account_id = 'faz-acc-xp', category_id = null
where id = '03a605c7-e756-4b0c-a670-3fbd29cf369d';

-- Saída Sicredi → XP (R$100.000, 15/06/2026)
update transactions set type = 'transfer', to_account_id = 'faz-acc-xp', category_id = null
where id = 'b52fd8c6-234b-478f-ba0a-0efe265af60c';

-- Saída Sicredi → XP (R$66.619,74, 10/08/2026) — já era type=transfer
update transactions set to_account_id = 'faz-acc-xp', category_id = null
where id = 'b7d75fc6-ac2d-4b8d-99d6-ed2fcc9a7111';

-- Retorno XP → Sicredi (R$33.096, 30/04/2026) — sem to_account_id: o modelo
-- de transferência só representa o destino, não a origem
update transactions set type = 'transfer', category_id = null,
  notes = 'Retorno da XP Caixinha'
where id = '57ff0ccb-9a89-4243-b71f-e6f2e4b3047b';

-- Retorno XP → Sicredi (R$9.000, 06/05/2026)
update transactions set type = 'transfer', category_id = null,
  notes = 'Retorno da XP Caixinha'
where id = 'b2e280c5-b015-4284-889e-e6d3fb34d7fe';
