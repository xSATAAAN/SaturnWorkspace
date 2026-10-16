export type RegistrationDelivery = {
  deliveryStatus?: 'queued' | 'sent' | 'failed' | 'unknown'
  sentAt?: string | null
  resendAfterSeconds?: number
  resendAvailableAt?: string
}

export function registrationDelivery(input: RegistrationDelivery, now = Date.now()): RegistrationDelivery {
  if (input.deliveryStatus === 'sent' && typeof input.sentAt === 'string'
      && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(input.sentAt)) {
    const sentAt = Date.parse(input.sentAt)
    const remaining = input.resendAfterSeconds
    if (Number.isFinite(sentAt) && typeof remaining === 'number' && Number.isInteger(remaining)
        && remaining >= 0 && remaining <= 3600) {
      const savedDeadline = Date.parse(input.resendAvailableAt || '')
      const deadline = Number.isFinite(savedDeadline) ? savedDeadline : now + remaining * 1000
      return { deliveryStatus: 'sent', sentAt: new Date(sentAt).toISOString(),
        resendAfterSeconds: Math.max(0, Math.min(3600, Math.ceil((deadline - now) / 1000))),
        resendAvailableAt: new Date(deadline).toISOString() }
    }
  }
  if ((input.deliveryStatus === 'queued' || input.deliveryStatus === 'failed') && input.sentAt == null) {
    return { deliveryStatus: input.deliveryStatus, sentAt: null, resendAfterSeconds: 0 }
  }
  return { deliveryStatus: 'unknown', sentAt: null, resendAfterSeconds: 0 }
}
