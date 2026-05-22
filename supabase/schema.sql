-- ============================================================
-- FINANCE MANAGER — SUPABASE SCHEMA
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to re-run: drops existing tables first, then recreates.
-- ============================================================

-- Drop in reverse dependency order
drop table if exists asset_movements    cascade;
drop table if exists net_worth_snapshots cascade;
drop table if exists assets             cascade;
drop table if exists transactions       cascade;
drop table if exists credit_cards       cascade;
drop table if exists accounts           cascade;
drop table if exists sharing_rules      cascade;
drop table if exists categories         cascade;
drop table if exists users              cascade;

-- ── USERS ────────────────────────────────────────────────────
create table users (
  id                     text primary key,
  name                   text not null,
  investment_target_pct  numeric(5,2) not null default 20,
  created_at             timestamptz default now()
);

-- Seed initial users (Leonardo & Murilo)
insert into users (id, name, investment_target_pct) values
  ('leo',    'Leonardo', 20),
  ('murilo', 'Murilo',   20)
on conflict (id) do nothing;

-- ── SHARING RULES ────────────────────────────────────────────
create table sharing_rules (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null references users(id),
  percentage     numeric(5,2) not null,
  effective_from date not null default current_date,
  created_at     timestamptz default now()
);

insert into sharing_rules (user_id, percentage, effective_from) values
  ('leo',    60, '2024-01-01'),
  ('murilo', 40, '2024-01-01')
on conflict do nothing;

-- ── CATEGORIES ───────────────────────────────────────────────
create table categories (
  id           text primary key,
  name         text not null,
  parent_id    text references categories(id),
  is_essential boolean not null default false,
  created_at   timestamptz default now()
);

