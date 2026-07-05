// ============================================================
// NUBANK ACCOUNT STATEMENT — BALANCE EXTRACTOR
//
// The Nubank "extrato em PDF" (filename NU_<id>_<DDMMMYYYY>_<DDMMMYYYY>.pdf)
// reports the account's closing balance for a date range. This is NOT a
// transaction import — dropping this PDF just updates the account's
// month-end balance in `account_balance_history` (same effect as filling it
// in manually via the Checklist's "Balanço" step), using the period's END
// month as the target.
// ============================================================

const MONTH_MAP: Record<string, string> = {
  JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
  JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
}

const FILENAME_RE = /^NU_\d+_(\d{2})([A-Z]{3})(\d{4})_(\d{2})([A-Z]{3})(\d{4})\.pdf$/i
// "Saldo final do período" appears twice in the reconstructed text (once as a
// header, followed by other lines before its "R$ ..." value; once again as a
// summary row directly followed by the plain number, no "R$" — since the page
// header already states "VALORES EM R$"). Matching the label + whitespace +
// number (no "R$" required) skips the ambiguous first occurrence and lands on
// the unambiguous second one.
const BALANCE_RE = /Saldo final do per[íi]odo\s+([\d.]+,\d{2})/i

export interface NubankStatementInfo {
  balance: number
  /** YYYY-MM-01 — the period's END month. Null when the filename doesn't
   *  follow the standard NU_..._<start>_<end>.pdf pattern (caller lets the
   *  user pick the month manually in that case). */
  month: string | null
}

/** Identifies a Nubank account statement PDF by filename or content marker. */
export function isNubankStatement(fileName: string, text: string): boolean {
  if (FILENAME_RE.test(fileName)) return true
  return /Saldo final do per[íi]odo/i.test(text) && /CPF\s+Ag[êe]ncia\s+Conta/i.test(text)
}

function parseBRL(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.'))
}

/**
 * Extracts the period's closing balance and end month.
 * Returns null if the balance marker isn't found (not actually a statement,
 * or an unrecognized layout) — caller falls back to normal handling.
 */
export function parseNubankStatement(fileName: string, text: string): NubankStatementInfo | null {
  const balMatch = BALANCE_RE.exec(text)
  if (!balMatch) return null
  const balance = parseBRL(balMatch[1])

  const fm = FILENAME_RE.exec(fileName)
  const mm = fm ? MONTH_MAP[fm[5].toUpperCase()] : undefined
  const month = fm && mm ? `${fm[6]}-${mm}-01` : null

  return { balance, month }
}
