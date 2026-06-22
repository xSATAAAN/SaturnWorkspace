export type SubscriptionEntitlement =
  | "no_subscription"
  | "entitled"
  | "grace_period"
  | "payment_required"
  | "expired"
  | "suspended"
  | "policy_blocked"
  | "integrity_conflict"

export type SubscriptionResolution<Row = Record<string, unknown>> = {
  currentRow: Row | null
  current: Record<string, unknown> | null
  projection: Record<string, unknown> & { entitlement: SubscriptionEntitlement }
  history: Array<Record<string, unknown>>
  diagnostics: {
    integrity: "ok" | "conflict"
    code: string | null
    authoritative_rows: number
    current_usable_count: number
    historical_count: number
    legacy_email_candidates: number
    uid_mismatch_candidates: number
    malformed_rows: number
  }
}

export function subscriptionPlanTerm(row: Record<string, unknown> | null): string | null
export function subscriptionLifecycle(row: Record<string, unknown> | null, now?: Date | string): string | null
export function subscriptionRenewalState(row: Record<string, unknown> | null): string
export function resolveSubscriptionTruth<Row = Record<string, unknown>>(
  rows: Row[],
  identity: { firebaseUid?: string; firebase_uid?: string; userId?: string; email?: string },
  options?: { now?: Date | string },
): SubscriptionResolution<Row>
export function desktopEntitlementFromProjection(projection: Record<string, unknown> | null): string