insert into categories (id, name, parent_id, is_essential) values
  -- top-level (alphabetical)
  ('cat-alim',    'Alimentação',  null,        true),
  ('cat-subs',    'Assinaturas',  null,        false),
  ('cat-beleza',  'Beleza',       null,        false),
  ('cat-casa',    'Casa',         null,        false),
  ('cat-celular', 'Celular',      null,        false),
  ('cat-emprest', 'Empréstimo',   null,        false),
  ('cat-edu',     'Educação',     null,        false),
  ('cat-invest',  'Investimentos',null,        false),
  ('cat-lazer',   'Lazer',        null,        false),
  ('cat-mercado', 'Mercado',      null,        true),
  ('cat-moradia', 'Moradia',      null,        true),
  ('cat-pagto',   'Pagamento',    null,        false),
  ('cat-pet',     'Pet',          null,        false),
  ('cat-presente','Presente',     null,        false),
  ('cat-renda',   'Renda',        null,        false),
  ('cat-roupas',  'Roupas',       null,        false),
  ('cat-saude',   'Saúde',        null,        true),
  ('cat-taxas',   'Taxas',        null,        false),
  ('cat-transp',  'Transporte',   null,        true),
  ('cat-trab',    'Trabalho',     null,        false),
  ('cat-viagem',  'Viagem',       null,        false),
  -- receitas (prefixo inc-)
  ('inc-bonus',    'Bônus',        null,        false),
  ('inc-cashback', 'Cashback',     null,        false),
  ('inc-estorno',  'Estorno',      null,        false),
  ('inc-pagto',    'Pagamento',    null,        false),
  ('inc-presente', 'Presente',     null,        false),
  ('inc-reembolso','Reembolso',    null,        false),
  ('inc-renda',    'Renda',        null,        false),
  ('inc-salario',  'Salário',      null,        false),
  -- subcategorias de Alimentação
  ('cat-rest',    'Restaurantes', 'cat-alim',  false),
  -- subcategorias de Lazer
  ('cat-balada',  'Balada',       'cat-lazer', false),
  ('cat-bar',     'Bar',          'cat-lazer', false),
  ('cat-bebida',  'Bebida',       'cat-lazer', false),
  ('cat-cinema',  'Cinema',       'cat-lazer', false),
  -- novas categorias de despesa (top-level)
  ('cat-carro',         'Carro',                  null,           false),
  ('cat-clinica',       'Clínica',                null,           false),
  ('cat-marketing',     'Marketing',              null,           false),
  ('cat-cartao',        'Cartão',                 null,           false),
  ('cat-cashback',      'Cashback',               null,           false),
  ('cat-doacao',        'Doação',                 null,           false),
  ('cat-emprest-cred',  'Empréstimo de Crédito',  null,           false),
  ('cat-juridico',      'Jurídico',               null,           false),
  ('cat-outros',        'Outros',                 null,           false),
  ('cat-reajuste',      'Reajuste',               null,           false),
  ('cat-saque',         'Saque',                  null,           false),
  ('cat-seguro-vida',   'Seguro de vida',          null,           false),
  ('cat-contabil',      'Serviços Contábeis',      null,           false),
  ('cat-impostos',      'Impostos/Taxas',          null,           false),
  ('cat-nao-lembro',    'Não Lembro',              null,           false),
  ('cat-souvenirs',     'Souvenirs',               null,           false),
  ('cat-apto-raul',     'Apartamento Raul',        null,           false),
  ('cat-pag-terceiros', 'Pagamentos de terceiros', null,           false),
  ('cat-artigos',       'Artigos aleatórios',      null,           false),
  -- novas receitas (top-level)
  ('inc-aluguel',        'Aluguel',               null,           false),
  ('inc-emprestimo',     'Empréstimo',             null,           false),
  ('inc-investimento',   'Investimento',           null,           false),
  ('inc-outros',         'Outros',                 null,           false),
  ('inc-reajuste',       'Reajuste',               null,           false),
  ('inc-resgate',        'Resgate Investimento',   null,           false),
  ('inc-pag-cartao',     'Pagamento Cartão',       null,           false),
  ('inc-estorno-cartao', 'Estorno Cartão',         null,           false),
  ('inc-receita-prod',   'Receita p/ Produtos',    null,           false),
  ('inc-impostos',       'Impostos',               null,           false),
  ('inc-venda-bem',      'Venda de bem pessoal',   null,           false),
  ('inc-pag-terceiros',  'Pagamentos de terceiros',null,           false),
  ('inc-premio',         'Prêmio',                 null,           false),
  ('inc-recebimento',    'Recebimento',            null,           false),
  -- subcategorias de Carro
  ('cat-carro-ipva',        'IPVA',                       'cat-carro',     false),
  ('cat-carro-aluguel',     'Aluguel',                    'cat-carro',     false),
  ('cat-carro-combustivel', 'Combustível',                 'cat-carro',     true),
  ('cat-carro-seguro',      'Seguro',                     'cat-carro',     false),
  ('cat-carro-estac',       'Estacionamento',             'cat-carro',     false),
  ('cat-carro-pedagio',     'Pedágios',                   'cat-carro',     false),
  ('cat-carro-multa',       'Multas',                     'cat-carro',     false),
  ('cat-carro-manut',       'Manutenção',                 'cat-carro',     false),
  -- subcategorias de Clínica
  ('cat-clin-aluguel',    'Aluguel',                    'cat-clinica',   false),
  ('cat-clin-produtos',   'Produtos',                   'cat-clinica',   false),
  ('cat-clin-mat-escrit', 'Materiais de escritório',    'cat-clinica',   false),
  ('cat-clin-mat-med',    'Materiais Médicos',          'cat-clinica',   false),
  ('cat-clin-mat-div',    'Materiais diversos extras',  'cat-clinica',   false),
  ('cat-clin-comissao',   'ComissãoClínicaExterna',     'cat-clinica',   false),
  -- subcategorias de Marketing
  ('cat-mkt-agencia', 'Agência', 'cat-marketing', false),
  ('cat-mkt-anuncio', 'Anúncio', 'cat-marketing', false),
  -- subcategorias de Alimentação (novas)
  ('cat-alim-cafe',      'Café',                  'cat-alim',  false),
  ('cat-alim-delivery',  'Delivery',              'cat-alim',  false),
  ('cat-alim-lanches',   'Lanches',               'cat-alim',  false),
  ('cat-alim-marmitas',  'Marmitas',              'cat-alim',  false),
  ('cat-alim-rest-dia',  'Restaurantes dia-dia',  'cat-alim',  false),
  ('cat-alim-rest-laz',  'Restaurantes p/ Lazer', 'cat-alim',  false),
  ('cat-alim-snacks',    'Snacks',                'cat-alim',  false),
  -- subcategorias de Casa (novas)
  ('cat-casa-manut', 'Manutenção', 'cat-casa', false),
  -- subcategorias de Educação (novas)
  ('cat-edu-ingles', 'Aula de Inglês', 'cat-edu', false),
  ('cat-edu-curso',  'Curso',          'cat-edu', false),
  -- subcategorias de Lazer (novas)
  ('cat-lazer-aniv',    'Aniversário',   'cat-lazer', false),
  ('cat-lazer-apostas', 'Apostas',       'cat-lazer', false),
  ('cat-lazer-apps',    'Apps',          'cat-lazer', false),
  ('cat-lazer-entret',  'Entretenimento','cat-lazer', false),
  -- subcategorias de Viagem (novas)
  ('cat-viagem-transp', 'Transporte', 'cat-viagem', false),
  ('cat-viagem-hosp',   'Hospedagem', 'cat-viagem', false),
  -- subcategorias de Saúde (novas)
  ('cat-saude-academia', 'Academia',                  'cat-saude', false),
  ('cat-saude-personal', 'Personal',                  'cat-saude', false),
  ('cat-saude-farmacia', 'Farmácia',                  'cat-saude', true),
  ('cat-saude-medico',   'Médico/Dentista/Psicólogo', 'cat-saude', false),
  ('cat-saude-supl',     'Suplementos',               'cat-saude', false),
  -- subcategorias de Pet (novas)
  ('cat-pet-nala',    'Nala',   'cat-pet', false),
  ('cat-pet-aquario', 'Aquário','cat-pet', false),
  -- subcategorias de Recebimento (receita)
  ('inc-receb-muller',  'Muller',  'inc-recebimento', false),
  ('inc-receb-clinica', 'Clínica', 'inc-recebimento', false),
  ('inc-receb-lucio',   'Lúcio',   'inc-recebimento', false),
  ('inc-receb-qpele',   'QPele',   'inc-recebimento', false),
  ('inc-receb-renove',  'Renove',  'inc-recebimento', false),
  ('inc-receb-buffara', 'Buffara', 'inc-recebimento', false),
  -- subcategorias de Pagamentos (receita)
  ('inc-pag-mae-pai', 'Mãe/Pai', 'inc-pagto', false)
