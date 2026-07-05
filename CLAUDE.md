# Finance Manager — Guia do Projeto

Aplicação de gestão financeira pessoal (e de casal) para **Leonardo (`leo`)** e
**Murilo (`murilo`)**. Importa extratos/faturas de banco e cartão, classifica
transações, calcula fluxo de caixa, patrimônio e a divisão de despesas do casal.

> Este arquivo é a referência viva do projeto. Mantenha-o atualizado quando
> mudar o modelo de dados ou a lógica das telas.

---

## 1. Stack & comandos

- **Frontend:** React 18 + TypeScript + Vite 8, React Router 6, Tailwind 3, Recharts 2.
- **Backend:** Supabase (Postgres). Cliente em [`src/lib/supabase.ts`](src/lib/supabase.ts).
- **PDF parsing:** `pdfjs-dist` (faturas Inter em PDF).
- **Sem testes automatizados** no momento. **Sem backend próprio** — toda a lógica
  roda no cliente; o Supabase é só persistência (RLS hoje é `allow all`).

```bash
npm run dev       # vite dev server
npm run build     # tsc && vite build
npm run preview   # serve o build
```

Alias de import: `@/` → `src/` (ver `vite.config.ts` / `tsconfig.json`).

### Variáveis de ambiente (`.env`)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Credenciais detalhadas estão na memória do Claude (`project_supabase.md`).

---

## 2. Arquitetura em camadas

O princípio central (ver cabeçalhos dos engines): **nunca misturar as três camadas**.

1. **Fluxo de caixa** (`src/engine/`) — receita/despesa do mês. NÃO sabe de patrimônio.
2. **Performance / investimentos** (`src/investments/AssetEngine.ts`) — ganho/perda de ativos.
3. **Patrimônio** (`src/investments/NetWorthEngine.ts`) — foto da riqueza total.

Camadas transversais:
- **Import** (`src/import/`) — extrato/PDF → `NormalizedTransaction`.
- **Casal / splits** (`src/couple/`, `src/engine/SplitEngine.ts`) — divisão de despesas.
- **Insights** (`src/insights/`) — regras que geram alertas (motor pronto, **mas a
  Dashboard ainda usa `MOCK_INSIGHTS`** — ver §6).

Regra de ouro dos engines: **funções puras, nunca mutam as transações originais.**
Toda a UI lê o estado e os engines só calculam.

### Estrutura de pastas
```
src/
  app/
    App.tsx              # rotas, sidebar, seletor de mês/usuário, WelcomeScreen
    pages/               # uma página por rota (ver §5)
  engine/                # fluxo de caixa, categorias, splits, fatura cartão
  investments/           # ativos + patrimônio
  couple/                # análise de casal
  insights/              # motor de insights + regras
  import/                # pipeline + handlers por banco
  components/            # UI (charts/, transactions/, cards/, ui/, ...)
  lib/
    db/                  # acesso ao Supabase (uma função por operação)
    hooks/               # hooks React que ligam db + engines à UI
    UserContext.tsx      # usuário atual + mês selecionado (global)
    format.ts            # formatação de moeda/mês, monthRange, addMonths
supabase/schema.sql      # schema (ver §3 — atenção à lacuna)
```

---

## 3. Modelo de dados (Supabase)

Schema em [`supabase/schema.sql`](supabase/schema.sql). É seguro re-rodar (dropa e
recria tudo, com seeds). RLS habilitado mas com policy `allow all` (auth ainda não
implementada).

### Tabelas

| Tabela | Papel |
|---|---|
| `users` | `leo`, `murilo`. Campo `investment_target_pct` (meta de investimento, default 20%). |
| `sharing_rules` | % de divisão por usuário com `effective_from` (ex.: Leo 60 / Murilo 40). |
| `categories` | Globais (mesmas p/ conta e cartão). Hierárquicas via `parent_id`. `is_essential` marca custo de vida. IDs `cat-*` = despesa, `inc-*` = receita. |
| `accounts` | Contas bancárias. `balance` é o saldo estático/inicial. |
| `credit_cards` | Cartões. `invoice_total` / `invoice_paid` → status derivado (paid/partial/open). |
| `transactions` | Núcleo do sistema (ver campos abaixo). |
| `assets` | Ativos: `financial` ou `real`. `linked_account_id` evita dupla contagem; `is_shared` mostra em ambos os patrimônios. |
| `asset_movements` | Movimentos de ativo: `contribution` / `withdrawal` / `adjustment`. |
| `net_worth_snapshots` | Fotos mensais de patrimônio (legado/seed — hoje o timeline é reconstruído, ver §4). |

