# Banco de Dados — Finance Manager

> Referência completa do banco (Supabase / Postgres) para **entender e consultar
> ("search")** os dados do projeto. Escrito para uma AI (ou pessoa) que precise
> saber *o que existe*, *onde mora cada informação* e *como as tabelas se ligam*.
>
> Fonte da verdade do schema: [`supabase/schema.sql`](supabase/schema.sql) +
> migrações em [`supabase/migrations/`](supabase/migrations/).
> Camada de acesso (queries reais): [`src/lib/db/`](src/lib/db/).
> Regras de negócio: [`CLAUDE.md`](CLAUDE.md) §4 (engines).

---

## 0. Visão em 30 segundos

- **Backend = só Supabase (Postgres).** Não há API própria — toda a lógica roda no
  cliente React. O banco é **persistência pura**.
- **RLS habilitado, policy `allow all`** em todas as tabelas (auth ainda não
  implementada). Qualquer chave `anon` lê/escreve tudo.
- **Dois usuários fixos:** `leo` (Leonardo) e `murilo`. IDs são `text`, não UUID.
- **Coração do sistema = tabela `transactions`.** Quase tudo gira em torno dela.
- **Unidade de tempo = mês no formato `YYYY-MM-01`** (sempre dia 1). Datas de
  transação individuais são `YYYY-MM-DD`.
- **Dinheiro:** `amount` é sempre ≥ 0; o sinal fica em `signed_amount`
  (+receita / −despesa) e em `direction`.

---

## 1. Mapa das tabelas

| Tabela | Papel | Cardinalidade / chave |
|---|---|---|
| `users` | Os 2 membros do casal. | PK `id` text (`leo`/`murilo`) |
| `sharing_rules` | % de divisão de despesa por usuário, com vigência. | 1 linha por usuário+`effective_from` |
| `categories` | Categorias globais, hierárquicas (`parent_id`). | PK `id` text (`cat-*` despesa, `inc-*` receita) |
| `accounts` | Contas bancárias **e** contas de corretora (`is_investment`). | PK `id` text/UUID |
| `credit_cards` | Cartões de crédito. | PK `id` text |
| **`transactions`** | **Núcleo:** toda movimentação financeira. | PK `id`; único `(external_id, source)` |
| `assets` | Ativos (financeiros/reais) para patrimônio. | PK `id` |
| `asset_movements` | Aportes/saques/ajustes de cada ativo. | FK → `assets`, `transactions` |
| `net_worth_snapshots` | Fotos mensais de patrimônio (legado/seed). | único por `month` |
| `account_balance_history` | **Saldo mensal por conta** (fonte real do saldo). | único `(account_id, month)` |
| `investment_year_performance` | Rendimento **ano a ano** por corretora (autoritativo). | único `(user_id, custodian, year)` |
| `investment_flows` | Aporte/resgate líquido por conta e mês (BRL). | único `(account_id, month, source)` |
| `investment_holdings` | Composição por ativo dentro de uma corretora (snapshot). | único `(user_id, custodian, snapshot_date, name)` |

### Diagrama de relacionamentos (texto)

```
users (leo, murilo)
  ├─< sharing_rules            (user_id)
  ├─< accounts                 (user_id)
  │     ├─< account_balance_history   (account_id)      ← saldo mês a mês
  │     ├─< investment_flows          (account_id)      ← aportes/resgates
  │     └─< transactions              (account_id / to_account_id)
  ├─< credit_cards             (user_id)
  │     └─< transactions              (credit_card_id)
  ├─< transactions             (user_id)  ── category_id ─> categories (self-join parent_id)
  ├─< assets                   (user_id)  ── linked_account_id ─> accounts
  │     └─< asset_movements           (asset_id, transaction_id)
  ├─< investment_year_performance   (user_id, custodian)
  └─< investment_holdings           (user_id, custodian)

categories ──parent_id──> categories        (hierarquia própria)
net_worth_snapshots                          (sem FK; legado por mês)
```

**Agrupamento de corretora:** `investment_year_performance`, `investment_flows` e
`investment_holdings` se ligam às contas **por `custodian`** (texto: `'XP'`,
`'Binance'`, `'Bitso'`…), não por FK direta. Uma corretora pode ter várias
`accounts` com o mesmo `custodian`.

---

## 2. Tabela por tabela

### `users`
| Campo | Tipo | Nota |
|---|---|---|
| `id` | text PK | `leo`, `murilo`. Usado como FK em quase tudo. |
| `name` | text | "Leonardo", "Murilo". |
| `investment_target_pct` | numeric | Meta de investimento (default 20%). Usado por insight. |

