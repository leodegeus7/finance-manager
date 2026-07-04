-- ============================================================
-- MIGRAÇÃO — Aportes Binance (investment_flows), 2022–2025
-- Calculado dos 4 CSVs da Binance (valores em BRL já no export),
-- fluxos externos apenas (Deposit/Receive = +, Send/Withdraw = -);
-- conversões, trades e recompensas (EARN) são internos e excluídos.
-- Rode UMA vez no SQL Editor. Idempotente.
-- ============================================================
insert into investment_flows (user_id, account_id, month, net_deposit, source, notes) values
  ('leo','acc-binance','2022-02-01',3907.94,'import','Binance CSV'),
  ('leo','acc-binance','2022-04-01',7226.96,'import','Binance CSV'),
  ('leo','acc-binance','2022-05-01',2535.67,'import','Binance CSV'),
  ('leo','acc-binance','2022-07-01',3257.92,'import','Binance CSV'),
  ('leo','acc-binance','2022-11-01',-123.85,'import','Binance CSV'),
  ('leo','acc-binance','2022-12-01',2082.14,'import','Binance CSV'),
  ('leo','acc-binance','2023-01-01',4057.73,'import','Binance CSV'),
  ('leo','acc-binance','2023-02-01',-79.54,'import','Binance CSV'),
  ('leo','acc-binance','2023-05-01',204.30,'import','Binance CSV'),
  ('leo','acc-binance','2023-06-01',435.16,'import','Binance CSV'),
  ('leo','acc-binance','2023-07-01',-202.95,'import','Binance CSV'),
  ('leo','acc-binance','2023-08-01',-1433.59,'import','Binance CSV'),
  ('leo','acc-binance','2023-09-01',1300.00,'import','Binance CSV'),
  ('leo','acc-binance','2023-11-01',111.90,'import','Binance CSV'),
  ('leo','acc-binance','2024-03-01',-22488.11,'import','Binance CSV'),
  ('leo','acc-binance','2024-06-01',-1598.36,'import','Binance CSV'),
  ('leo','acc-binance','2024-07-01',456.43,'import','Binance CSV'),
  ('leo','acc-binance','2024-08-01',4781.41,'import','Binance CSV'),
  ('leo','acc-binance','2024-12-01',-20000.17,'import','Binance CSV'),
  ('leo','acc-binance','2025-04-01',5400.00,'import','Binance CSV'),
  ('leo','acc-binance','2025-09-01',-6885.22,'import','Binance CSV')
on conflict (account_id, month, source) do update set net_deposit = excluded.net_deposit, notes = excluded.notes;
