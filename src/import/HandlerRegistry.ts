// ============================================================
// HANDLER REGISTRY
// Auto-selects the correct handler for a given file.
// Supports CSV (text) and PDF (pre-extracted text).
// ============================================================

import { ImportHandler, RawRow } from './types'
import { NubankAccountHandler }      from './handlers/NubankAccountHandler'
import { NubankCreditHandler }        from './handlers/NubankCreditHandler'
import { C6CreditHandler }            from './handlers/C6CreditHandler'
import { C6CreditPDFHandler }         from './handlers/C6CreditPDFHandler'
import { InterAccountHandler }        from './handlers/InterAccountHandler'
import { InterCreditPDFHandler }      from './handlers/InterCreditPDFHandler'
import { MuriloTransacoesHandler }    from './handlers/MuriloTransacoesHandler'
import { parseCSV }                   from './utils/csv'

// Order matters for identify() resolution
const HANDLERS: ImportHandler[] = [
  new InterCreditPDFHandler(),      // PDF — identified by 'inter' in filename
  new InterAccountHandler(),        // Inter CSV Account
  new C6CreditPDFHandler(),         // PDF — identified by C6 markers in the text
  new MuriloTransacoesHandler(),    // Before other handlers — unique SeparaçãoLeo header
  new NubankCreditHandler(),        // CC before account (both have 'nubank' in name)
  new NubankAccountHandler(),
  new C6CreditHandler(),
]

export interface HandlerResolution {
  handler: ImportHandler
  headers: string[]
  rows: RawRow[]
}

/**
 * Resolves the correct handler for a file.
 * PDFs: match by filename only (no CSV parsing).
 * CSVs: match by filename + detected headers.
 */
export function resolveHandler(fileName: string, fileContent: string): HandlerResolution {
  const isPDF = fileName.toLowerCase().endsWith('.pdf')

  if (isPDF) {
    // fileContent is the pre-extracted PDF text — pass its lines so handlers
    // can identify by content (a PDF filename often lacks a bank hint).
    const lines = fileContent ? fileContent.split('\n').map((l) => l.trim()).slice(0, 200) : []
    for (const handler of HANDLERS) {
      if (handler.identify(fileName, lines)) {
        return { handler, headers: lines, rows: [] }
      }
    }
    throw new Error(`Nenhum handler encontrado para o PDF "${fileName}".`)
  }

  // CSV flow
  const { headers, rows } = parseCSV(fileContent)

  for (const handler of HANDLERS) {
    if (handler.identify(fileName, headers)) {
      return { handler, headers, rows }
    }
  }

  throw new Error(
    `Formato não reconhecido: "${fileName}". ` +
    `Colunas detectadas: [${headers.join(', ')}]. ` +
    `Handlers disponíveis: ${HANDLERS.map((h) => h.source).join(', ')}`,
  )
}

/** Returns all registered handler sources */
export function listHandlers(): string[] {
  return HANDLERS.map((h) => h.source)
}

/** Returns whether a handler needs a credit card context (vs account) */
export function isCardHandler(source: string): boolean {
  return ['nubank_credit', 'c6_credit', 'c6_credit_pdf', 'inter_credit'].includes(source)
}

/** Returns whether a handler is the Murilo multi-source CSV */
export function isMuriloHandler(source: string): boolean {
  return source === 'murilo_transacoes'
}
