# Importação revisada por agente

O CLI mantém dry-run como padrão. Para um subconjunto revisado, não recorte o CSV (isso pode mudar IDs de cobranças repetidas) e não crie scripts de escrita avulsos.

1. Com arquivo original disponível e pessoa/conta/cartão/mês definidos, exporte a revisão para diretório privado fora do repositório:

   `npm run import:file -- --file /caminho/original.csv --user leo --month 2026-10-01 --export-review /diretorio/privado/revisao.json --json`

2. O JSON começa com todas as `entries[].approved=false`. Marque `true` somente nas identidades `source + external_id` aprovadas pelo usuário. Preencha `changes` explicitamente com `category_id`, `context`, `scope`, `splits`. Categorias precisam existir; sugestão histórica não é aprovação. Não altere `version`, `user`, `file_sha256`, `batch_sha256` nem identidades para contornar divergências. `preview` é informativo; a transação é reconstruída do original.
3. Para `scope=individual`, `splits=null`. Para `shared`, forneça ao menos dois participantes distintos `{name, user_id?, pct}` com percentuais positivos somando 100. Não inferir percentuais não aprovados.
4. Rode a prévia com o arquivo original, os mesmos argumentos e `--review /diretorio/privado/revisao.json --json`. O total considera apenas aprovadas; `pendingOutsideReview` fica fora da gravação. Confira classificações completas no manifesto e novas/existentes/avisos na prévia.
5. Com confirmação explícita válida para esse lote, execute o mesmo comando com `--commit --confirm`. No grupo financeiro autorizado, confirmação no próprio grupo é válida; não exija Telegram ou confirmação repetida de lote já autorizado e inalterado.
6. Confirme sucesso somente com `writeResult.errors=[]` e `writeResult.verified` igual ao número de aprovadas. Recibos privados antes/depois ficam em `../data/import-receipts/`, fora do repo. O CLI relê todas as linhas para verificar os campos enviados.

Arquivo original, pessoa e dados normalizados (incluindo conta/cartão/mês) são vinculados por hash. Mudanças exigem nova revisão. O manifesto permite somente categoria/contexto/escopo/splits; mudanças de valor/tipo/vínculo não são aceitas nesta opção.

Existentes não são sobrescritas: iguais são ignoradas idempotentemente; divergentes interrompem antes da escrita. Em erro parcial ou resultado incerto, inspecione recibos e releia o banco; não confirme tudo nem dispare repetidamente o comando. Mantenha não aprovadas no manifesto para retomar depois e persista o status do lote para evitar replay acidental. JSONs financeiros e recibos nunca entram no Git.

Testes sem escrita financeira: `npx --yes tsx --test scripts/import-review.test.ts`.
