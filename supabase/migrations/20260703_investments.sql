-- ============================================================
-- MIGRAÇÃO — Rendimento dos investimentos (Fase 1)
-- Rode UMA vez no Supabase → SQL Editor. É idempotente (safe re-run).
-- ============================================================

-- 1) Contas: marcar corretoras + agrupamento por custodiante ----
alter table accounts add column if not exists is_investment boolean not null default false;
alter table accounts add column if not exists custodian     text;

-- 2) Histórico de saldo mensal (lacuna do schema — já existe no banco vivo) --
create table if not exists account_balance_history (
  id         uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  month      date not null,
  balance    numeric(14,2) not null,
  created_at timestamptz default now(),
  unique (account_id, month)
);
create index if not exists idx_abh_account_month on account_balance_history(account_id, month);

-- 3) Performance anual por corretora (semeada do PDF da XP) ------
create table if not exists investment_year_performance (
  id                 uuid primary key default gen_random_uuid(),
  user_id            text not null references users(id),
  custodian          text not null,
  year               int  not null,
  patrimonio_inicial numeric(14,2) not null,
  patrimonio_final   numeric(14,2) not null,
  movimentacoes      numeric(14,2) not null default 0,
  rendimento         numeric(14,2) not null,
  rentabilidade_pct  numeric(8,4),
  source             text not null default 'manual'
                     check (source in ('xp_pdf','computed','manual')),
  notes              text,
  created_at         timestamptz default now(),
  unique (user_id, custodian, year)
);
create index if not exists idx_iyp_custodian_year on investment_year_performance(custodian, year);

-- 4) RLS (allow all, como o resto do projeto) -------------------
alter table account_balance_history      enable row level security;
alter table investment_year_performance  enable row level security;
drop policy if exists "allow all" on account_balance_history;
drop policy if exists "allow all" on investment_year_performance;
create policy "allow all" on account_balance_history     for all using (true) with check (true);
create policy "allow all" on investment_year_performance for all using (true) with check (true);

-- 5) Pré-marcar contas de investimento (você ajusta depois no toggle) --
update accounts set is_investment = true, custodian = 'XP'
  where id in ('22969818-b7f2-4084-8ea9-e749c4ad609f', 'acc-xp1');
update accounts set is_investment = true, custodian = 'Binance'  where id = 'acc-binance';
update accounts set is_investment = true, custodian = 'Bitso'    where id = 'acc-bitso';
update accounts set is_investment = true, custodian = 'Avenue'   where id = 'acc-avenue';
update accounts set is_investment = true, custodian = 'Warren'   where id = 'acc-warren';
update accounts set is_investment = true, custodian = 'Liqi'     where id = 'acc-liqi';
update accounts set is_investment = true, custodian = 'PeerBr'   where id = 'acc-peerbr';
update accounts set is_investment = true, custodian = 'C6 Dólar' where id = 'acc-c6dolar';

-- 6) Seed anual da XP (valores do PDF "Evolução patrimonial", verbatim) --
insert into investment_year_performance
  (user_id, custodian, year, patrimonio_inicial, patrimonio_final, movimentacoes, rendimento, rentabilidade_pct, source)
values
  ('leo','XP',2018,      0.00,  10799.58,  10799.95,    12.65,  -0.18,'xp_pdf'),
  ('leo','XP',2019,  10799.58,  35800.02,  22289.51,  2863.31,   9.67,'xp_pdf'),
  ('leo','XP',2020,  35800.02,  28111.43,  -8138.75,   828.34,   3.77,'xp_pdf'),
  ('leo','XP',2021,  28111.43,      0.00, -28403.18,   388.71,   1.85,'xp_pdf'),
  ('leo','XP',2022,      0.00,  82817.19,  82277.57,   539.62,   1.29,'xp_pdf'),
  ('leo','XP',2023,  82817.19, 135288.78,  36617.04, 15914.28,  14.84,'xp_pdf'),
  ('leo','XP',2024, 135288.78, 223788.11,  63735.54, 25290.67,  14.92,'xp_pdf'),
  ('leo','XP',2025, 223788.11, 333838.30,  67537.45, 43377.49,  16.26,'xp_pdf'),
  ('leo','XP',2026, 333838.30, 347441.54,    839.10, 13896.83,   4.35,'xp_pdf')
on conflict (user_id, custodian, year) do update set
  patrimonio_inicial = excluded.patrimonio_inicial,
  patrimonio_final   = excluded.patrimonio_final,
  movimentacoes      = excluded.movimentacoes,
  rendimento         = excluded.rendimento,
  rentabilidade_pct  = excluded.rentabilidade_pct,
  source             = excluded.source;
