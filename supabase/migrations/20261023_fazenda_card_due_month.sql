-- Fazenda: alinha o mês da fatura (statement_month) dos cartões migrados da
-- planilha com a convenção do banco — o mês do VENCIMENTO.
--
-- Problema: a planilha rotulava as faturas a partir de nov/2025 pelo "mês das
-- compras" (fatura que vence 15/08 aparecia como julho), enquanto o app do
-- Sicredi e o SicrediCreditHandler usam o mês do vencimento.
--
-- Regra: cada fatura (cartão + rótulo antigo) fecha logo depois da compra mais
-- recente dela. Sicredi fecha ~dia 3-5 e vence dia 15 do mesmo mês, então:
--   compra mais recente até dia 10 → vence naquele mês
--   compra mais recente depois do dia 10 → vence no mês seguinte
-- Faturas de 2024 a out/2025 já estavam assim e não mudam.
--
-- Idempotente: rodar de novo não muda nada (faturas que caem no mesmo mês têm
-- a compra mais recente no mesmo intervalo). Só toca os dados migrados
-- (source = 'fazenda_xlsx_cartao'), nunca faturas importadas pelo app.

with groups as (
  select credit_card_id,
         statement_month,
         max(date) as last_purchase
  from transactions
  where user_id = 'fazenda'
    and source = 'fazenda_xlsx_cartao'
    and credit_card_id is not null
    and statement_month is not null
  group by credit_card_id, statement_month
),
mapping as (
  select credit_card_id,
         statement_month as old_month,
         (date_trunc('month', last_purchase)
           + case when extract(day from last_purchase) > 10
                  then interval '1 month' else interval '0' end)::date as new_month
  from groups
),
updated as (
  update transactions t
  set statement_month = m.new_month
  from mapping m
  where t.user_id = 'fazenda'
    and t.source = 'fazenda_xlsx_cartao'
    and t.credit_card_id = m.credit_card_id
    and t.statement_month = m.old_month
    and m.new_month <> m.old_month
  returning t.id
)
-- 1ª execução: 885 linhas. Rodar de novo: 0 (já corrigido).
select count(*) as linhas_atualizadas from updated;

-- Conferência: total por fatura depois do ajuste (Visa ago/2026 = 39.705,52).
-- select credit_card_id, statement_month,
--        sum(case when type = 'income' then -amount else amount end) as total
-- from transactions
-- where user_id = 'fazenda' and credit_card_id is not null
--   and type <> 'credit_card_payment'
-- group by 1, 2 order by 1, 2;
