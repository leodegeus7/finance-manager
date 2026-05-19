// Mock data for UI development — will be replaced by Supabase queries
import { Transaction } from '@/engine/types'
import { NetWorthSnapshot } from '@/investments/types'
import { Insight } from '@/insights/types'
import { CoupleMonthlyReport } from '@/couple/types'

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id:'t1', user_id:'leo', account_id:'acc1', date:'2024-04-05', competency_month:'2024-04-01', amount:5000, signed_amount:5000, direction:'income', type:'income', description:'Salário', category_id:'cat-renda', category_name:'Renda', context:'personal', scope:'individual', is_essential:true, external_id:'e1', source:'nubank_account' },
  { id:'t2', user_id:'leo', credit_card_id:'cc1', date:'2024-04-08', competency_month:'2024-04-01', statement_month:'2024-04-01', amount:320, signed_amount:-320, direction:'expense', type:'credit_card_purchase', description:'Supermercado Extra', category_id:'cat-alim', category_name:'Alimentação', context:'personal', scope:'shared', is_essential:true, fixed_type:'variable', external_id:'e2', source:'nubank_credit' },
  { id:'t3', user_id:'leo', credit_card_id:'cc1', date:'2024-04-10', competency_month:'2024-04-01', statement_month:'2024-04-01', amount:89.90, signed_amount:-89.90, direction:'expense', type:'credit_card_purchase', description:'iFood', category_id:'cat-rest', category_name:'Restaurantes', context:'personal', scope:'individual', is_essential:false, fixed_type:'variable', external_id:'e3', source:'nubank_credit' },
  { id:'t4', user_id:'leo', credit_card_id:'cc1', date:'2024-04-12', competency_month:'2024-04-01', statement_month:'2024-04-01', amount:32.90, signed_amount:-32.90, direction:'expense', type:'credit_card_purchase', description:'Uber', context:'personal', scope:'individual', is_essential:false, fixed_type:'variable', external_id:'e4', source:'nubank_credit' },
  { id:'t5', user_id:'leo', account_id:'acc1', date:'2024-04-15', competency_month:'2024-04-01', amount:500, signed_amount:-500, direction:'expense', type:'investment_contribution', description:'Aplicação RDB', context:'personal', scope:'individual', is_essential:false, external_id:'e5', source:'nubank_account' },
  { id:'t6', user_id:'leo', account_id:'acc1', date:'2024-04-20', competency_month:'2024-04-01', amount:1200, signed_amount:-1200, direction:'expense', type:'credit_card_payment', description:'Pagamento fatura Nubank', context:'personal', scope:'individual', is_essential:false, external_id:'e6', source:'nubank_account' },
  { id:'t7', user_id:'leo', credit_card_id:'cc1', date:'2024-04-22', competency_month:'2024-04-01', statement_month:'2024-04-01', amount:45.90, signed_amount:-45.90, direction:'expense', type:'credit_card_purchase', description:'Netflix', category_id:'cat-subs', category_name:'Assinaturas', context:'personal', scope:'shared', is_essential:false, fixed_type:'fixed', external_id:'e7', source:'nubank_credit' },
  { id:'t8', user_id:'leo', credit_card_id:'cc1', date:'2024-04-18', competency_month:'2024-04-01', statement_month:'2024-04-01', amount:150, signed_amount:-150, direction:'expense', type:'credit_card_purchase', description:'Farmácia', category_id:'cat-saude', category_name:'Saúde', context:'personal', scope:'individual', is_essential:true, fixed_type:'variable', external_id:'e8', source:'nubank_credit' },
]

export const MOCK_NET_WORTH_TIMELINE: NetWorthSnapshot[] = [
  { month:'2024-01-01', accounts_total:8200,  assets_total:12000, net_worth:20200 },
  { month:'2024-02-01', accounts_total:7800,  assets_total:12500, net_worth:20300, monthly_change:100, monthly_change_pct:0.5 },
  { month:'2024-03-01', accounts_total:9100,  assets_total:13000, net_worth:22100, monthly_change:1800, monthly_change_pct:8.9 },
  { month:'2024-04-01', accounts_total:10200, assets_total:13800, net_worth:24000, monthly_change:1900, monthly_change_pct:8.6 },
]

export const MOCK_INSIGHTS: Insight[] = [
  { id:'overspending:cat-rest', rule:'overspending', severity:'warning', message:'Você gastou 32% a mais em Restaurantes', detail:'Este mês: R$ 890,00 · Média 3 meses: R$ 674,00', action:'Revise seus gastos com restaurantes no próximo mês', value:890, reference:674 },
  { id:'investment_target', rule:'investment_target', severity:'info', message:'Você investiu 10,0% da renda — meta é 20%', detail:'Investido: R$ 500,00 · Meta: R$ 1.000,00 · Faltou: R$ 500,00', action:'Tente aportar mais R$ 500,00 para atingir sua meta de 20%', value:10, reference:20 },
  { id:'couple_balance', rule:'couple_balance', severity:'info', message:'Murilo pagou R$ 180,00 a menos que o combinado', detail:'Murilo: pagou R$ 420,00, deveria R$ 600,00 (40%) · Total compartilhado: R$ 1.500,00', action:'Murilo deve R$ 180,00 para Leonardo referente a este mês', value:180, reference:1500 },
]

export const MOCK_COUPLE_REPORT: CoupleMonthlyReport = {
  month: '2024-04-01',
  total_shared: 1500,
  users: [
    { user_id:'leo', user_name:'Leonardo', percentage:60, paid:1080, expected:900, difference:180, transaction_count:8 },
    { user_id:'murilo', user_name:'Murilo', percentage:40, paid:420, expected:600, difference:-180, transaction_count:5 },
  ],
  settlement: { debtor_user_id:'murilo', creditor_user_id:'leo', amount:180 },
}

export const MOCK_CATEGORIES = [
  { id:'cat-renda',  name:'Renda',        parent_name: undefined },
  { id:'cat-alim',   name:'Alimentação',  parent_name: undefined },
  { id:'cat-rest',   name:'Restaurantes', parent_name:'Alimentação' },
  { id:'cat-subs',   name:'Assinaturas',  parent_name: undefined },
  { id:'cat-saude',  name:'Saúde',        parent_name: undefined },
  { id:'cat-transp', name:'Transporte',   parent_name: undefined },
  { id:'cat-moradia',name:'Moradia',      parent_name: undefined },
  { id:'cat-lazer',  name:'Lazer',        parent_name: undefined },
]

export const MOCK_ACCOUNTS = [
  { id:'acc1', name:'Nubank Conta', bank:'nubank', balance:10200 },
  { id:'acc2', name:'C6 Conta',     bank:'c6',     balance:3400  },
]

export const MOCK_CARDS = [
  { id:'cc1', name:'Nubank Roxinho', bank:'nubank', invoice_total:1280.70, invoice_paid:1200, status:'partial' as const },
  { id:'cc2', name:'C6 Cartão',      bank:'c6',     invoice_total:640.00,  invoice_paid:0,    status:'open'    as const },
]

export const MOCK_ASSETS = [
  { id:'ast1', user_id:'leo', name:'RDB Nubank',   type:'financial' as const, current_value:13800, is_active:true, created_at:'', updated_at:'' },
  { id:'ast2', user_id:'leo', name:'Pinus (Sítio)', type:'real'      as const, current_value:25000, is_active:true, created_at:'', updated_at:'' },
]