### `sharing_rules`
Percentual de divisão de despesas do casal, versionado por data.
| Campo | Nota |
|---|---|
| `user_id` | FK → users |
| `percentage` | ex.: Leo 60 / Murilo 40. Soma dos ativos deve dar 100. |
| `effective_from` | vigência; regra ativa = maior `effective_from` ≤ mês. |

### `categories`
Categorias **globais** (mesmas para conta e cartão), **hierárquicas** via `parent_id`.
- **Convenção de ID = tipo:** `cat-*` = despesa, `inc-*` = receita. Isso é lógica de
  negócio: [`isIncomeCategory`](src/lib/db/categories.ts) só olha o prefixo `inc-`.
- `is_essential` marca **custo de vida** (usado no cálculo de essenciais).
- Subcategoria referencia o pai por `parent_id` (self-join). Ex.: `cat-rest`
  (Restaurantes) → pai `cat-alim` (Alimentação).
- **Nunca criadas em runtime** pelo app — só semeadas no `schema.sql`. O engine só
  *sugere* categoria, não cria.

### `accounts`
Contas bancárias comuns **e** contas de corretora.
| Campo | Nota |
|---|---|
| `balance` | Saldo **estático/inicial** — só fallback. O saldo real vem de `account_balance_history` (ver §3). |
| `is_investment` | `true` = conta de corretora (XP, Binance, Bitso, Avenue…). |
| `custodian` | Agrupa contas sob a mesma corretora (ex.: XP investimentos + XP caixa → ambos `'XP'`). NULL → conta isolada. |

### `credit_cards`
| Campo | Nota |
|---|---|
| `invoice_total` / `invoice_paid` | Campos estáticos. **Na prática o total é recalculado das transações** do `statement_month` (ver [`fetchCards`](src/lib/db/accounts.ts)). |
| status derivado | `paid` (pago ≥ total), `partial` (pago > 0), `open`. Não é coluna — calculado na leitura. |

### `transactions` — o núcleo

**Chaves e relacionamentos:**
| Campo | Nota |
|---|---|
| `user_id` | FK → users |
| `account_id` | conta de origem (extrato/manual) |
| `credit_card_id` | cartão (item de fatura). **Só para compras de cartão** — pagamento de fatura NÃO usa esse campo. |
| `to_account_id` | conta destino (transferências) |
| `category_id` | FK → categories |
| `external_id` + `source` | **chave de idempotência** — `unique(external_id, source)`. Re-importar não duplica. |

**Datas (crítico — ver [`effectiveMonth.ts`](src/engine/effectiveMonth.ts)):**
| Campo | Significado |
|---|---|
| `date` | data real da transação (`YYYY-MM-DD`), sempre exibida por linha. |
| `competency_month` | mês de competência (`YYYY-MM-01`) — conta/manual. |
| `statement_month` | mês da fatura (`YYYY-MM-01`) — **só cartão**, NULL fora dele. |
| **mês efetivo** | `statement_month ?? competency_month`. Faz a compra de cartão "cair" no mês da fatura, não no dia da compra. **Use isto para agregar por mês.** |

**Valores:**
- `amount` (numeric ≥ 0), `signed_amount` (+/−), `direction` (`income`/`expense`).

**`type`** (define se conta no fluxo de caixa — ver §4):
`income`, `expense`, `transfer`, `credit_card_payment`, `credit_card_purchase`,
`investment_contribution`, `investment_withdrawal`, `investment_adjustment`, `bill_payment`.

**Classificação:**
- `context`: `personal` | `professional`
- `scope`: `individual` | `shared` (derivado: `shared` sse tem `splits` com >1 pessoa)
- `splits` (JSONB): array `{ name, user_id?, pct }`. `user_id` `leo`/`murilo` = membro do
  casal; ausente = terceiro. Soma dos `pct` = 100.
- `is_essential`, `fixed_type` (`fixed`/`variable`/`occasional`)

**Parcelas:** `installment_current` / `installment_total`.

**Índices:** `competency_month`, `user_id`, `category_id`.

### `assets` + `asset_movements`
- `assets.type`: `financial` | `real`.
- `linked_account_id`: se preenchido, o valor do ativo **já está** no saldo da conta →
  ativo aparece na lista mas **NÃO soma no patrimônio** (evita dupla contagem).
- `is_shared`: ativo do casal → aparece no Patrimônio dos dois.
- `asset_movements.type`: `contribution` / `withdrawal` / `adjustment`. `adjustment`
  **não tem** transação vinculada; os outros dois têm (`transaction_id`).

### `net_worth_snapshots`
Fotos mensais de patrimônio. **Legado/seed** — hoje o timeline é reconstruído on-the-fly
a partir de contas + ativos (ver `NetWorthEngine`). Serve de referência histórica.