### Campos-chave de `transactions`
- **Datas:**
  - `date` — data real da transação (sempre exibida por linha).
  - `competency_month` (`YYYY-MM-01`) — mês de competência (conta/manual).
  - `statement_month` (`YYYY-MM-01`, só cartão) — mês da fatura.
  - **Mês efetivo** = `statement_month ?? competency_month` (ver [`effectiveMonth.ts`](src/engine/effectiveMonth.ts)).
    Isso faz a compra de cartão "cair" no mês da fatura, não no dia da compra.
- **Valores:** `amount` (absoluto ≥ 0) + `signed_amount` (+receita / −despesa) + `direction`.
- **`type`** (define se conta no fluxo de caixa — ver §4):
  `income`, `expense`, `transfer`, `credit_card_payment`, `credit_card_purchase`,
  `investment_contribution`, `investment_withdrawal`, `investment_adjustment`, `bill_payment`.
- **Classificação:** `category_id`, `context` (`personal`/`professional`),
  `scope` (`individual`/`shared`), `splits` (JSONB), `is_essential`, `fixed_type`.
- **Parcelas:** `installment_current` / `installment_total`.
- **Idempotência:** `unique(external_id, source)` — re-importar não duplica.

### `splits` (JSONB)
Array de `{ name, user_id?, pct }`. `user_id` `leo`/`murilo` = membro do casal;
ausente = terceiro (amigo, etc.). A soma dos `pct` deve dar 100.

### Investimentos (contas de corretora)
- **`accounts.is_investment`** marca contas de corretora (XP, Binance, Bitso, Avenue…);
  **`accounts.custodian`** agrupa contas sob a mesma corretora (ex.: XP investimentos +
  XP Conta caixa → ambos `'XP'`). Toggle na tela Contas & Cartões.
- **`account_balance_history`** (`account_id`, `month`, `balance`) — saldo mensal, agora **no
  `schema.sql`** (era lacuna). É a fonte do valor mês a mês das contas E dos investimentos.
- **`investment_year_performance`** — performance anual autoritativa por corretora (patrimônio
  inicial/final, movimentações, rendimento, rentabilidade %), semeada do PDF da XP (2018–2026),
  porque reconstruir ganho histórico de saldos lançados à mão é não-confiável.
- **`investment_flows`** — aporte/resgate líquido por conta e mês (BRL). Quando existe, o
  `PerformanceEngine` calcula rendimento **real** (`Δvalor − aporte`) em vez de estimativa. Semeado
  da Bitso e da Binance (CSVs oficiais; cripto/USD convertidos a BRL pela cotação da data). Só os
  anos **dentro da janela de dados** deixam de ser estimativa (ex.: Binance 2022–2025 real; 2019–2021
  e 2026 ainda estimados, marcados com `*`).
- **`investment_holdings`** — composição por ativo de uma corretora (o que tem DENTRO): snapshot do
  `PosicaoDetalhada.xlsx` da XP (fundos/ações/FIIs/renda fixa, com valor, custo, qtd, %, rentabilidade).
  Só visualização — NÃO entra no cálculo de patrimônio. `return_pct = (mkt − custo)/custo`.
- **Migrações** (idempotentes, rodar no SQL Editor), em ordem:
  [`20260703_investments.sql`](supabase/migrations/20260703_investments.sql),
  [`20260704_investment_flows_bitso.sql`](supabase/migrations/20260704_investment_flows_bitso.sql),
  [`20260705_investment_flows_binance.sql`](supabase/migrations/20260705_investment_flows_binance.sql),
  [`20260706_investment_holdings_xp.sql`](supabase/migrations/20260706_investment_holdings_xp.sql).

