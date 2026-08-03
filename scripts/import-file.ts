import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { resolveHandler, isCardHandler, isMuriloHandler } from '../src/import/HandlerRegistry'
import { runImportPipeline } from '../src/import/ImportPipeline'
import type { HandlerContext, NormalizedTransaction } from '../src/import/types'

type UserId = 'leo' | 'murilo'

interface CliArgs {
  file?: string
  user?: UserId
  month?: string
  accountId?: string
  cardId?: string
  interCardId?: string
  rdbAccountId?: string
  password?: string
  commit: boolean
  confirm: boolean
  allowGuessedMonth: boolean
  json: boolean
  help: boolean
}

interface AccountRow {
  id: string
  name: string
  bank: string
  balance: number
}

interface CardRow {
  id: string
  name: string
  bank: string
}

interface ResolvedContext {
  ctx: HandlerContext
  account?: AccountRow
  rdbAccount?: AccountRow
  card?: CardRow
  interCard?: CardRow
  statementMonth?: string
  statementMonthSource?: 'arg' | 'filename' | 'current'
}

interface ImportRow {
  user_id: string
  account_id: string | null
  credit_card_id: string | null
  date: string
  competency_month: string
  statement_month: string | null
  amount: number
  signed_amount: number
  direction: string
  type: string
  description: string
  context: string
  scope: string
  splits: unknown
  category_id: string | null
  to_account_id: string | null
  is_essential: boolean
  fixed_type: string | null
  installment_current: number | null
  installment_total: number | null
  external_id: string
  source: string
  notes: string | null
}

function usage() {
  return `Usage:
  npm run import:file -- --file <csv|pdf> --user leo|murilo [options]

Dry-run is the default. Nothing is written unless you pass both --commit and --confirm.

Options:
  --month YYYY-MM-01          Statement month for credit-card imports
  --account-id <id>           Override account
  --card-id <id>              Override primary credit card
  --inter-card-id <id>        Murilo multi-source file: Inter card
  --rdb-account-id <id>       Murilo multi-source file: RDB account
  --password <value>          Password for encrypted PDFs, such as C6 invoices
  --allow-guessed-month       Allow commit when card month was guessed as current month
  --commit --confirm          Write to Supabase
  --json                      Print machine-readable JSON

Examples:
  npm run import:file -- --file /tmp/nubank.csv --user leo
  npm run import:file -- --file /tmp/c6.pdf --user leo --month 2026-07-01 --password 1234
  npm run import:file -- --file /tmp/c6.pdf --user leo --month 2026-07-01 --password 1234 --commit --confirm
`
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    commit: false,
    confirm: false,
    allowGuessedMonth: false,
    json: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const value = argv[++i]
      if (!value) throw new Error(`Missing value for ${arg}`)
      return value
    }

    if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--file') out.file = next()
    else if (arg === '--user') {
      const value = next()
      if (value !== 'leo' && value !== 'murilo') throw new Error('--user must be leo or murilo')
      out.user = value
    } else if (arg === '--month') out.month = normalizeMonth(next())
    else if (arg === '--account-id') out.accountId = next()
    else if (arg === '--card-id') out.cardId = next()
    else if (arg === '--inter-card-id') out.interCardId = next()
    else if (arg === '--rdb-account-id') out.rdbAccountId = next()
    else if (arg === '--password') out.password = next()
    else if (arg === '--commit') out.commit = true
    else if (arg === '--confirm') out.confirm = true
    else if (arg === '--allow-guessed-month') out.allowGuessedMonth = true
    else if (arg === '--json') out.json = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return out
}

