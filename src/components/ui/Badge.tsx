import clsx from 'clsx'
import { ReactNode } from 'react'

type BadgeVariant = 'default' | 'green' | 'yellow' | 'red' | 'blue' | 'gray'

export function Badge({ children, variant = 'default', className }: {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      variant === 'default' && 'bg-gray-100 text-gray-700',
      variant === 'green'   && 'bg-green-50 text-green-700',
      variant === 'yellow'  && 'bg-yellow-50 text-yellow-700',
      variant === 'red'     && 'bg-red-50 text-red-700',
      variant === 'blue'    && 'bg-blue-50 text-blue-700',
      variant === 'gray'    && 'bg-gray-100 text-gray-500',
      className,
    )}>
      {children}
    </span>
  )
}

// Invoice payment status (UI Rule 5.4: green=paid, yellow=partial, red=open)
export function InvoiceBadge({ status }: { status: 'open' | 'partial' | 'paid' }) {
  const map = {
    paid:    { label: 'Paga',     variant: 'green'  },
    partial: { label: 'Parcial',  variant: 'yellow' },
    open:    { label: 'Em aberto',variant: 'red'    },
  } as const
  const { label, variant } = map[status]
  return <Badge variant={variant}>{label}</Badge>
}