---

## 4. Engines — o que cada função faz

### `engine/CashFlowEngine.ts` — fluxo de caixa
Regra crítica: só alguns `type` contam, para **evitar dupla contagem**.
- Conta como **receita:** `income`. Conta como **despesa:** `expense`, `bill_payment`, `credit_card_purchase`.
- **Ignorado:** `transfer`, `credit_card_payment` (já contado via a compra), `investment_*`.

| Função | O que faz |
|---|---|
| `isCountableExpense` / `isCountableIncome` / `isExcludedFromCashFlow` | Guardas de tipo contra dupla contagem. |
| `applyFilters(txs, filter)` | Filtra por mês efetivo, contexto, escopo, categoria; exclui transfer/CC payment/investimentos por padrão. |
| `computeCashFlow(txs)` | Soma `income`, `expenses`, `balance` (+ informativos `investment_in/out`). |
| `computeCategoryBreakdown(txs)` | Despesa por categoria, ordenada desc, com % do total. Alimenta o gráfico de barras. |
| `computeCostOfLiving(txs)` | Soma só despesas essenciais (custo de vida). |
| `computeNonEssentialRatio(txs)` | % não-essencial / receita (usado por insight). |
| `computeInvestedAmount(txs)` | Soma `investment_contribution`. |
| `isXpInvestmentTransfer(tx)` | Detecta transferência p/ "Banco XP" (regex) → trata como investimento. |
| `computeMonthlyFinancialSeries(txs, months)` | Receita/despesa/investimento por mês. Investimento = contribuições/saques + transferências XP. Alimenta o gráfico mensal da Dashboard. |

### `engine/TransactionEngine.ts` — orquestrador
`listCompetencyMonths`, `buildMonthlyBreakdown`, views (`personalView`/`professionalView`/`sharedOnly`),
`computeCoupleBalance` (versão por `sharing_rules`), `validateTransaction` (valida antes de gravar),
`groupByMonth`, `computeRollingAverage` (média móvel 3 meses p/ insights). Re-exporta os helpers do CashFlowEngine.

### `engine/CategoryEngine.ts` — sugestão de categoria
`suggestCategory` (1. match exato no histórico → 2. regra por padrão → 3. match parcial visto ≥2×),
`batchSuggestCategories`, `countUncategorized`, `sortWithUncategorizedFirst` (sem categoria primeiro).
**Nunca cria categoria, só sugere.**

### `engine/SplitEngine.ts` — quem deve ao pagador
`computeSplitReport(txs, payerUserId)` → separa parcela do casal (Leo+Murilo) de terceiros;
calcula quanto cada um deve ao pagador. Usado na tela Patrimônio (`OwedSummary`).

### `engine/CardInvoiceEngine.ts` — série de faturas
`computeCardInvoiceSeries(txs, months)` → total da fatura por mês, separando parcelado de normal,
**e projetando parcelas futuras** ainda não importadas. Cuidado embutido: só projeta a partir da
parcela mais recente de cada série e só em meses **além** do último mês com dado real, para não
duplicar com faturas futuras já importadas (`projected: true` marca meses estimados).

### `couple/CoupleEngine.ts` — análise do casal
Só despesas `personal`, `shared`, contáveis E realmente divididas entre Leo e Murilo
(`isCoupleSplit` — split com terceiro não conta como casal).
- `validateSharingRules` — % por mês deve somar 100, sem usuário duplicado.
- `getSharedExpenses` / `getFixedExpenses` (fixas contam mesmo sem split).
- `computeCoupleReport` / `computeSettlement` — total dividido, pago vs esperado, quem deve a quem.
- `computeSharedCategoryBreakdown` — quem gastou mais em cada categoria.
- `computeCoupleMonthSummary` — resumo do mês usando os `pct` reais de cada split. `COUPLE_START_MONTH = '2026-04-01'`.

