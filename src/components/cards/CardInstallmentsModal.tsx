import { Card } from '@/components/ui/Card'
import { formatCurrency, formatMonth } from '@/lib/format'
import { InstallmentItem } from '@/engine/CardInvoiceEngine'

interface Props {
  month: string
  items: InstallmentItem[]
  total: number
  projected: boolean
  onClose: () => void
}

export function CardInstallmentsModal({ month, items, total, projected, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Parcelados</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {formatMonth(month)}{projected ? ' · projeção' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Total */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-500">Total parcelado</span>
          <span className="text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(total)}</span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhuma transação parcelada neste mês</p>
          ) : (
            items.map((item) => (
              <Card key={item.id} padding="sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Parcela {item.installment_current}/{item.installment_total}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">
                    {formatCurrency(item.amount)}
                  </p>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
