// ============================================================
// HANDLER — MURILO TRANSAÇÕES (planilha completa)
//
// Formato: CSV exportado da planilha pessoal do Murilo
// Headers: (idx),Data,DESCRIÇÃO,Parcela,VALOR,SALDO,Categoria,
//          Classe,(ano/mês),Tipo,SeparaçãoLeo,MacroCategoria,Lugar
//
// Fontes cobertas neste arquivo:
//   Cartão/Nubank  → credit_card_purchase (nubank card)
//   Cartão/Inter   → credit_card_purchase (inter card)
//   Conta/Nubank   → expense/income/credit_card_payment
//
// T:Transferencia rows são ignorados (transferências internas).
// ============================================================

import { ImportHandler, HandlerContext, NormalizedTransaction, RawRow, TransactionType } from '../types'
import { parseCSV } from '../utils/csv'
import { toCompetencyMonth } from '../utils/date'
import { hash } from '../utils/hash'
import type { SplitParticipant } from '@/engine/types'

// Category prefix → system category ID
const CATEGORY_MAP: Record<string, string> = {
  'D:Alimentação->Café':                        'cat-alim-cafe',
  'D:Alimentação->Delivery':                    'cat-alim-delivery',
  'D:Alimentação->Lanches':                     'cat-alim-lanches',
  'D:Alimentação->Restaurantes dia-dia':        'cat-alim-rest-dia',
  'D:Alimentação->Restaurantes dia-dia ':       'cat-alim-rest-dia',
  'D:Alimentação->Restaurantes p/ Lazer':       'cat-alim-rest-laz',
  'D:Alimentação->Snacks':                      'cat-alim-snacks',
  'D:Apartamento Raul':                         'cat-apto-raul',
  'D:Artigos aleatórios':                       'cat-artigos',
  'D:Beleza':                                   'cat-beleza',
  'D:Carro->Aluguel':                           'cat-carro-aluguel',
  'D:Carro->Combustível':                       'cat-carro-combustivel',
  'D:Carro->Estacionamento':                    'cat-carro-estac',
  'D:Carro->IPVA':                              'cat-carro-ipva',
  'D:Carro->Multas':                            'cat-carro-multa',
  'D:Carro->Pedágios':                          'cat-carro-pedagio',
  'D:Carro->Seguro':                            'cat-carro-seguro',
  'D:Carro>manutenção':                         'cat-carro-manut',
  'D:Cartão':                                   'cat-cartao',
  'D:Casa':                                     'cat-casa',
  'D:Casa->Manutenção':                         'cat-casa-manut',
  'D:Celular':                                  'cat-celular',
  'D:Clínica->Aluguel':                         'cat-clin-aluguel',
  'D:Clínica->ComissãoClínicaExterna':          'cat-clin-comissao',
  'D:Clínica->Materiais Médicos':               'cat-clin-mat-med',
  'D:Clínica->Materiais de escritório':         'cat-clin-mat-escrit',
  'D:Clínica->Materiais de escritório ':        'cat-clin-mat-escrit',
  'D:Clínica->Materiais diversos extras':       'cat-clin-mat-div',
  'D:Clínica->Produtos':                        'cat-clin-produtos',
  'D:Doação':                                   'cat-doacao',
  'D:Educação->Aula de Inglês':                 'cat-edu-ingles',
  'D:Educação->Curso':                          'cat-edu-curso',
  'D:Empréstimo':                               'cat-emprest',
  'D:Empréstimo de Crédito':                    'cat-emprest-cred',
  'D:Impostos/Taxas':                           'cat-impostos',
  'D:Jurídico':                                 'cat-juridico',
  'D:Lazer':                                    'cat-lazer',
  'D:Lazer->+':                                 'cat-lazer',
  'D:Lazer->Aniversário':                       'cat-lazer-aniv',
  'D:Lazer->Apostas':                           'cat-lazer-apostas',
  'D:Lazer->Apps':                              'cat-lazer-apps',
  'D:Lazer->Balada':                            'cat-balada',
  'D:Lazer->Bar':                               'cat-bar',
  'D:Lazer->Bebidas':                           'cat-bebida',
  'D:Lazer->Entretenimento':                    'cat-lazer-entret',
  'D:Marketing->Agência':                       'cat-mkt-agencia',
  'D:Marketing->Anúncio':                       'cat-mkt-anuncio',
  'D:Mercado':                                  'cat-mercado',
  'D:Multas':                                   'cat-carro-multa',
  'D:Não Lembro':                               'cat-nao-lembro',
  'D:Outros':                                   'cat-outros',
  'D:Pagamentos':                               'cat-pagto',
  'D:Pagamentos de terceiros':                  'cat-pag-terceiros',
  'D:Pet->Aquário':                             'cat-pet-aquario',
  'D:Pet->Nala':                                'cat-pet-nala',
  'D:Presente':                                 'cat-presente',
  'D:Roupa':                                    'cat-roupas',
  'D:Saúde->Academia':                          'cat-saude-academia',
  'D:Saúde->Farmácia':                          'cat-saude-farmacia',
  'D:Saúde->Médico':                            'cat-saude-medico',
  'D:Saúde->Médico/Dentista/Psicólogo':        'cat-saude-medico',
  'D:Saúde->Suplementos':                       'cat-saude-supl',
  'D:Seguro de vida':                           'cat-seguro-vida',
  'D:Serviços Contábeis':                       'cat-contabil',
  'D:Souvenirs':                                'cat-souvenirs',
  'D:Transporte':                               'cat-transp',
  'D:Viagem':                                   'cat-viagem',
  'D:Viagem->Hospedagem':                       'cat-viagem-hosp',
  'D:Viagem->Transporte':                       'cat-viagem-transp',

  'R:Aluguel':                                  'inc-aluguel',
  'R:Cashback':                                 'inc-cashback',
  'R:Empréstimo':                               'inc-emprestimo',
  'R:Estorno':                                  'inc-estorno',
  'R:Estorno Cartão':                           'inc-estorno-cartao',
  'R:Impostos':                                 'inc-impostos',
  'R:Pagamento Cartão':                         'inc-pag-cartao',
  'R:Pagamentos':                               'inc-pagto',
  'R:Pagamentos de terceiros':                  'inc-pag-terceiros',
  'R:Pagamentos->Mãe/Pai':                      'inc-pag-mae-pai',
  'R:Presente':                                 'inc-presente',
  'R:Reajuste':                                 'inc-reajuste',
  'R:Recebimento->Buffara':                     'inc-receb-buffara',
  'R:Recebimento->Clínica':                     'inc-receb-clinica',
  'R:Recebimento->Lúcio':                       'inc-receb-lucio',
  'R:Recebimento->Muller':                      'inc-receb-muller',
  'R:Recebimento->Renove':                      'inc-receb-renove',
  'R:Receita p/ Produtos':                      'inc-receita-prod',
  'R:Venda de bem pessoal':                     'inc-venda-bem',
}