function normalizeMonth(value: string): string {
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`
  if (/^\d{4}-\d{2}-01$/.test(value)) return value
  throw new Error(`Invalid month "${value}". Use YYYY-MM or YYYY-MM-01.`)
}

function loadEnv(path = '.env') {
  const env: Record<string, string> = {}
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const idx = line.indexOf('=')
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function findPDFStart(buffer: Buffer): Uint8Array {
  for (let i = 0; i < Math.min(buffer.length - 4, 1_000_000); i++) {
    if (buffer[i] === 0x25 && buffer[i + 1] === 0x50 && buffer[i + 2] === 0x44 && buffer[i + 3] === 0x46) {
      return new Uint8Array(buffer.subarray(i))
    }
  }
  return new Uint8Array(buffer)
}

async function extractPDFText(buffer: Buffer, password?: string) {
  // pdfjs touches DOMMatrix during module initialization. In Node, optional
  // canvas bindings may be absent, but text extraction only needs a light stub.
  if (!('DOMMatrix' in globalThis)) {
    ;(globalThis as unknown as { DOMMatrix: new () => unknown }).DOMMatrix = class DOMMatrix {
      a = 1
      b = 0
      c = 0
      d = 1
      e = 0
      f = 0
    }
  }
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdf = await pdfjs.getDocument({ data: findPDFStart(buffer), password, disableWorker: true }).promise
  const pages: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const lineMap = new Map<number, string[]>()

    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = Math.round((item as { transform: number[] }).transform[5])
      if (!lineMap.has(y)) lineMap.set(y, [])
      lineMap.get(y)!.push((item as { str: string }).str)
    }

    pages.push(
      [...lineMap.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) => parts.join(' ').trim())
        .filter(Boolean)
        .join('\n'),
    )
  }

  return pages.join('\n')
}

function guessStatementMonth(fileName: string): { month: string; source: 'filename' | 'current' } {
  const m = fileName.match(/(\d{4})[_-](0[1-9]|1[0-2])/)
  if (m) return { month: `${m[1]}-${m[2]}-01`, source: 'filename' }
  const now = new Date()
  return {
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    source: 'current',
  }
}

function byId<T extends { id: string }>(rows: T[], id?: string) {
  return id ? rows.find((r) => r.id === id) : undefined
}

function byBankAccount(rows: AccountRow[], bank: string) {
  const sameBank = rows.filter((r) => r.bank.toLowerCase() === bank)
  return (
    sameBank.find((r) => /\bconta\b/i.test(r.name) && !/rdb|cofrinho/i.test(r.name)) ??
    sameBank.find((r) => !/rdb|cofrinho/i.test(r.name)) ??
    sameBank[0]
  )
}

function byBankCard(rows: CardRow[], bank: string) {
  return rows.find((r) => r.bank.toLowerCase() === bank)
}

function sourceBank(source: string): string | undefined {
  if (source.startsWith('nubank')) return 'nubank'
  if (source.startsWith('c6')) return 'c6'
  if (source.startsWith('inter')) return 'inter'
  return undefined
}

function requireResolved<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message)
  return value
}

function resolveContext(args: CliArgs, source: string, accounts: AccountRow[], cards: CardRow[]): ResolvedContext {
  const userId = requireResolved(args.user, 'Missing --user leo|murilo')
  const isCard = isCardHandler(source)
  const isMurilo = isMuriloHandler(source)
  const bank = sourceBank(source)

  let account = byId(accounts, args.accountId)
  let rdbAccount = byId(accounts, args.rdbAccountId)
  let card = byId(cards, args.cardId)
  let interCard = byId(cards, args.interCardId)

  if (args.accountId && !account) throw new Error(`Account not found for --account-id ${args.accountId}`)
  if (args.rdbAccountId && !rdbAccount) throw new Error(`Account not found for --rdb-account-id ${args.rdbAccountId}`)
  if (args.cardId && !card) throw new Error(`Card not found for --card-id ${args.cardId}`)
  if (args.interCardId && !interCard) throw new Error(`Card not found for --inter-card-id ${args.interCardId}`)

  if (isMurilo) {
    account ??= byBankAccount(accounts, 'nubank')
    rdbAccount ??= accounts.find((a) => /rdb/i.test(a.name))
    card ??= byBankCard(cards, 'nubank')
    interCard ??= byBankCard(cards, 'inter')
  } else if (isCard) {
    card ??= bank ? byBankCard(cards, bank) : cards[0]
  } else {
    account ??= bank ? byBankAccount(accounts, bank) : accounts[0]
  }

  const guessed = guessStatementMonth(args.file ?? '')
  const statementMonth = isCard ? (args.month ?? guessed.month) : undefined
  const statementMonthSource = isCard ? (args.month ? 'arg' : guessed.source) : undefined

  const ctx: HandlerContext = {
    userId,
    creditCardId: isCard || isMurilo ? requireResolved(card, `No card found for source ${source}`)?.id : undefined,
    creditCardIdInter: isMurilo ? interCard?.id : undefined,
    accountId: !isCard || isMurilo ? requireResolved(account, `No account found for source ${source}`)?.id : undefined,
    accountIdRdb: isMurilo ? rdbAccount?.id : undefined,
    statementMonth,
  }

  return { ctx, account, rdbAccount, card, interCard, statementMonth, statementMonthSource }
}

function guessPaymentCard(tx: NormalizedTransaction, cards: CardRow[]) {
  const text = tx.description.toLowerCase()
  if (text.includes('c6')) return byBankCard(cards, 'c6')
  if (text.includes('inter')) return byBankCard(cards, 'inter')
  if (text.includes('nu') || text.includes('nubank')) return byBankCard(cards, 'nubank')
  return undefined
}

function buildRows(txs: NormalizedTransaction[], userId: UserId, accountId: string | undefined, creditCardId: string | undefined, cards: CardRow[]): ImportRow[] {
  return txs.map((tx) => {
    const isTransfer = tx.type === 'transfer'
    const keepAsCardPayment = tx.type === 'credit_card_payment'
    const paymentCard = keepAsCardPayment ? guessPaymentCard(tx, cards) : undefined
    const applyClassification = !isTransfer && !keepAsCardPayment
    const categoryId = applyClassification ? (tx.suggested_category_id ?? null) : null
    const splits = applyClassification && tx.suggested_splits && tx.suggested_splits.length > 1 ? tx.suggested_splits : null

    return {
      user_id: userId,
      account_id: tx.account_id !== undefined ? tx.account_id : (accountId ?? null),
      credit_card_id: tx.credit_card_id !== undefined ? tx.credit_card_id : (creditCardId ?? null),
      date: tx.date,
      competency_month: tx.competency_month,
      statement_month: tx.statement_month ?? null,
      amount: tx.amount,
      signed_amount: tx.signed_amount,
      direction: tx.direction,
      type: tx.type,
      description: tx.description,
      context: tx.suggested_context ?? tx.context,
      scope: splits ? 'shared' : tx.scope,
      splits,
      category_id: categoryId,
      to_account_id: isTransfer ? (tx.suggested_to_account_id ?? null) : null,
      is_essential: false,
      fixed_type: null,
      installment_current: tx.installment_current ?? null,
      installment_total: tx.installment_total ?? null,
      external_id: tx.external_id,
      source: tx.source,
      notes: paymentCard ? `Pagamento fatura - ${paymentCard.name}` : null,
    }
  })
}

function validateRowsForWrite(rows: ImportRow[]): string[] {
  const errors: string[] = []

  rows.forEach((row, index) => {
    const isInvoiceLine = row.statement_month !== null && row.type !== 'credit_card_payment'
    if (isInvoiceLine && !row.credit_card_id) {
      errors.push(
        `row ${index + 1} (${row.source}/${row.external_id}) has statement_month but no credit_card_id: ${row.description}`,
      )
    }
    if (row.type === 'credit_card_purchase' && !row.statement_month) {
      errors.push(`row ${index + 1} (${row.source}/${row.external_id}) is credit_card_purchase without statement_month`)
    }
  })

  return errors
}

function countBy<T>(rows: T[], getKey: (row: T) => string) {
  const counts: Record<string, number> = {}
  for (const row of rows) counts[getKey(row)] = (counts[getKey(row)] ?? 0) + 1
  return counts
}

async function countExisting(supabase: ReturnType<typeof createClient>, txs: NormalizedTransaction[]) {
  let existing = 0
  const bySource = new Map<string, string[]>()
  for (const tx of txs) {
    const ids = bySource.get(tx.source) ?? []
    ids.push(tx.external_id)
    bySource.set(tx.source, ids)
  }

  for (const [source, ids] of bySource.entries()) {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      const { count, error } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('source', source)
        .in('external_id', chunk)
      if (error) throw error
      existing += count ?? 0
    }
  }
  return existing
}

async function upsertRows(supabase: ReturnType<typeof createClient>, rows: ImportRow[]) {
  const result = { inserted: 0, skipped: 0, errors: [] as string[] }
  const rowErrors = validateRowsForWrite(rows)
  if (rowErrors.length) {
    result.errors.push(...rowErrors)
    return result
  }

  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    const { data, error } = await supabase
      .from('transactions')
      .upsert(batch, { onConflict: 'external_id,source', ignoreDuplicates: true })
      .select('id')
    if (error) result.errors.push(error.message)
    else {
      result.inserted += data?.length ?? 0
      result.skipped += batch.length - (data?.length ?? 0)
    }
  }
  return result
}

function formatSummary(payload: Record<string, unknown>) {
  const source = payload.source as string
  const mode = payload.mode as string
  const stats = payload.stats as { total: number; existing: number; new: number; uncategorized: number; possibleTransfers: number }
  const resolved = payload.resolved as { user: string; account?: string; card?: string; statementMonth?: string; statementMonthSource?: string }
  const samples = payload.samples as Array<{ date: string; description: string; signed_amount: number; type: string }>
  const warnings = payload.warnings as string[]

  const lines = [
    `Import ${mode}: ${source}`,
    `User: ${resolved.user}`,
    resolved.account ? `Account: ${resolved.account}` : undefined,
    resolved.card ? `Card: ${resolved.card}` : undefined,
    resolved.statementMonth ? `Statement month: ${resolved.statementMonth} (${resolved.statementMonthSource})` : undefined,
    `Total: ${stats.total} | New: ${stats.new} | Existing: ${stats.existing}`,
    `Uncategorized: ${stats.uncategorized} | Possible transfers/payments: ${stats.possibleTransfers}`,
  ].filter(Boolean)

  if (warnings.length) lines.push('', 'Warnings:', ...warnings.map((w) => `- ${w}`))
  if (samples.length) {
    lines.push('', 'Sample:')
    for (const tx of samples) lines.push(`- ${tx.date} | ${tx.type} | ${tx.signed_amount} | ${tx.description}`)
  }

  return lines.join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  if (!args.file) throw new Error('Missing --file')
  if (!args.user) throw new Error('Missing --user leo|murilo')
  if (args.commit && !args.confirm) throw new Error('Refusing to write without --confirm')

  const env = loadEnv()
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')

  const fileName = basename(args.file)
  const raw = readFileSync(args.file)
  const fileContent = extname(fileName).toLowerCase() === '.pdf'
    ? await extractPDFText(raw, args.password)
    : raw.toString('utf8')

  const { handler } = resolveHandler(fileName, fileContent)
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const [{ data: accountsData, error: accountsError }, { data: cardsData, error: cardsError }] = await Promise.all([
    supabase.from('accounts').select('id,name,bank,balance').eq('user_id', args.user).order('name'),
    supabase.from('credit_cards').select('id,name,bank').eq('user_id', args.user).order('name'),
  ])
  if (accountsError) throw accountsError
  if (cardsError) throw cardsError

  const accounts = (accountsData ?? []) as AccountRow[]
  const cards = (cardsData ?? []) as CardRow[]
  const resolved = resolveContext(args, handler.source, accounts, cards)

  if (
    args.commit &&
    isCardHandler(handler.source) &&
    resolved.statementMonthSource === 'current' &&
    !args.allowGuessedMonth
  ) {
    throw new Error('Refusing to commit a card import with current-month guess. Pass --month YYYY-MM-01 or --allow-guessed-month.')
  }

  const pipeline = runImportPipeline({ fileName, fileContent, context: resolved.ctx })
  const existing = await countExisting(supabase, pipeline.transactions)
  const rows = buildRows(pipeline.transactions, args.user, resolved.ctx.accountId, resolved.ctx.creditCardId, cards)
  const rowErrors = validateRowsForWrite(rows)

  const uncategorized = rows.filter((r) =>
    !r.category_id &&
    !['transfer', 'credit_card_payment', 'investment_contribution', 'investment_withdrawal', 'investment_adjustment'].includes(r.type),
  ).length
  const possibleTransfers = rows.filter((r) =>
    ['transfer', 'credit_card_payment', 'investment_contribution', 'investment_withdrawal', 'investment_adjustment'].includes(r.type),
  ).length
  const warnings: string[] = []
  if (isCardHandler(handler.source) && resolved.statementMonthSource === 'current') {
    warnings.push('Credit-card statement month was guessed as the current month. Prefer passing --month.')
  }
  if (rowErrors.length) warnings.push(`${rowErrors.length} rows are missing required card metadata and cannot be committed.`)
  if (uncategorized > 0) warnings.push(`${uncategorized} importable rows have no category and will stay uncategorized.`)
  if (pipeline.errors.length) warnings.push(`${pipeline.errors.length} pipeline errors were reported.`)

  let writeResult: Awaited<ReturnType<typeof upsertRows>> | undefined
  if (args.commit && rowErrors.length) {
    throw new Error(`Refusing to commit invalid import:\n${rowErrors.slice(0, 10).join('\n')}`)
  }
  if (args.commit) writeResult = await upsertRows(supabase, rows)

  const payload = {
    mode: args.commit ? 'commit' : 'dry-run',
    file: fileName,
    source: handler.source,
    resolved: {
      user: args.user,
      account: resolved.account ? `${resolved.account.name} (${resolved.account.bank})` : undefined,
      rdbAccount: resolved.rdbAccount ? `${resolved.rdbAccount.name} (${resolved.rdbAccount.bank})` : undefined,
      card: resolved.card ? `${resolved.card.name} (${resolved.card.bank})` : undefined,
      interCard: resolved.interCard ? `${resolved.interCard.name} (${resolved.interCard.bank})` : undefined,
      statementMonth: resolved.statementMonth,
      statementMonthSource: resolved.statementMonthSource,
    },
    stats: {
      parsedRows: pipeline.total,
      total: pipeline.transactions.length,
      existing,
      new: Math.max(0, pipeline.transactions.length - existing),
      skippedInsideFile: pipeline.skipped,
      uncategorized,
      possibleTransfers,
      byType: countBy(rows, (r) => r.type),
    },
    warnings,
    samples: rows.slice(0, 10).map((r) => ({
      date: r.date,
      description: r.description,
      signed_amount: r.signed_amount,
      type: r.type,
      category_id: r.category_id,
    })),
    writeResult,
  }

  console.log(args.json ? JSON.stringify(payload, null, 2) : formatSummary(payload))

  if (writeResult?.errors.length) process.exitCode = 1
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
