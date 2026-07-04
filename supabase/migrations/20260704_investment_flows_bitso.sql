-- ============================================================
-- MIGRAÇÃO — Aportes mensais (investment_flows) + seed da Bitso
-- Rode UMA vez no Supabase → SQL Editor. Idempotente.
-- ============================================================

-- 1) Aportes/resgates líquidos por conta e mês (BRL) ------------
create table if not exists investment_flows (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references users(id),
  account_id  text not null references accounts(id) on delete cascade,
  month       date not null,
  net_deposit numeric(14,2) not null,
  source      text not null default 'manual'
              check (source in ('import','transfer','manual')),
  notes       text,
  created_at  timestamptz default now(),
  unique (account_id, month, source)
);
create index if not exists idx_iflows_account_month on investment_flows(account_id, month);

alter table investment_flows enable row level security;
drop policy if exists "allow all" on investment_flows;
create policy "allow all" on investment_flows for all using (true) with check (true);

-- 2) Seed Bitso (calculado dos CSVs funding/withdrawal, cripto/USD
--    convertidos a BRL pela cotação da data via CSV de conversões) --
insert into investment_flows (user_id, account_id, month, net_deposit, source, notes)
values
  ('leo','acc-bitso','2025-06-01',    5.00,'import','Pix'),
  ('leo','acc-bitso','2025-09-01', 6884.93,'import','0,011 BTC + Pix 10'),
  ('leo','acc-bitso','2025-11-01', 4000.00,'import','Pix 4000'),
  ('leo','acc-bitso','2025-12-01',  304.85,'import','Bitso Transfer 50 USD + Pix 30'),
  ('leo','acc-bitso','2026-01-01',  956.43,'import','Bitso Transfer 956,43 BRL'),
  ('leo','acc-bitso','2026-02-01',   64.68,'import','depósitos USD − saques USD/SOL'),
  ('leo','acc-bitso','2026-03-01',  -98.40,'import','saques ETH + USDC')
on conflict (account_id, month, source) do update set
  net_deposit = excluded.net_deposit,
  notes       = excluded.notes;
