// UI Rule 9 — Insights: title + explanation + action, severity color
import clsx from 'clsx'
import { Insight } from '@/insights/types'

interface InsightCardProps {
  insight: Insight
  className?: string
}

const severityStyles = {
  critical: {
    border: 'border-l-red-500',
    icon: '🔴',
    badge: 'bg-red-50 text-red-700',
  },
  warning: {
    border: 'border-l-yellow-400',
    icon: '🟡',
    badge: 'bg-yellow-50 text-yellow-700',
  },
  info: {
    border: 'border-l-blue-400',
    icon: '🔵',
    badge: 'bg-blue-50 text-blue-600',
  },
}

export function InsightCard({ insight, className }: InsightCardProps) {
  const style = severityStyles[insight.severity]

  return (
    <div
      className={clsx(
        'bg-white rounded-xl border border-gray-100 border-l-4 p-4 shadow-sm',
        style.border,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-base mt-0.5 shrink-0">{style.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-snug">
            {insight.message}
          </p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            {insight.detail}
          </p>
          <p className={clsx('text-xs font-medium mt-2 px-2 py-1 rounded-md inline-block', style.badge)}>
            → {insight.action}
          </p>
        </div>
      </div>
    </div>
  )
}
