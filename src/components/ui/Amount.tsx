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

export function Amount({ value, size = 'md', signed = false, colored = true, className }: AmountProps) {
  const isPositive = value >= 0
  const display = (signed && value > 0 ? '+' : '') + formatCurrency(Math.abs(value))

  return (
    <span
      className={clsx(
        'font-semibold tabular-nums',
        size === 'sm' && 'text-base',
        size === 'md' && 'text-xl',
        size === 'lg' && 'text-3xl',
        size === 'xl' && 'text-5xl font-bold',
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