### `investments/AssetEngine.ts` — ativos
`validateMovement` (adjustment NÃO tem transação; contribution/withdrawal TÊM),
`computeAssetValue` (recalcula do histórico de movimentos), `computeAssetSummary`/`computePortfolio`
(net_invested, retorno absoluto e %), `cashFlowImpact` (adjustment = 0), `buildAssetTimeline`.
Regra 7.3: **investimento ≠ despesa** — contribuição reduz saldo mas não aparece como despesa no fluxo.

### `investments/NetWorthEngine.ts` — patrimônio
`net_worth = soma(contas) + soma(ativos)`. Ativos com `linked_account_id` são excluídos
(já estão no saldo da conta) para evitar dupla contagem.
- `computeNetWorth`, `buildNetWorthTimeline` (variação mês a mês + %), `latestNetWorth`,
  `netWorthForMonth(timeline, month)` (usa o mês selecionado, com fallback p/ o mais recente),
  `buildNetWorthBreakdown` (com % por ativo).

### `investments/PerformanceEngine.ts` — rendimento dos investimentos
Rendimento das contas `is_investment`, mês a mês / ano a ano. Puro, não muta.
- `groupInvestmentAccounts` (agrupa por `custodian`), `buildValueSeries` (valor mensal por
  corretora + total, **forward-fill** do último saldo lançado).
- `computeYearlyTable(seed, valueSeries, flowsByCustodian)` — 3 casos por corretora: (1) **seed
  autoritativo** (XP); (2) **rendimento real** `Δvalor − aporte` quando há `investment_flows`
  (Bitso); (3) **estimativa** pela variação de valor quando não há aporte (`estimated: true`, ex.:
  Binance). NÃO mistura seed + cálculo na mesma corretora. `consolidateYearly` soma por ano.
- `summarizeInvestments` — card da Dashboard: investido, rendimento no ano, variação no mês
  (esta **inclui aportes**). Hook: [`useInvestments`](src/lib/hooks/useInvestments.ts).
- **Pendente:** importar aportes de Binance (mesmos CSVs da Bitso) e composição por ticker da XP
  (`PosicaoDetalhada.xlsx`, Fase 3).

### `insights/InsightEngine.ts` — alertas
`generateInsights(ctx)` roda 8 regras (overspending, top_increases, spending_trend,
non_essential_ratio, investment_target, investment_capacity, couple_balance, micro_expenses),
deduplica, ordena por severidade (critical > warning > info) e retorna **no máx. 5**.
Regras que falham são ignoradas silenciosamente (nunca quebram a UI). Regras em `insights/rules/`.

---

## 5. Páginas (rotas)

Rotas em [`App.tsx`](src/app/App.tsx). Usuário e **mês selecionado** vêm do `UserContext`
(sidebar tem o seletor de competência). `WelcomeScreen` escolhe leo/murilo antes de entrar.

### Dashboard — [`pages/Dashboard.tsx`](src/app/pages/Dashboard.tsx) (`/`)
"Estou melhor ou pior?" em 5 segundos. Blocos:
0. **Sem categoria:** [`UncategorizedWidget`](src/components/dashboard/UncategorizedWidget.tsx) — mostra
   quantas transações do mês estão sem categoria. Expande em conta/cartão (com contagem por fonte);
   clicar numa fonte abre `/transacoes?uncat=1&cardId=…|accountId=…` (Transações já filtrado por
   aquela conta/cartão + "sem categoria"); "Ver todas" abre `/transacoes?uncat=1`. Quando não há
   pendências, exibe "✓ Tudo classificado". A página de Transações lê esses query params (via
   `useSearchParams`), aplica o filtro específico com um chip removível e limpa a URL.
1. **Resumo:** Patrimônio total (de `netWorthForMonth`) + variação; cards de Receita e
   Despesa (de `computeCashFlow`). Receita/Despesa são clicáveis → modal com as transações.
2. **Evolução do patrimônio:** `NetWorthChart` sobre o `timeline` do `useNetWorth`.
3. **Investimentos, despesas e receita por mês:** `MonthlyFlowChart` de
   `computeMonthlyFinancialSeries`, desde `FLOW_START_MONTH = '2026-04-01'`. Esconde meses
   finais ainda zerados. Transferência p/ Banco XP conta como investimento.