### `account_balance_history` — saldo real mês a mês
- `(account_id, month, balance)`, único por `(account_id, month)`.
- **Fonte da verdade do saldo** de contas E investimentos, lançado à mão pelo
  Checklist (`BalanceEntryModal`) ou pelo import de extrato de saldo Nubank.
- Regras de leitura (ver [`networth.ts`](src/lib/db/networth.ts)):
  - `computeLatestAccountBalances(rows, upToMonth)` → último saldo lançado **até** o mês.
  - `isAccountActive` → conta "ativa" se: sem histórico (nova), ou último saldo > 0 e
    recente (≤ 12 meses do mês em vista).
  - `enrichAccounts` → junta saldo real + filtra inativas + ordena desc.

### `investment_year_performance` — rendimento anual autoritativo
Espelha o relatório da corretora (ex.: PDF "Evolução patrimonial" da XP). Mantido como
**seed explícito** porque reconstruir ganho histórico de saldos lançados à mão é não-confiável.
- `rendimento = patrimonio_final − patrimonio_inicial − movimentacoes`.
- `movimentacoes`: +aporte / −resgate.
- `source`: `xp_pdf` (semeado) | `computed` | `manual`.
- Seed atual: XP 2018–2026 (verbatim do PDF).

### `investment_flows` — aportes/resgates mensais
- `net_deposit` em BRL (+aporte / −resgate), por conta e mês.
- Quando existe, o `PerformanceEngine` calcula **rendimento real**
  (`Δvalor − aporte`) em vez de estimativa.
- `source`: `import` | `transfer` | `manual`.
- Seed: **Bitso** e **Binance** (2022–2025), calculado dos CSVs oficiais (cripto/USD →
  BRL pela cotação da data). Fora da janela de dados o rendimento fica estimado (marcado `*`).

### `investment_holdings` — composição por ativo (o que tem DENTRO)
- Snapshot do `PosicaoDetalhada.xlsx` da XP (fundos/ações/FIIs/renda fixa).
- **Só visualização** — NÃO entra no cálculo de patrimônio (o valor já está no saldo).
- `asset_class`: `fundo` | `acao` | `fii` | `renda_fixa`.
- `return_pct = (market_value − cost_basis) / cost_basis * 100`.
- Leitura ([`fetchHoldings`](src/lib/db/investments.ts)) mantém só o **snapshot mais
  recente por corretora**.

---

## 3. Onde mora cada informação (guia de "search")

Pergunta → onde procurar:

| Quero saber… | Tabela / campo | Detalhe |
|---|---|---|
| Receita/despesa de um mês | `transactions` filtrado por **mês efetivo** | `statement_month ?? competency_month`. Só alguns `type` contam (ver §4). |
| Saldo atual de uma conta | `account_balance_history` (último ≤ mês), fallback `accounts.balance` | **Não** use `accounts.balance` direto. |
| Total da fatura de um cartão | soma de `transactions` com `credit_card_id` + `statement_month` | despesa soma, receita (estorno) subtrai. |
| Pagamento de fatura | `transactions.type = 'credit_card_payment'` | cartão pago fica em `notes`, **nunca** em `credit_card_id`. |
| Quem deve a quem (casal) | `transactions.splits` (JSONB) + `sharing_rules` | só `context='personal'`, contáveis e divididas Leo+Murilo. |
| Patrimônio | `account_balance_history` + `assets` | net_worth = contas + ativos (exclui `linked_account_id`). |
| Rendimento de investimento (ano) | `investment_year_performance` | autoritativo; XP semeado. |
| Aportes/resgates (mês) | `investment_flows` | usado p/ separar rendimento real de dinheiro novo. |
| Composição da carteira XP | `investment_holdings` | só visualização. |
| Categoria de uma transação | `transactions.category_id` → `categories` | receita = prefixo `inc-`, despesa = `cat-`. |
| Transações sem categoria | `transactions` where `category_id is null` | Dashboard `UncategorizedWidget`. |

---

## 4. Regra de ouro: `type` e dupla contagem (Fluxo de Caixa)

Só alguns `type` entram no fluxo de caixa, para **evitar dupla contagem** (ver
[`CashFlowEngine.ts`](src/engine/CashFlowEngine.ts)):

- **Conta como receita:** `income`.
- **Conta como despesa:** `expense`, `bill_payment`, `credit_card_purchase`.
- **Ignorado no fluxo:** `transfer`, `credit_card_payment` (já contado via a compra),
  `investment_contribution` / `investment_withdrawal` / `investment_adjustment`.

Por quê: a **compra** de cartão (`credit_card_purchase`) já é a despesa; o **pagamento**
da fatura (`credit_card_payment`) é só liquidação — contar os dois dobraria. Idem
transferências e movimentos de investimento (patrimônio ≠ fluxo).

---

## 5. Camada de acesso ([`src/lib/db/`](src/lib/db/))

