// ============================================================
// CSV PARSER UTIL
// ============================================================

import { RawRow } from '../types'

/**
 * Auto-detects whether a CSV file uses comma or semicolon as separator.
 * Counts occurrences in the header line (outside quoted strings).
 */
function detectSeparator(headerLine: string): ',' | ';' {
  let commas = 0
  let semicolons = 0
  let inQuotes = false
  for (const ch of headerLine) {
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (inQuotes) continue
    if (ch === ',') commas++
    if (ch === ';') semicolons++
  }
  return semicolons > commas ? ';' : ','
}

/**
 * Minimal CSV parser.
 * Handles: comma OR semicolon separators (auto-detected), quoted fields,
 * CRLF and LF line endings.
 *
 * Returns an array of objects keyed by the first-row headers.
 * Skips blank lines.
 */
export function parseCSV(content: string): { headers: string[]; rows: RawRow[] } {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const nonEmpty = lines.filter((l) => l.trim().length > 0)

  if (nonEmpty.length < 2) {
    return { headers: [], rows: [] }
  }

  const sep = detectSeparator(nonEmpty[0])
  const headers = splitCSVLine(nonEmpty[0], sep).map((h) => h.trim())
  const rows: RawRow[] = []

  for (let i = 1; i < nonEmpty.length; i++) {
    const values = splitCSVLine(nonEmpty[i], sep)
    if (values.every((v) => v.trim() === '')) continue

    const row: RawRow = {}
    headers.forEach((header, idx) => {
      row[header] = (values[idx] ?? '').trim()
    })
    rows.push(row)
  }

  return { headers, rows }
}

function splitCSVLine(line: string, separator: string = ','): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      // Handle escaped quotes ("")
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === separator && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)
  return result
}
