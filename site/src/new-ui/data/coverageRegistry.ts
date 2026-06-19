import type { FeatureIntegrationState } from '../adapters/featureRegistry'
import type { Surface } from '../app/previewRouter'

export type CoverageEntry = {
  id: string
  feature: string
  state: FeatureIntegrationState
  surface: Surface
  page: string
  note?: string
}

type Seed = [feature: string, surface: Surface, page: string]

const covered: Seed[] = [
  ['Public landing overview', 'public', 'home'], ['Product features', 'public', 'features'], ['How it works', 'public', 'product'], ['FAQ', 'public', 'faq'], ['Public language switch', 'public', 'home'],
  ['Start signup from pricing', 'auth', 'signup'], ['Public feedback', 'public', 'contact'], ['Contact page', 'public', 'contact'], ['Legal pages', 'public', 'privacy'], ['Release notes', 'public', 'releases'], ['Status pages', 'system', '404'],
  ['Sign in', 'auth', 'signin'], ['Sign up', 'auth', 'signup'], ['Google sign-in', 'auth', 'signin'], ['Password reset', 'auth', 'forgot'], ['Email link completion', 'auth', 'verify'], ['Desktop device linking', 'auth', 'linked'], ['Device link errors', 'auth', 'linked-error'],
  ['Account subscription overview', 'portal', 'overview'], ['Account profile', 'portal', 'settings'], ['Account email display', 'portal', 'settings'], ['Subscription details', 'portal', 'subscription'], ['Security/password reset', 'portal', 'security'], ['Sign out current session', 'portal', 'devices'],
  ['Admin login layer 1', 'admin', 'login'], ['Admin Firebase session', 'admin', 'login'], ['Admin overview KPIs', 'admin', 'overview'], ['Recent admin activity', 'admin', 'overview'], ['Access requests', 'admin', 'users'], ['User detail', 'admin', 'users'],
  ['Grant subscription', 'admin', 'subscriptions'], ['Subscription list', 'admin', 'subscriptions'], ['Update subscription status', 'admin', 'subscriptions'], ['Reset HWID', 'admin', 'subscriptions'], ['Promo codes', 'admin', 'commerce'],
  ['OTA upload artifact', 'admin', 'releases'], ['OTA publish', 'admin', 'releases'], ['Targeted OTA', 'admin', 'releases'], ['OTA rollback', 'admin', 'releases'], ['OTA disable', 'admin', 'releases'], ['OTA reset baseline', 'admin', 'releases'],
  ['Remote config', 'admin', 'policies'], ['Kill switch', 'admin', 'policies'], ['Minimum version / force update', 'admin', 'releases'], ['Feature flags JSON', 'admin', 'policies'],
  ['Crash logs', 'admin', 'diagnostics'], ['Crash groups', 'admin', 'diagnostics'], ['Audit log', 'admin', 'audit'], ['Support threads', 'admin', 'support'], ['Support messages', 'admin', 'support'], ['Support reply', 'admin', 'support'], ['Support block/unblock', 'admin', 'support'],
  ['Desktop policy check', 'admin', 'policies'], ['Google Drive OAuth config', 'portal', 'settings'], ['License legacy verify', 'admin', 'coverage'], ['Auth/session verify backend', 'portal', 'devices'], ['Crash ingest', 'admin', 'diagnostics'],
]

const partialReady: Seed[] = [
  ['Payment order status', 'checkout', 'status'], ['Request subscription activation', 'portal', 'subscription'], ['Current session', 'portal', 'devices'], ['Delete account request', 'portal', 'settings'],
  ['Legacy OTA records', 'admin', 'releases'], ['Announcements JSON', 'admin', 'communications'], ['Policy global state', 'admin', 'policies'], ['User policy override', 'admin', 'users'],
  ['Plan feature controls', 'admin', 'policies'], ['Policy release catalog', 'admin', 'releases'], ['Disabled versions', 'admin', 'policies'], ['Admin state/history', 'admin', 'releases'],
]

const shells: Seed[] = [
  ['In-app support create/read', 'portal', 'support'], ['OTA manifest/download serving', 'public', 'download'], ['Tamper alerts', 'admin', 'diagnostics'],
]

const backendRequired: Seed[] = [
  ['Invoices', 'portal', 'payments'], ['Sign out all devices', 'portal', 'devices'], ['Notification preferences', 'portal', 'settings'], ['Export data', 'portal', 'settings'],
]

const decisionRequired: Seed[] = [
  ['Public pricing', 'public', 'pricing'], ['Create payment intent', 'checkout', 'checkout'], ['Invite code management', 'admin', 'governance'], ['Invite audit', 'admin', 'governance'],
]

const excluded: Seed[] = [
  ['Invite validation', 'system', 'invite'], ['Payment provider webhook', 'admin', 'coverage'],
]

function normalizeId(feature: string) {
  return feature.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function mapEntries(seeds: Seed[], state: FeatureIntegrationState, note?: string): CoverageEntry[] {
  return seeds.map(([feature, surface, page]) => ({ id: normalizeId(feature), feature, state, surface, page, note }))
}

export const coverageRegistry: CoverageEntry[] = [
  ...mapEntries(covered, 'implemented'),
  ...mapEntries(partialReady, 'ui-complete', 'Current contract is sufficient for the represented UI.'),
  ...mapEntries(shells, 'integration-pending', 'A truthful UI shell is available; live integration is not approved or confirmed.'),
  ...mapEntries(backendRequired, 'backend-required', 'The live action remains disabled until a backend contract is approved.'),
  ...mapEntries(decisionRequired, 'decision-required', 'Production behavior requires a commercial or security decision.'),
  ...mapEntries(excluded, 'excluded', 'Kept backend-only or legacy for this round.'),
]

export const coverageSummary = coverageRegistry.reduce<Record<FeatureIntegrationState, number>>((summary, entry) => {
  summary[entry.state] += 1
  return summary
}, { implemented: 0, 'ui-complete': 0, 'integration-pending': 0, 'backend-required': 0, 'decision-required': 0, excluded: 0 })
