import { error } from "./route-attempt-core.js"

export type RouteCapabilityBinding = {
  consumeRouteCapability(input: {
    capability: string
    attempt_id: string
    browser_secret_hash: string
    desktop_secret_hash: string
  }): Promise<{ success: boolean }>
}

export async function authorizeRouteCapability(
  env: Pick<Env, "POLICY_CAPABILITIES">,
  capability: string,
  body: Record<string, unknown>,
  validators: {
    validAttemptId: (value: unknown) => boolean
    validSecretHash: (value: unknown) => boolean
  },
): Promise<Response | null> {
  if (
    !validators.validAttemptId(body.attempt_id)
    || !validators.validSecretHash(body.browser_secret_hash)
    || !validators.validSecretHash(body.desktop_secret_hash)
  ) {
    return error("invalid_attempt")
  }
  try {
    const policyCapabilities = env.POLICY_CAPABILITIES as unknown as RouteCapabilityBinding
    const authorization = await policyCapabilities.consumeRouteCapability({
      capability,
      attempt_id: String(body.attempt_id),
      browser_secret_hash: String(body.browser_secret_hash),
      desktop_secret_hash: String(body.desktop_secret_hash),
    })
    return authorization.success ? null : error("route_capability_rejected", 401)
  } catch {
    return error("route_check_authorization_unavailable", 503)
  }
}
