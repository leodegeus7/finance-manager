// ============================================================
// ASSET ENGINE
//
// Handles all three movement types (Rule 7.2):
//
//   contribution  → money leaves account, becomes asset value
//                   linked to a transaction (investment_contribution)
//                   affects cash flow (money left the account)
//
//   withdrawal    → asset value decreases, money enters account
//                   linked to a transaction (investment_withdrawal)
//                   affects cash flow (money entered the account)
//
//   adjustment    → CRITICAL: NO cash flow, NO transaction_id
//                   represents: interest, gain, loss, valuation
//                   only changes asset.current_value
//
// Rule 7.3: investment != expense
//   contribution is NOT an expense — money changed form
//   it DOES reduce account balance but does NOT appear in cash flow expenses
// ============================================================

import { Asset, AssetMovement, AssetSummary, InvestmentPortfolio, MovementType } from './types'

// ─── Movement Validation ──────────────────────────────────────

export interface MovementValidationError {
  field: string
  message: string
}

/**
 * Validates a movement before DB write.
 *
 * Critical constraint: adjustment MUST NOT have a transaction_id.
 * Contribution/withdrawal MUST have a transaction_id.
 */
export function validateMovement(
  movement: Partial<AssetMovement>,
): MovementValidationError[] {
  const errors: MovementValidationError[] = []

  if (!movement.asset_id) errors.push({ field: 'asset_id', message: 'required' })
  if (!movement.type)     errors.push({ field: 'type',     message: 'required' })
  if (!movement.date)     errors.push({ field: 'date',     message: 'required' })
  if (movement.amount == null) errors.push({ field: 'amount', message: 'required' })

  if (movement.type === 'adjustment') {
    // Adjustment: no cash flow, no transaction link (Rule 7.2)
    if (movement.transaction_id) {
      errors.push({
        field: 'transaction_id',
        message: 'adjustment must NOT be linked to a transaction — it has no cash flow',
      })
    }
  }

  if (movement.type === 'contribution' || movement.type === 'withdrawal') {
    // Contributions and withdrawals must link to a real account transaction
    if (!movement.transaction_id) {
      errors.push({
        field: 'transaction_id',
        message: `${movement.type} must be linked to a transaction`,
      })
    }

    // Amount must be positive (the sign is encoded in the type)
    if (movement.amount != null && movement.amount <= 0) {
      errors.push({
        field: 'amount',
        message: `${movement.type} amount must be > 0`,
      })
    }
  }

  return errors
}

// ─── Asset Value Computation ──────────────────────────────────

/**
 * Recomputes asset current value from its full movement history.
 *
 * This is the source of truth for asset value — never trust a cached value
 * unless you've verified the movement history is complete.
 *
 * Logic:
 *   contribution → +amount  (asset grows)
 *   withdrawal   → -amount  (asset shrinks)
 *   adjustment   → +/- amount (gain or loss, positive or negative)
 */
export function computeAssetValue(movements: AssetMovement[]): number {
  let value = 0

  for (const m of movements) {
    switch (m.type) {
      case 'contribution':
        value += m.amount
        break
      case 'withdrawal':
        value -= m.amount
        break
      case 'adjustment':
        value += m.amount  // can be negative (loss) or positive (gain)
        break
    }
  }

  return round(value)
}

/**
 * Computes a full summary for a single asset.
 *
 * Returns performance metrics:
 *   net_invested    = contributed - withdrawn
 *   absolute_return = current_value - net_invested
 *   return_pct      = (absolute_return / net_invested) * 100
 */
export function computeAssetSummary(
  asset: Asset,
  movements: AssetMovement[],
): AssetSummary {
  const contributions = movements
    .filter((m) => m.type === 'contribution')
    .reduce((s, m) => s + m.amount, 0)

  const withdrawals = movements
    .filter((m) => m.type === 'withdrawal')
    .reduce((s, m) => s + m.amount, 0)

  const adjustments = movements
    .filter((m) => m.type === 'adjustment')
    .reduce((s, m) => s + m.amount, 0)

  const netInvested = round(contributions - withdrawals)
  const absoluteReturn = round(asset.current_value - netInvested)
  const returnPct = netInvested > 0
    ? round((absoluteReturn / netInvested) * 100)
    : 0

  return {
    asset,
    total_contributed: round(contributions),
    total_withdrawn: round(withdrawals),
    total_adjustments: round(adjustments),
    net_invested: netInvested,
    current_value: asset.current_value,
    absolute_return: absoluteReturn,
    return_pct: returnPct,
  }
}

/**
 * Builds the full investment portfolio for a user.
 * Aggregates all asset summaries.
 */
export function computePortfolio(
  assets: Asset[],
  movementsByAsset: Map<string, AssetMovement[]>,
): InvestmentPortfolio {
  if (assets.length === 0) {
    return {
      user_id: '',
      assets: [],
      total_current_value: 0,
      total_net_invested: 0,
      total_absolute_return: 0,
      total_return_pct: 0,
    }
  }

  const summaries = assets
    .filter((a) => a.is_active)
    .map((asset) => {
      const movements = movementsByAsset.get(asset.id) ?? []
      return computeAssetSummary(asset, movements)
    })

  const totalCurrentValue = round(summaries.reduce((s, a) => s + a.current_value, 0))
  const totalNetInvested = round(summaries.reduce((s, a) => s + a.net_invested, 0))
  const totalAbsoluteReturn = round(totalCurrentValue - totalNetInvested)
  const totalReturnPct = totalNetInvested > 0
    ? round((totalAbsoluteReturn / totalNetInvested) * 100)
    : 0

  return {
    user_id: assets[0].user_id,
    assets: summaries,
    total_current_value: totalCurrentValue,
    total_net_invested: totalNetInvested,
    total_absolute_return: totalAbsoluteReturn,
    total_return_pct: totalReturnPct,
  }
}

// ─── Cash Flow Impact ─────────────────────────────────────────

/**
 * Returns the cash flow impact of a movement for account balance purposes.
 *
 * contribution → negative impact on account (money left)
 * withdrawal   → positive impact on account (money arrived)
 * adjustment   → ZERO impact on account (no cash flow — Rule 7.2)
 *
 * This is used when updating account balance after a movement.
 */
export function cashFlowImpact(movement: Pick<AssetMovement, 'type' | 'amount'>): number {
  switch (movement.type) {
    case 'contribution': return -movement.amount   // debit from account
    case 'withdrawal':   return +movement.amount   // credit to account
    case 'adjustment':   return 0                  // NO cash flow — critical
  }
}

/**
 * Returns true if the movement type has an associated cash transaction.
 * Used to decide whether to create/require a linked transaction.
 */
export function requiresTransaction(type: MovementType): boolean {
  return type === 'contribution' || type === 'withdrawal'
}

// ─── Timeline ─────────────────────────────────────────────────

/**
 * Builds a value timeline for an asset — useful for Net Worth chart.
 * Returns a sorted array of { date, value } snapshots.
 *
 * Each entry represents the cumulative asset value after that movement.
 */
export function buildAssetTimeline(
  movements: AssetMovement[],
): Array<{ date: string; value: number }> {
  const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date))

  let runningValue = 0
  return sorted.map((m) => {
    switch (m.type) {
      case 'contribution': runningValue += m.amount; break
      case 'withdrawal':   runningValue -= m.amount; break
      case 'adjustment':   runningValue += m.amount; break
    }
    return { date: m.date, value: round(runningValue) }
  })
}

// ─── Utils ────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100
}
