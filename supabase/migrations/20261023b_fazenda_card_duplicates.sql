-- Fazenda: remove as 2 faturas que a planilha tinha em dobro.
--
-- * Visa, vencimento set/2025: 60 compras lançadas 2× na aba CARTÃO (rótulos
--   25/08/2025 e 01/09/2025). Removemos a cópia com rótulo 25/08/2025.
--   Fatura set/2025: R$ 94.549,50 → R$ 47.274,75.
-- * Black, vencimento jan/2025: 51 linhas lançadas 2× (rótulos 25/01/2025 e
--   24/12/2025, ano digitado errado). Removemos a cópia com rótulo 24/12/2025.
--   Fatura jan/2025: −R$ 9.920,26 → −R$ 4.960,13.
--
-- Cada linha removida tem um par idêntico (data, descrição, valor, tipo,
-- parcela) na fatura mantida. external_id = 'cartao-<linha da planilha>'.
-- O parser (SKIP_CARTAO_ROWS) também pula essas linhas, então o seed 20260708
-- não as recria. Para desfazer: rodar a versão do seed 20260708 do commit 4bb5ca1.
--
-- Idempotente: 1ª execução = 111 linhas; de novo = 0.

with deleted as (
  delete from transactions
  where user_id = 'fazenda'
    and source = 'fazenda_xlsx_cartao'
    and external_id in (
      -- Visa, rótulo 25/08/2025 (60 linhas)
    'cartao-965', 'cartao-966', 'cartao-967', 'cartao-968', 'cartao-969', 'cartao-970', 'cartao-971', 'cartao-972',
    'cartao-973', 'cartao-974', 'cartao-975', 'cartao-976', 'cartao-977', 'cartao-978', 'cartao-979', 'cartao-980',
    'cartao-981', 'cartao-982', 'cartao-983', 'cartao-984', 'cartao-985', 'cartao-986', 'cartao-987', 'cartao-988',
    'cartao-989', 'cartao-990', 'cartao-991', 'cartao-992', 'cartao-993', 'cartao-994', 'cartao-995', 'cartao-996',
    'cartao-997', 'cartao-998', 'cartao-999', 'cartao-1000', 'cartao-1001', 'cartao-1002', 'cartao-1003', 'cartao-1004',
    'cartao-1005', 'cartao-1006', 'cartao-1007', 'cartao-1008', 'cartao-1009', 'cartao-1010', 'cartao-1011', 'cartao-1012',
    'cartao-1013', 'cartao-1014', 'cartao-1015', 'cartao-1016', 'cartao-1017', 'cartao-1018', 'cartao-1019', 'cartao-1020',
    'cartao-1021', 'cartao-1022', 'cartao-1023', 'cartao-1024',
      -- Black, rótulo 24/12/2025 (51 linhas)
    'cartao-427', 'cartao-429', 'cartao-431', 'cartao-433', 'cartao-435', 'cartao-437', 'cartao-439', 'cartao-441',
    'cartao-443', 'cartao-445', 'cartao-447', 'cartao-449', 'cartao-451', 'cartao-453', 'cartao-455', 'cartao-457',
    'cartao-459', 'cartao-461', 'cartao-463', 'cartao-465', 'cartao-467', 'cartao-469', 'cartao-471', 'cartao-473',
    'cartao-475', 'cartao-477', 'cartao-479', 'cartao-480', 'cartao-481', 'cartao-482', 'cartao-483', 'cartao-484',
    'cartao-485', 'cartao-486', 'cartao-487', 'cartao-488', 'cartao-489', 'cartao-490', 'cartao-491', 'cartao-492',
    'cartao-493', 'cartao-494', 'cartao-495', 'cartao-496', 'cartao-497', 'cartao-498', 'cartao-499', 'cartao-500',
    'cartao-501', 'cartao-502', 'cartao-503'
    )
  returning id
)
select count(*) as linhas_removidas from deleted;