Uma função por operação; **cada função é a interface real com o banco** (o app nunca
faz SQL cru, só via cliente Supabase). Onde procurar cada query:

| Arquivo | Funções-chave |
|---|---|
| [`transactions.ts`](src/lib/db/transactions.ts) | `fetchTransactionsByMonth` (por mês efetivo via `.or(effectiveMonthOr)`), `fetchTransactionsSince`, `fetchTransactionsByCard`, `createManualTransaction`, `bulkUpdateTransactions`, `updateTransaction`, `deleteTransaction`. Join de categoria + pai: `categories:category_id(id,name,parent:parent_id(id,name))`. |
| [`accounts.ts`](src/lib/db/accounts.ts) | `fetchAccounts`, `fetchCards` (recalcula total da fatura das transações), `createAccount`/`deleteAccount`, `createCard`/`deleteCard`, `updateAccountInvestment` (toggle corretora). |
| [`networth.ts`](src/lib/db/networth.ts) | `fetchAccountBalanceHistory`, `computeLatestAccountBalances`, `isAccountActive`, `enrichAccounts`, `fetchEnrichedAccounts`, `upsertAccountBalance`, `fetchAssets`, `createAsset`, `updateAssetValue`. |
| [`investments.ts`](src/lib/db/investments.ts) | `fetchYearPerformance`, `fetchInvestmentFlows`, `fetchHoldings`. **Todas degradam para `[]` se a tabela não existir** (migração não rodada). |
| [`monthlyStatus.ts`](src/lib/db/monthlyStatus.ts) | `fetchMonthlyStatus` — Checklist: por mês diz se tem cartão / conta / balanço lançado (balanço = toda conta ativa com saldo **naquele mês exato**). |
| [`categories.ts`](src/lib/db/categories.ts) | `fetchCategories`, `isIncomeCategory`, `filterCategories`. |
| [`import.ts`](src/lib/db/import.ts) | `upsertTransactions` — upsert idempotente `onConflict: 'external_id,source'`, em lotes de 100. |

**Padrões importantes de query:**
- **Mês efetivo** (para não errar compras de cartão):
  ```
  .or("and(statement_month.is.null,competency_month.eq.<mês>),statement_month.eq.<mês>")
  ```
- **Idempotência do import:** `upsert(..., { onConflict: 'external_id,source', ignoreDuplicates: true })`.
- **Resiliência das tabelas de investimento:** leituras retornam `[]` em erro, então o app
  funciona mesmo antes de rodar as migrações.

---

## 6. Migrações (rodar no SQL Editor, em ordem, idempotentes)

1. [`20260703_investments.sql`](supabase/migrations/20260703_investments.sql) — colunas
   `is_investment`/`custodian`, tabelas `account_balance_history` e
   `investment_year_performance`, seed anual da XP (2018–2026).
2. [`20260704_investment_flows_bitso.sql`](supabase/migrations/20260704_investment_flows_bitso.sql)
   — tabela `investment_flows` + seed Bitso.
3. [`20260705_investment_flows_binance.sql`](supabase/migrations/20260705_investment_flows_binance.sql)
   — seed Binance (2022–2025).
4. [`20260706_investment_holdings_xp.sql`](supabase/migrations/20260706_investment_holdings_xp.sql)
   — tabela `investment_holdings` + snapshot XP (03/07/2026).

O [`schema.sql`](supabase/schema.sql) já incorpora tudo (é seguro re-rodar; **dropa e
recria com seeds**). Rode-o só num banco descartável — ele apaga os dados.

---

## 7. Pegadinhas / invariantes (não quebre)

- **Mês sempre `YYYY-MM-01`.** Helpers em [`src/lib/format.ts`](src/lib/format.ts).
- **Agregue por mês efetivo**, não por `competency_month` cru.
- **`amount ≥ 0`;** sinal em `signed_amount`/`direction`.
- **Saldo real** vem de `account_balance_history` via `enrichAccounts`, **não** de
  `accounts.balance`.
- **`credit_card_id` = item de fatura.** Pagamento de fatura nunca preenche esse campo
  (iria misturar pagamento com as compras no agrupamento por cartão).
- **Corretora se liga por `custodian` (texto)**, não por FK — cuidado ao juntar
  `investment_*` com `accounts`.
- **`investment_holdings` e ativos com `linked_account_id` NÃO entram no patrimônio**
  (já contados no saldo da conta).
- **RLS é `allow all`** — não há isolamento por usuário no banco; o filtro por `user_id`
  é feito na query do app.
- **Datas de corte fixas em `'2026-04-01'`** (início do uso do sistema pelo casal):
  `FLOW_START_MONTH`, `COUPLE_START_MONTH`, `INVOICE_START_MONTH`.
</content>
</invoke>
