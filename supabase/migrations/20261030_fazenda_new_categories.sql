-- Fazenda: novas categorias + "Ressarcimento FGC" vira receita.
-- O app decide receita × despesa pelo prefixo do id (isIncomeCategory: 'inc-'),
-- e "Ressarcimento FGC" tinha sido criada como despesa (faz-cat-…).
-- Idempotente: pode rodar de novo.

insert into categories (id, name, parent_id, is_essential, user_id) values
  ('faz-cat-compra-de-equipamento', 'Compra de Equipamento', null, false, 'fazenda'),
  ('faz-cat-causas-trabalhistas',   'Causas Trabalhistas',   null, false, 'fazenda'),
  ('faz-cat-manutencao-fazenda',    'Manutenção Fazenda',    null, false, 'fazenda'),
  ('faz-cat-educacao',              'Educação',              null, false, 'fazenda'),
  ('inc-faz-ressarcimento-fgc',     'Ressarcimento FGC',     null, false, 'fazenda')
on conflict (id) do nothing;

update transactions
   set category_id = 'inc-faz-ressarcimento-fgc'
 where category_id = 'faz-cat-ressarcimento-fgc';

delete from categories where id = 'faz-cat-ressarcimento-fgc';