function parseDateBR(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const a = parseInt(m[1]), b = parseInt(m[2])
  // If a > 12 it can only be the day (DD/MM); if b > 12 it can only be the day (MM/DD).
  // When ambiguous (both ≤ 12) default to Brazilian convention (DD/MM).
  const [day, month] = a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b]
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseAmountBR(raw: string): number | null {
  // "R$ 160,00" or "-R$ 17,50"
  const cleaned = raw.replace(/R\$\s*/, '').replace(/\./g, '').replace(',', '.').trim()
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function buildSplits(separacao: string): SplitParticipant[] | null {
  const s = separacao.trim()
  if (!s || s === '*' || s === '?' || s === '1/4') return null

  if (s === 'POR2' || s === 'POR2 370') {
    return [
      { name: 'Leonardo', user_id: 'leo',    pct: 50 },
      { name: 'Murilo',   user_id: 'murilo', pct: 50 },
    ]
  }
  if (s === 'LEO') {
    return [
      { name: 'Leonardo', user_id: 'leo',    pct: 100 },
      { name: 'Murilo',   user_id: 'murilo', pct: 0 },
    ]
  }
  if (s === 'POR4') {
    return [
      { name: 'Leonardo', user_id: 'leo',    pct: 25 },
      { name: 'Murilo',   user_id: 'murilo', pct: 75 },
    ]
  }
  return null
}

// "2024/12" → "2024-12-01"  |  "2025/1" → "2025-01-01"
function parseAnoMes(raw: string): string | undefined {
  const m = raw.trim().match(/^(\d{4})\/(\d{1,2})$/)
  if (!m) return undefined
  return `${m[1]}-${m[2].padStart(2, '0')}-01`
}

export class MuriloTransacoesHandler implements ImportHandler {
  readonly source = 'murilo_transacoes'

  identify(_fileName: string, headers: string[]): boolean {
    return (
      headers.includes('SeparaçãoLeo') &&
      headers.includes('DESCRIÇÃO') &&
      headers.includes('Tipo') &&
      headers.includes('Lugar')
    )
  }

  parse(fileContent: string): RawRow[] {
    // Column 8 (between Classe and Tipo) is unnamed but holds the billing year/month.
    // Rename it so it survives the duplicate-empty-header collision in parseCSV.
    const patched = fileContent.replace(',Classe,,Tipo,', ',Classe,AnoMes,Tipo,')
    const { rows } = parseCSV(patched)
    return rows
  }

  normalize(rows: RawRow[], ctx: HandlerContext): NormalizedTransaction[] {
    const results: NormalizedTransaction[] = []
    const occurrences = new Map<string, number>()

    for (const row of rows) {
      const rawDate   = row['Data']         ?? ''
      const descr     = row['DESCRIÇÃO']    ?? ''
      const rawValor  = row['VALOR']        ?? ''
      const categoria = row['Categoria']    ?? ''
      const classe    = row['Classe']       ?? ''
      const anoMes    = row['AnoMes']       ?? ''
      const tipo      = row['Tipo']         ?? ''
      const lugar     = row['Lugar']        ?? ''
      const separacao = row['SeparaçãoLeo'] ?? ''

      const isoDate = parseDateBR(rawDate)
      if (!isoDate) continue

      const rawAmount = parseAmountBR(rawValor)
      if (rawAmount == null) continue
      const amount = Math.abs(rawAmount)
      if (amount === 0) continue

      // R: = income, D: = expense, T: = direction by amount sign (outgoing = expense)
      const isTransfer = categoria.startsWith('T:')
      const direction = categoria.startsWith('R:') ? 'income'
        : isTransfer ? (rawAmount >= 0 ? 'income' : 'expense')
        : 'expense'
      const signedAmount = direction === 'income' ? amount : -amount

      // Deduplication — occurrence counter for identical rows
      const occKey = `${isoDate}|${descr}|${amount}|${tipo}|${lugar}`
      const occCount = (occurrences.get(occKey) ?? 0) + 1
      occurrences.set(occKey, occCount)
      const externalId = occCount === 1
        ? hash(isoDate, descr, amount, tipo, lugar)
        : hash(isoDate, descr, amount, tipo, lugar, occCount)

      // Per-transaction account/card linkage
      // Explicit null = no ID; undefined would fall back to context (we avoid that here)
      const credit_card_id: string | null = tipo === 'Cartão'
        ? (lugar === 'Inter' ? (ctx.creditCardIdInter ?? null) : (ctx.creditCardId ?? null))
        : null
      const isRdb = /rdb/i.test(descr)
      const account_id: string | null = tipo !== 'Cartão'
        ? (ctx.accountId ?? null)
        : null
      // For RDB transfers the "other side" is always the RDB account
      const suggested_to_account_id: string | null = isRdb && tipo !== 'Cartão'
        ? (ctx.accountIdRdb ?? null)
        : null

      // T: = transfer | D:Cartão = credit_card_payment | D: = expense | R: = income
      let txType: TransactionType
      if (isTransfer) {
        txType = 'transfer'
      } else if (tipo === 'Cartão') {
        txType = 'credit_card_purchase'
      } else if (direction === 'income') {
        txType = 'income'
      } else if (categoria === 'D:Cartão') {
        txType = 'credit_card_payment'
      } else {
        txType = 'expense'
      }

      const context = classe === 'Profissional' ? 'professional' : 'personal'
      const suggestedSplits = buildSplits(separacao)
      const scope = suggestedSplits ? 'shared' : 'individual'

      results.push({
        source: this.source,
        external_id: externalId,

        date: isoDate,
        competency_month: toCompetencyMonth(isoDate),
        statement_month: tipo === 'Cartão' ? (parseAnoMes(anoMes) ?? toCompetencyMonth(isoDate)) : undefined,

        amount,
        signed_amount: signedAmount,
        direction,
        type: txType,

        description: descr,
        context,
        scope,

        credit_card_id,
        account_id,

        suggested_category_id: CATEGORY_MAP[categoria.trim()] ?? '',
        suggested_context: context,
        suggested_splits: suggestedSplits,
        suggested_to_account_id,
      })
    }

    return results
  }
}
