// Exporta o fechamento mensal (Conta/Cartão/Total × Despesa/Receita por
// categoria) pra .xlsx, no mesmo layout que o financeiro da fazenda já usa
// numa planilha à parte — colunas Categoria/Valor lado a lado por seção.
import ExcelJS from 'exceljs'
import { MonthlyReport, ReportSection } from '@/engine/MonthlyReportEngine'
import { formatMonth } from '@/lib/format'

const GROUP_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
const SUBGROUP_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }

interface Group {
  label: string
  section: ReportSection
  startCol: number   // 1-indexed
}

const GROUP_ROW = 3
const SUBGROUP_ROW = 4
const HEADER_ROW = 5
const FIRST_DATA_ROW = 6

export async function exportMonthlyReportToExcel(report: MonthlyReport, month: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Fechamento')

  const groups: Group[] = [
    { label: 'CONTA', section: report.conta, startCol: 1 },
    { label: 'CARTÃO', section: report.cartao, startCol: 5 },
    { label: 'TOTAL', section: report.total, startCol: 9 },
  ]

  ws.getCell(1, 1).value = 'Mês'
  ws.getCell(1, 1).font = { bold: true }
  ws.getCell(1, 2).value = formatMonth(month)

  for (const g of groups) {
    ws.mergeCells(GROUP_ROW, g.startCol, GROUP_ROW, g.startCol + 3)
    const groupCell = ws.getCell(GROUP_ROW, g.startCol)
    groupCell.value = g.label
    groupCell.font = { bold: true }
    groupCell.alignment = { horizontal: 'center' }
    groupCell.fill = GROUP_FILL

    ws.mergeCells(SUBGROUP_ROW, g.startCol, SUBGROUP_ROW, g.startCol + 1)
    const despesaCell = ws.getCell(SUBGROUP_ROW, g.startCol)
    despesaCell.value = 'Despesa'
    despesaCell.font = { bold: true }
    despesaCell.alignment = { horizontal: 'center' }
    despesaCell.fill = SUBGROUP_FILL

    ws.mergeCells(SUBGROUP_ROW, g.startCol + 2, SUBGROUP_ROW, g.startCol + 3)
    const receitaCell = ws.getCell(SUBGROUP_ROW, g.startCol + 2)
    receitaCell.value = 'Receita'
    receitaCell.font = { bold: true }
    receitaCell.alignment = { horizontal: 'center' }
    receitaCell.fill = SUBGROUP_FILL

    ;['Categoria', 'Valor', 'Categoria', 'Valor'].forEach((label, i) => {
      const cell = ws.getCell(HEADER_ROW, g.startCol + i)
      cell.value = label
      cell.font = { italic: true, color: { argb: 'FF6B7280' } }
      cell.fill = HEADER_FILL
    })

    writeCategoryColumn(ws, g.startCol, g.section.despesas.map((c) => [c.category_name, c.total]))
    writeCategoryColumn(ws, g.startCol + 2, g.section.receitas.map((c) => [c.category_name, c.total]))

    for (let i = 0; i < 4; i++) ws.getColumn(g.startCol + i).width = i % 2 === 0 ? 26 : 14
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fechamento-${month.slice(0, 7)}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function writeCategoryColumn(ws: ExcelJS.Worksheet, col: number, rows: [string, number][]): void {
  rows.forEach(([name, value], i) => {
    ws.getCell(FIRST_DATA_ROW + i, col).value = name
    const valueCell = ws.getCell(FIRST_DATA_ROW + i, col + 1)
    valueCell.value = value
    valueCell.numFmt = '#,##0.00'
  })
}
