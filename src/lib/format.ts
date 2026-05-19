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
