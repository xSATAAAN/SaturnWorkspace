import { featureFlags } from './featureRegistry'

export type MockResult<T> = { ok: true; data: T; source: 'development-mock' }

const wait = (delay = 420) => new Promise((resolve) => window.setTimeout(resolve, delay))

async function result<T>(data: T, delay?: number): Promise<MockResult<T>> {
  await wait(delay)
  return { ok: true, data, source: 'development-mock' }
}

export const developmentMockAdapter = {
  async verifyEmailCode(code: string) {
    return result({ valid: code === '123456', status: code === '123456' ? 'verified' : 'invalid' })
  },
  async resetPasswordCode(code: string) {
    return result({ valid: code === '123456', status: code === '123456' ? 'accepted' : 'invalid' })
  },
  async simulatePayment(state: 'pending' | 'success' | 'failed' | 'cancelled' | 'expired') {
    return result({ state, orderId: 'preview-order', live: false }, 650)
  },
  async createSupportTicket(subject: string, message: string) {
    return result({ id: 'preview-ticket', subject, message, status: 'open', live: false })
  },
  async loadRelease() {
    return result({ available: false, version: null, fileSize: null, releasedAt: null })
  },
  flags: featureFlags,
} as const