4. **Rendimento dos investimentos:** [`InvestmentsPanel`](src/components/investments/InvestmentsPanel.tsx)
   de `useInvestments` — cards (investido / rendimento no ano / variação no mês) + gráfico de
   valor investido. Só aparece se houver conta `is_investment`.
5. **Gastos por categoria:** `CategoryBars` de `computeCategoryBreakdown` (clica → drill-down).
6. **Insights:** ⚠️ **ainda usa `MOCK_INSIGHTS`** de `src/lib/mock.ts`, não o `InsightEngine`.
   Trocar para `generateInsights` é uma melhoria pendente.

### Transações — [`pages/Transactions.tsx`](src/app/pages/Transactions.tsx) (`/transacoes`)
Upload → classificação → revisão. Sem categoria primeiro, edição inline, filtros por
contexto/escopo, agrupamento de fatura de cartão, import por drag-and-drop, add manual.

### Contas & Cartões — [`pages/AccountsCards.tsx`](src/app/pages/AccountsCards.tsx) (`/contas`)
Saldos de contas (via `enrichAccounts` — último saldo lançado até o mês) e cartões com
status de fatura. Gráfico de histórico de fatura por cartão (`CardInvoiceChart`),
desde `INVOICE_START_MONTH = '2026-04-01'`. CRUD de contas e cartões. Cada conta tem um
**toggle "Investimento"** (`updateAccountInvestment`) que a marca como corretora.

### Patrimônio — [`pages/NetWorth.tsx`](src/app/pages/NetWorth.tsx) (`/patrimonio`)
Riqueza real: contas + investimentos + ativos, cada um com valor e variação.
`NetWorthChart` + `IncomeEvolutionChart` (renda desde 2026-04). Tabela de rendimento **ano a
ano** por corretora + consolidado ([`YearPerformanceTable`](src/components/investments/YearPerformanceTable.tsx))
e **composição por ativo** da corretora ([`HoldingsCard`](src/components/investments/HoldingsCard.tsx),
de `investment_holdings`). Seção de casal via `computeSplitReport` (`OwedSummary`). CRUD de ativos.

### Casal — [`pages/Casal.tsx`](src/app/pages/Casal.tsx) (`/casal`)
Análise mensal de despesas compartilhadas: total + barras por categoria (drill-down),
gastos fixos do mês, gráfico dia a dia, e histórico mês a mês de quanto cada um pagou +
acerto (quem deve quanto). Só `context === 'personal'` entra (profissional é excluído).

### Checklist — [`pages/MonthlyChecklist.tsx`](src/app/pages/MonthlyChecklist.tsx) (`/checklist`)
Status mensal de tarefas (ex.: lançar saldo das contas via `BalanceEntryModal` →
`account_balance_history`). Últimos 6 meses.

---

## 6. Import — handlers por banco

Pipeline em [`src/import/ImportPipeline.ts`](src/import/ImportPipeline.ts): resolve handler
(por nome de arquivo + headers) → parse → normalize → dedup por `external_id`. **Pipeline puro,
não grava no banco** (o caller faz upsert via Supabase, idempotente por `external_id`).
Para **PDF**, o `HandlerRegistry` passa as **linhas do texto extraído** ao `identify` (o nome do
arquivo costuma não ter dica do banco), então handlers de PDF podem se identificar por conteúdo.

Handlers em `src/import/handlers/` (cada um implementa `identify`/`parse`/`normalize`):
- `NubankAccountHandler` — extrato de conta Nubank (CSV). Detecta pagamento de fatura de cartão
  (`credit_card_payment`) por palavra-chave ("fatura"/"boleto") **e** por Pix/TED para o **CNPJ
  institucional** do banco emissor (C6/Nu/Inter — não pelo nome, pra não confundir com Pix pra uma
  pessoa que só é cliente do banco). O [`ImportModal`](src/components/import/ImportModal.tsx)
  mostra um toggle "💳 Pagamento de fatura" + seletor de cartão nessas linhas — o usuário pode
  desmarcar se a detecção errar, e a transação volta a ser classificada normalmente (categoria/
  split). O cartão escolhido vai só para `notes` (nunca para `credit_card_id`, que significaria
  "item da fatura" e misturaria o pagamento com as compras no agrupamento por cartão).
