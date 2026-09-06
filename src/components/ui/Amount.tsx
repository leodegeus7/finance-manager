// Large, clear amount displays — UI Rule 10.2: números grandes
import clsx from 'clsx'
import { formatCurrency, formatPct } from '@/lib/format'

interface AmountProps {
  value: number
  size?: 'sm' | 'md' | 'lg' | 'xl'
  signed?: boolean       // show + for positive
  colored?: boolean      // green/red by sign
  className?: string
}

// Fonte adaptativa: valores grandes (ex.: patrimônio/receita da fazenda, com 7+
// dígitos) diminuem a fonte p/ não estourar o card. Cada tamanho tem uma escala
// que desce conforme o comprimento do texto formatado.
const SIZE_STEPS: Record<NonNullable<AmountProps['size']>, [maxLen: number, cls: string][]> = {
  sm: [[Infinity, 'text-base']],
  md: [[13, 'text-xl'], [Infinity, 'text-base']],
  lg: [[10, 'text-3xl'], [12, 'text-2xl'], [Infinity, 'text-xl']],
  xl: [[13, 'text-5xl'], [16, 'text-4xl'], [Infinity, 'text-3xl']],
}

function sizeClass(size: NonNullable<AmountProps['size']>, len: number): string {
  const steps = SIZE_STEPS[size]
  const hit = steps.find(([max]) => len <= max) ?? steps[steps.length - 1]
  return hit[1]
}

export function Amount({ value, size = 'md', signed = false, colored = true, className }: AmountProps) {
  const isPositive = value >= 0
  const display = (signed && value > 0 ? '+' : '') + formatCurrency(Math.abs(value))

  return (
    <span
      className={clsx(
        'font-semibold tabular-nums whitespace-nowrap',
        sizeClass(size, display.length),
        size === 'xl' && 'font-bold',
        colored && isPositive && 'text-gray-900',
        colored && !isPositive && 'text-red-600',
        className,
      )}
    >
      {display}
    </span>
  )
}

interface DeltaBadgeProps {
  value: number     // percentage
  className?: string
}

export function DeltaBadge({ value, className }: DeltaBadgeProps) {
  const positive = value >= 0
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 text-sm font-medium px-2 py-0.5 rounded-full',
        positive
          ? 'bg-green-50 text-green-700'
          : 'bg-red-50 text-red-600',
        className,
      )}
    >
      {positive ? '▲' : '▼'} {formatPct(Math.abs(value))}
    </span>
  )
}
