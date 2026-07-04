-- ============================================================
-- MIGRAÇÃO — Composição da XP por ativo (investment_holdings)
-- Fase 3. Snapshot do PosicaoDetalhada.xlsx (03/07/2026).
-- Só visualização; NÃO entra no cálculo de patrimônio.
-- Rode UMA vez no SQL Editor. Idempotente.
-- ============================================================
create table if not exists investment_holdings (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null references users(id),
  custodian     text not null,
  snapshot_date date not null,
  asset_class   text not null,
  ticker        text,
  name          text not null,
  quantity      numeric(20,8),
  avg_price     numeric(20,8),
  cost_basis    numeric(14,2),
  market_value  numeric(14,2) not null,
  pct_alloc     numeric(8,4),
  return_pct    numeric(10,2),
  created_at    timestamptz default now(),
  unique (user_id, custodian, snapshot_date, name)
);
create index if not exists idx_iholdings_custodian_date on investment_holdings(custodian, snapshot_date);
alter table investment_holdings enable row level security;
drop policy if exists "allow all" on investment_holdings;
create policy "allow all" on investment_holdings for all using (true) with check (true);

insert into investment_holdings (user_id,custodian,snapshot_date,asset_class,ticker,name,quantity,avg_price,cost_basis,market_value,pct_alloc,return_pct) values
  ('leo','XP','2026-07-03','fundo',null,'ARX Fuji FIC de FIF RF CP RL',null,null,21300.0,21421.8,6.13,0.57),
  ('leo','XP','2026-07-03','fundo',null,'Trend DI FIC RF Simples RL',null,null,1144.36,1528.8,0.44,33.59),
  ('leo','XP','2026-07-03','acao','IVVB11','IVVB11',173.0,217.2,37575.6,75632.14,21.65,101.28),
  ('leo','XP','2026-07-03','acao','BRAX11','BRAX11',98.0,149.36,14637.28,14288.4,4.09,-2.38),
  ('leo','XP','2026-07-03','acao','SBSP3','SBSP3',155.0,16.59,2571.45,4707.35,1.35,83.06),
  ('leo','XP','2026-07-03','acao','GGBR4','GGBR4',202.0,16.72,3377.44,4330.88,1.24,28.23),
  ('leo','XP','2026-07-03','acao','VALE3','VALE3',53.0,64.21,3403.13,4178.52,1.2,22.78),
  ('leo','XP','2026-07-03','acao','SAPR11','SAPR11',109.0,23.0,2507.0,4037.36,1.16,61.04),
  ('leo','XP','2026-07-03','acao','PETR4','PETR4',101.0,35.35,3570.35,3863.25,1.11,8.2),
  ('leo','XP','2026-07-03','acao','ISAE4','ISAE4',134.0,23.68,3173.12,3705.1,1.06,16.77),
  ('leo','XP','2026-07-03','acao','CPFE3','CPFE3',77.0,32.4,2494.8,3518.13,1.01,41.02),
  ('leo','XP','2026-07-03','acao','PRIO3','PRIO3',64.0,42.08,2693.12,3389.44,0.97,25.86),
  ('leo','XP','2026-07-03','acao','LEVE3','LEVE3',99.0,33.21,3287.79,3242.25,0.93,-1.39),
  ('leo','XP','2026-07-03','acao','LAVV3','LAVV3',274.0,11.63,3186.62,3178.4,0.91,-0.26),
  ('leo','XP','2026-07-03','acao','CMIG4','CMIG4',266.0,8.97,2386.02,2933.98,0.84,22.97),
  ('leo','XP','2026-07-03','acao','BBAS3','BBAS3',140.0,25.42,3558.8,2797.2,0.8,-21.4),
  ('leo','XP','2026-07-03','acao','CMIN3','CMIN3',627.0,5.55,3479.85,2702.37,0.77,-22.34),
  ('leo','XP','2026-07-03','acao','TGMA3','TGMA3',87.0,36.89,3209.43,2687.43,0.77,-16.26),
  ('leo','XP','2026-07-03','acao','RECV3','RECV3',218.0,14.74,3213.32,2101.52,0.6,-34.6),
  ('leo','XP','2026-07-03','acao','VLID3','VLID3',114.0,17.11,1950.54,2029.2,0.58,4.03),
  ('leo','XP','2026-07-03','fii','IRIM11','IRIM11',84.0,75.47,6339.48,5619.6,1.61,-11.36),
  ('leo','XP','2026-07-03','fii','KNCR11','KNCR11',51.0,104.57,5333.07,5490.66,1.57,2.95),
  ('leo','XP','2026-07-03','fii','VGIP11','VGIP11',66.0,86.76,5726.16,5380.32,1.54,-6.04),
  ('leo','XP','2026-07-03','fii','BTLG11','BTLG11',52.0,101.97,5302.44,5334.68,1.53,0.61),
  ('leo','XP','2026-07-03','fii','HGRE11','HGRE11',41.0,123.45,5061.45,5201.67,1.49,2.77),
  ('leo','XP','2026-07-03','fii','RZAK11','RZAK11',63.0,86.95,5477.85,5178.6,1.48,-5.46),
  ('leo','XP','2026-07-03','fii','HGLG11','HGLG11',34.0,160.06,5442.04,5110.2,1.46,-6.1),
  ('leo','XP','2026-07-03','fii','MCRE11','MCRE11',560.0,9.41,5269.6,5101.6,1.46,-3.19),
  ('leo','XP','2026-07-03','fii','PCIP11','PCIP11',63.0,89.85,5660.55,4946.76,1.42,-12.61),
  ('leo','XP','2026-07-03','fii','BRCR11','BRCR11',111.0,52.86,5867.46,4695.3,1.34,-19.98),
  ('leo','XP','2026-07-03','renda_fixa',null,'LCD BRDE - MAI/2030',1151.71,0.0,50446.05,51826.89,14.84,2.74),
  ('leo','XP','2026-07-03','renda_fixa',null,'CDB BANCO C6 CONSIGNADO S.A. - MAR/2027',1591.48,177.1,2002.32,3182.97,0.91,58.96),
  ('leo','XP','2026-07-03','renda_fixa',null,'CDB AGIBANK - OUT/2028',1104.58,209.17,10000.0,11045.85,3.16,10.46),
  ('leo','XP','2026-07-03','renda_fixa',null,'CDB BANCO C6 CONSIGNADO S.A. - MAI/2029',1021.84,44.23,9000.0,9196.59,2.63,2.18),
  ('leo','XP','2026-07-03','renda_fixa',null,'CDB BMG - AGO/2028',1.2,205.44,6000.0,7173.94,2.05,19.57),
  ('leo','XP','2026-07-03','renda_fixa',null,'CDB AGIBANK - NOV/2027',1090.86,109.03,6000.0,6545.16,1.87,9.09),
  ('leo','XP','2026-07-03','renda_fixa',null,'NTN-B - AGO/2028',4850.46,125.36,4014.75,4602.81,1.32,14.65),
  ('leo','XP','2026-07-03','renda_fixa',null,'CDB BANCO C6 CONSIGNADO S.A. - MAI/2027',1219.19,115.08,3000.0,3657.58,1.05,21.92),
  ('leo','XP','2026-07-03','renda_fixa',null,'CDB BMG - JUL/2027',1.41,61.31,1000.0,1408.76,0.4,40.88),
  ('leo','XP','2026-07-03','renda_fixa',null,'CDB BANCO PAN S/A - AGO/2027',1376.58,56.49,1000.0,1376.58,0.39,37.66),
  ('leo','XP','2026-07-03','renda_fixa',null,'CDB PINE - ABR/2027',1198.02,554.44,16000.0,19168.25,5.49,19.8),
  ('leo','XP','2026-07-03','renda_fixa',null,'CDB NBC BANK - OUT/2026',1101.86,101.86,5000.0,5509.32,1.58,10.19),
  ('leo','XP','2026-07-03','renda_fixa',null,'CDB BANCO C6 CONSIGNADO S.A. - NOV/2026',1236.13,123.97,3000.0,3708.4,1.06,23.61)
on conflict (user_id, custodian, snapshot_date, name) do update set
  quantity=excluded.quantity, avg_price=excluded.avg_price, cost_basis=excluded.cost_basis,
  market_value=excluded.market_value, pct_alloc=excluded.pct_alloc, return_pct=excluded.return_pct;
