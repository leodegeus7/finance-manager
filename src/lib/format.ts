// ─── Currency ─────────────────────────────────────────────────

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value)
}

export function formatCurrencyCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000)
    return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (Math.abs(value) >= 1_000)
    return `R$ ${(value / 1_000).toFixed(1).replace('.', ',')}k`
  return formatCurrency(value)
}

// ─── Percentage ───────────────────────────────────────────────

export function formatPct(value: number, decimals = 1): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals).replace('.', ',')}%`
}

// ─── Date ─────────────────────────────────────────────────────

/** Lista de meses (YYYY-MM-01) entre `start` e `end`, inclusive, ordem crescente */
export function monthRange(start: string, end: string): string[] {
  const months: string[] = []
  let [y, m] = start.split('-').map(Number)
  const [endY, endM] = end.split('-').map(Number)

  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}-01`)
    m++
    if (m > 12) { m = 1; y++ }
  }

  return months
}

/** Adds `n` months to a YYYY-MM-01 month string (n can be negative). */
export function addMonths(month: string, n: number): string {
  let [y, m] = month.split('-').map(Number)
  m += n
  while (m > 12) { m -= 12; y++ }
  while (m < 1)  { m += 12; y-- }
  return `${y}-${String(m).padStart(2, '0')}-01`
}

export function formatMonth(isoMonth: string): string {
  // '2024-04-01' → 'Abril 2024'
  const [year, month] = isoMonth.split('-')
  const months = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
  ]
  return `${months[parseInt(month) - 1]} ${year}`
}

export function formatDate(isoDate: string): string {
  // '2024-04-15' → '15/04'
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}
