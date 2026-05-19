// ============================================================
// INVESTMENT SYSTEM — TYPES
// ============================================================

// ─── Asset ────────────────────────────────────────────────────

export type AssetType = 'financial' | 'real'
// financial → RDB, CDB, Tesouro, fundos, ações
// real      → pinus, imóveis, outros ativos físicos

export interface Asset {
  id: string
  user_id: string
  name: string
  type: AssetType
  current_value: number  // always the CURRENT value (updated by movements)
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── Asset Movement ───────────────────────────────────────────

export type MovementType = 'contribution' | 'withdrawal' | 'adjustment'

export interface AssetMovement {
  id: string
  asset_id: string
  transaction_id?: string  // set for contribution/withdrawal; NULL for adjustment

  type: MovementType
  amount: number   // positive=increase to asset, negative=decrease
  date: string     // ISO: YYYY-MM-DD

  notes?: string
  created_at: string
}

// ─── Computed Summaries ───────────────────────────────────────

export interface AssetSummary {
  asset: Asset
  total_contributed: number      // sum of all contributions
  total_withdrawn: number        // sum of all withdrawals
  total_adjustments: number      // sum of all adjustments (gain/loss)
  net_invested: number           // contributed - withdrawn
  current_value: number          // from asset.current_value
  absolute_return: number        // current_value - net_invested
  return_pct: number             // (absolute_return / net_invested) * 100
}

export interface InvestmentPortfolio {
  user_id: string
  assets: AssetSummary[]
  total_current_value: number
  total_net_invested: number
  total_absolute_return: number
  total_return_pct: number
}

// ─── Net Worth ─────────────────────────────────────────────────

export interface AccountBalance {
  account_id: string
  account_name: string
  balance: number
}

export interface NetWorthSnapshot {
  month: string               // YYYY-MM-01
  accounts_total: number      // sum(accounts.current_balance)
  assets_total: number        // sum(assets.current_value)
  net_worth: number           // accounts_total + assets_total
  monthly_change?: number     // net_worth - previous month's net_worth
  monthly_change_pct?: number
}