on conflict (id) do nothing;

-- ── ACCOUNTS ─────────────────────────────────────────────────
create table accounts (
  id         text primary key,
  user_id    text not null references users(id),
  name       text not null,
  bank       text not null,
  balance    numeric(14,2) not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into accounts (id, user_id, name, bank, balance) values
  ('acc1', 'leo',    'Nubank Conta', 'nubank', 10200),
  ('acc2', 'leo',    'C6 Conta',     'c6',     3400)
on conflict (id) do nothing;

-- ── CREDIT CARDS ─────────────────────────────────────────────
create table credit_cards (
  id            text primary key,
  user_id       text not null references users(id),
  name          text not null,
  bank          text not null,
  invoice_total numeric(14,2) not null default 0,
  invoice_paid  numeric(14,2) not null default 0,
  created_at    timestamptz default now()
);

-- Derived status: 'paid' | 'partial' | 'open'
-- computed on read: invoice_paid >= invoice_total → paid; invoice_paid > 0 → partial; else open

insert into credit_cards (id, user_id, name, bank, invoice_total, invoice_paid) values
  ('cc1', 'leo', 'Nubank Roxinho', 'nubank', 1280.70, 1200),
  ('cc2', 'leo', 'C6 Cartão',      'c6',     640.00,  0)
on conflict (id) do nothing;

-- ── TRANSACTIONS ─────────────────────────────────────────────
create table transactions (
  id                   text primary key default gen_random_uuid()::text,
  user_id              text not null references users(id),
  account_id           text references accounts(id),
  credit_card_id       text references credit_cards(id),
  to_account_id        text references accounts(id),

  date                 date not null,
  competency_month     date not null,
  statement_month      date,

  amount               numeric(14,2) not null,
  signed_amount        numeric(14,2) not null,
  direction            text not null check (direction in ('income','expense')),
  type                 text not null,

  description          text not null,
  category_id          text references categories(id),

  context              text not null default 'personal' check (context in ('personal','professional')),
  scope                text not null default 'individual' check (scope in ('individual','shared')),
  splits               jsonb default null,

  is_essential         boolean not null default false,
  fixed_type           text check (fixed_type in ('fixed','variable','occasional')),

  installment_current  int,
  installment_total    int,

  external_id          text not null,
  source               text not null,
  notes                text,

  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),

  unique (external_id, source)
);