- `NubankCreditHandler` — fatura de cartão Nubank (CSV)
- `C6CreditHandler` — fatura C6 (CSV, com parcelas)
- `C6CreditPDFHandler` — fatura C6 (PDF **protegido por senha**). Identifica por conteúdo
  ("C6 Carbon"/"Banco C6"), lê linhas nacional/internacional (valor colado a `USD…`)/IOF (`…IOF`),
  parcelas, estorno=crédito, pula "Pagamento Fatura", infere o ano pela data de fechamento,
  auto-detecta o mês da fatura (`Vencimento`) e valida a soma vs "Total a pagar". O
  [`ImportModal`](src/components/import/ImportModal.tsx) pede a **senha** quando o PDF é
  protegido (`extractPDFText(buf, password)`; `isPasswordError` detecta a `PasswordException`).
- `InterCreditPDFHandler` — fatura Inter (PDF, via pdfjs)
- `MuriloTransacoesHandler` — planilha de transações do Murilo

**Extrato de saldo Nubank (não é um handler de transações):** [`nubankStatementBalance.ts`](src/import/utils/nubankStatementBalance.ts)
reconhece o PDF do extrato de conta Nubank (`NU_<id>_<DDMMMYYYY>_<DDMMMYYYY>.pdf`) e extrai só o
**"Saldo final do período"** — esse arquivo não tem transações pra revisar, então o `ImportModal`
desvia pra um mini-fluxo próprio (`step === 'balance'`) que atualiza `account_balance_history`
direto (`upsertAccountBalance`), com conta/mês pré-selecionados e editáveis. Note: a label "Saldo
final do período" aparece 2x no texto extraído (pdfjs agrupa por linha) — o regex casa a 2ª
ocorrência (label + número direto, sem "R$"), que é a inequívoca.

---

## 7. Convenções & pegadinhas

- **Mês sempre `YYYY-MM-01`** (primeiro dia). Helpers em `src/lib/format.ts` (`monthRange`, `addMonths`, `formatMonth`).
- **Use o "mês efetivo"** (`effectiveMonth`) para agregações mensais, não `competency_month` cru —
  senão compras de cartão caem no mês errado.
- **Várias datas de corte fixas em `'2026-04-01'`** espalhadas pelo código (`FLOW_START_MONTH`,
  `COUPLE_START_MONTH`, `INVOICE_START_MONTH`, income chart). É quando o casal começou a usar o sistema.
- **`amount` é sempre ≥ 0**; o sinal vai em `signed_amount`/`direction`.
- **Engines não mutam transações** — se precisar transformar, copie.
- **Saldo da conta** vem de `enrichAccounts` (último lançamento manual até o mês), NÃO do campo
  estático `accounts.balance` (esse é só fallback inicial). Patrimônio na Dashboard, Patrimônio e
  Contas usam a mesma regra de propósito, para baterem.
- **Bug histórico resolvido** (commit `dd7b817`): dupla contagem de fatura quando meses futuros já
  tinham dado real importado — ver lógica de `projected`/`lastRealMonth` no `CardInvoiceEngine`.

---

## 8. Melhorias pendentes / dívidas

- Dashboard usar `generateInsights` real em vez de `MOCK_INSIGHTS`.
- **Investimentos:** Bitso e Binance (2022–2025) já têm aportes reais (seed dos CSVs); **falta**
  completar Binance 2019–2021 e 2026 (exportar esses períodos). Os seeds hoje são **offline**
  (parse por script → SQL); um **importador in-app reusável** (drag do CSV/xlsx) é melhoria futura
  (o de xlsx precisaria da dep `xlsx`). Composição por ticker é só da XP (snapshot manual).
- `account_balance_history` já está no `schema.sql` (resolvido). Dashboard usar `generateInsights`
  real em vez de `MOCK_INSIGHTS`. Auth real + RLS por usuário (hoje `allow all`). Sem testes.
</content>
</invoke>
