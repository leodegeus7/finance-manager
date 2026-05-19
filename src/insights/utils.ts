/**
 * Returns the first day of the month for a given Date object.
 * e.g. new Date('2024-04-15') → '2024-04-01'
 */
export function toFirstOfMonth(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}