create index idx_tx_competency_month on transactions(competency_month);
create index idx_tx_user_id          on transactions(user_id);
create index idx_tx_category_id      on transactions(category_id);

-- ── ASSETS ───────────────────────────────────────────────────
create table assets (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null references users(id),
  name          text not null,
  type          text not null check (type in ('financial','real')),
  current_value numeric(14,2) not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

insert into assets (id, user_id, name, type, current_value) values
  ('ast1', 'leo', 'RDB Nubank',    'financial', 13800),
  ('ast2', 'leo', 'Pinus (Sítio)', 'real',      25000)
on conflict (id) do nothing;

-- ── ASSET MOVEMENTS ──────────────────────────────────────────
create table asset_movements (
  id             text primary key default gen_random_uuid()::text,
  asset_id       text not null references assets(id),
  transaction_id text references transactions(id),
  type           text not null check (type in ('contribution','withdrawal','adjustment')),
  amount         numeric(14,2) not null,
  date           date not null,
  notes          text,
  created_at     timestamptz default now()
);

-- ── NET WORTH SNAPSHOTS ───────────────────────────────────────
create table net_worth_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  month              date not null unique,
  accounts_total     numeric(14,2) not null,
  assets_total       numeric(14,2) not null,
  net_worth          numeric(14,2) not null,
  monthly_change     numeric(14,2),
  monthly_change_pct numeric(8,4),
  created_at         timestamptz default now()
);

insert into net_worth_snapshots (month, accounts_total, assets_total, net_worth, monthly_change, monthly_change_pct) values
  ('2024-01-01', 8200,  12000, 20200, null, null),
  ('2024-02-01', 7800,  12500, 20300, 100,  0.5),
  ('2024-03-01', 9100,  13000, 22100, 1800, 8.9),
  ('2024-04-01', 10200, 13800, 24000, 1900, 8.6)
on conflict (month) do nothing;

-- ── ROW LEVEL SECURITY (basic) ───────────────────────────────
-- Enable for all tables; allow anon for now (add auth later)
alter table users              enable row level security;
alter table accounts           enable row level security;
alter table credit_cards       enable row level security;
alter table transactions       enable row level security;
alter table assets             enable row level security;
alter table asset_movements    enable row level security;
alter table net_worth_snapshots enable row level security;
alter table categories         enable row level security;
alter table sharing_rules      enable row level security;

-- Permissive policies (open for now — tighten when auth is added)
create policy "allow all" on users              for all using (true) with check (true);
create policy "allow all" on accounts           for all using (true) with check (true);
create policy "allow all" on credit_cards       for all using (true) with check (true);
create policy "allow all" on transactions       for all using (true) with check (true);
create policy "allow all" on assets             for all using (true) with check (true);
create policy "allow all" on asset_movements    for all using (true) with check (true);
create policy "allow all" on net_worth_snapshots for all using (true) with check (true);
create policy "allow all" on categories         for all using (true) with check (true);
create policy "allow all" on sharing_rules      for all using (true) with check (true);
