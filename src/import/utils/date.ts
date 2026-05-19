// ============================================================
// DATE UTILS
// ============================================================

/**
 * Converts DD/MM/YYYY → YYYY-MM-DD (ISO)
 *
 * Example: '15/04/2024' → '2024-04-15'
 */
export function parseBrazilianDate(raw: string): string {
  const trimmed = raw.trim()
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) {
    throw new Error(`Invalid date format: "${raw}". Expected DD/MM/YYYY`)
  }
  const [, day, month, year] = match
  return `${year}-${month}-${day}`
}

/**
 * Returns the first day of the month for a given ISO date.
 *
 * Example: '2024-04-15' → '2024-04-01'
 */
export function toCompetencyMonth(isoDate: string): string {
  const [year, month] = isoDate.split('-')
  return `${year}-${month}-01`
}

/**
 * Parses ISO date (YYYY-MM-DD) and returns first day of that month.
 * Alias for toCompetencyMonth — clarifies intent for CC statement month.
 */
export function toStatementMonth(isoDate: string): string {
  return toCompetencyMonth(isoDate)
}
