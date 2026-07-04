// ============================================================
// MONEY PARSER
// Parses a monetary string in BR or US format into a Number.
//
// Handles:
//   "124,99"        → 124.99   (BR decimal comma)
//   "1.401,07"      → 1401.07  (BR w/ thousands dot)   ← the bug this fixes
//   "12.345.678,90" → 12345678.9
//   "32.90"         → 32.9     (US decimal dot)
//   "1,401.07"      → 1401.07  (US w/ thousands comma)
//   "- 84,97"       → -84.97   (Nubank negative w/ space)
//   "R$ 1.401,07"   → 1401.07  (currency symbol stripped)
//
// Rule: when both separators are present, the RIGHTMOST is the decimal
// separator and the other marks thousands. A lone comma is treated as the
// decimal separator (BR); a lone dot as-is (US) — matches how Nubank/C6
// faturas are exported (comma always decimal, always with 2 decimals).
// ============================================================

export function parseMoney(raw: string | undefined | null): number {
  let s = (raw ?? '').trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '')
  if (!s) return NaN

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')

  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot
      ? s.replace(/\./g, '').replace(',', '.') // BR: dot=thousands, comma=decimal
      : s.replace(/,/g, '')                    // US: comma=thousands, dot=decimal
  } else if (lastComma > -1) {
    s = s.replace(',', '.')                     // lone comma → decimal
  }
  // lone dot or no separator → parseFloat already correct

  return parseFloat(s)
}
