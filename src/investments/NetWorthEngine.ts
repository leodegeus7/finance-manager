// ============================================================
// NET WORTH ENGINE
//
// Rule 8.1: net_worth = sum(accounts) + sum(assets)
//
// Three clearly separated layers (Rule PRINCIPLE 2):
//   1. Cash flow    → income/expenses (TransactionEngine)
//   2. Performance  → investment gain/loss (AssetEngine)
//   3. Net worth    → total wealth snapshot (this file)
//
// Mixing these layers breaks the system.
// ============================================================

import { Asset, AccountBalance, NetWorthSnapshot } from './types'

// ─── Net Worth Computation ────────────────────────────────────

/**
 * Computes the current net worth snapshot.
 *
 * Rule 8.1: net_worth = sum(accounts) + sum(assets)
 * Rule 8.2: supports both financial assets and real assets (ex: pinus)
 */
export function computeNetWorth(
  accounts: AccountBalance[],
  assets: Asset[],
): Pick<NetWorthSnapshot, 'accounts_total' | 'assets_total' | 'net_worth'> {
  const accountsTotal = round(
    accounts.reduce((s, a) => s + a.balance, 0),
  )

  // Assets linked to an account are already part of that account's balance
  // (accounts_total) — exclude them here to avoid double counting.
  const assetsTotal = round(
    assets
      .filter((a) => a.is_active && !a.linked_account_id)
      .reduce((s, a) => s + a.current_value, 0),
  )

  return {
    accounts_total: accountsTotal,
    assets_total: assetsTotal,
    net_worth: round(accountsTotal + assetsTotal),
  }
}

/**
 * Builds a monthly net worth timeline from a series of snapshots.
 * Computes month-over-month change and percentage.
 *
 * Used for the Dashboard chart (Block 2: patrimônio ao longo do tempo).
 */
export function buildNetWorthTimeline(
  snapshots: Omit<NetWorthSnapshot, 'monthly_change' | 'monthly_change_pct'>[],
): NetWorthSnapshot[] {
  const sorted = [...snapshots].sort((a, b) => a.month.localeCompare(b.month))

  return sorted.map((snapshot, i) => {
    const prev = sorted[i - 1]
    const monthlyChange = prev
      ? round(snapshot.net_worth - prev.net_worth)
      : undefined
    const monthlyChangePct =
      prev && prev.net_worth !== 0
        ? round((monthlyChange! / prev.net_worth) * 100)
        : undefined

    return {
      ...snapshot,
      monthly_change: monthlyChange,
      monthly_change_pct: monthlyChangePct,
    }
  })
}

/**
 * Returns the most recent net worth snapshot from a timeline.
 * Used by Dashboard Block 1 (patrimônio total + variação no mês).
 */
export function latestNetWorth(timeline: NetWorthSnapshot[]): NetWorthSnapshot | null {
  if (timeline.length === 0) return null
  return [...timeline].sort((a, b) => b.month.localeCompare(a.month))[0]
}

/**
 * Returns the net worth snapshot for a specific month from a timeline,
 * falling back to the latest available snapshot if that month isn't present.
 * Used so the Dashboard/Patrimônio "Patrimônio total" reflects the month the
 * user has selected (matching Contas & Cartões), not just the globally most
 * recent one.
 */
export function netWorthForMonth(timeline: NetWorthSnapshot[], month: string): NetWorthSnapshot | null {
  return timeline.find((s) => s.month === month) ?? latestNetWorth(timeline)
}

/**
 * Computes the net worth for a specific past month by summing:
 *   - account balances AS OF that month (from transaction history)
 *   - asset values AS OF that month (from asset movement history)
 *
 * This is a point-in-time reconstruction, not a cached value.
 *
 * accounts  → provide { account_id, balance } for the given month
 * assets    → provide { id, current_value } as of that month
 */
export function computeNetWorthForMonth(
  month: string,
  accounts: AccountBalance[],
  assets: Asset[],
): NetWorthSnapshot {
  const { accounts_total, assets_total, net_worth } = computeNetWorth(accounts, assets)

  return {
    month,
    accounts_total,
    assets_total,
    net_worth,
  }
}

// ─── Breakdown Helpers ────────────────────────────────────────

export interface NetWorthBreakdown {
  accounts: AccountBalance[]
  assets: Array<{ asset: Asset; percentage_of_total: number }>
  accounts_total: number
  assets_total: number
  net_worth: number
}

/**
 * Builds a full breakdown of net worth with per-asset percentages.
 * Used by the Net Worth page (UI Section 6).
 */
export function buildNetWorthBreakdown(
  accounts: AccountBalance[],
  assets: Asset[],
): NetWorthBreakdown {
  const { accounts_total, assets_total, net_worth } = computeNetWorth(accounts, assets)

  const activeAssets = assets.filter((a) => a.is_active)

  return {
    accounts,
    assets: activeAssets.map((asset) => ({
      asset,
      percentage_of_total:
        net_worth > 0 && !asset.linked_account_id
          ? round((asset.current_value / net_worth) * 100)
          : 0,
    })),
    accounts_total,
    assets_total,
    net_worth,
  }
}

// ─── Utils ────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100
}
