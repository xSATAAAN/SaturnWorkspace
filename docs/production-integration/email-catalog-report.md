# SaturnWS Email Catalog Report

Generated: 2026-06-20

Canonical source:

- `D:\SaturnWS\web-platform\workers\policy\src\email_catalog.ts`
- `D:\SaturnWS\web-platform\workers\policy\migrations\0009_transactional_email_catalog.sql`

## Summary

| State | Count |
| --- | ---: |
| Live / linked | 5 |
| Prepared, not active | 9 |
| Disabled | 2 |
| Total | 16 |

## Catalog

| Template key | Event source | State | Sender | Languages | Timing | User control | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `support_ticket_created` | Support ticket created in Policy Worker | Live / linked | Support | EN/AR | Immediate | Mandatory | Confirmation only after a real support thread is created. |
| `support_admin_replied` | Admin support reply in Policy Worker | Live / linked | Support | EN/AR | Immediate | Mandatory | Internal notes are excluded. |
| `support_status_changed` | Admin support status update | Live / linked | Support | EN/AR | Immediate | User-dismissible | Sent only for real status changes. |
| `support_inbound_received` | Resend `email.received` support reply | Live / linked | Support | EN/AR | Immediate/inbound tracking | Mandatory | Tracks inbound reply processing; not an outbound email. |
| `admin_email_test` | Admin Email Operations manual test | Live / linked | General | EN/AR | Immediate/manual | Mandatory | Controlled test email only. |
| `account_welcome` | Account activation event | Prepared, not active | Account | EN/AR | Immediate/event-driven | User-dismissible | No active server event currently emits it. |
| `auth_email_verification` | Auth email verification event | Prepared, not active | Security | EN/AR | Immediate/event-driven | Mandatory | Auth Worker is not wired to emit this through Policy email yet. |
| `auth_password_reset` | Password reset event | Prepared, not active | Security | EN/AR | Immediate/event-driven | Mandatory | Existing reset remains separate until explicitly integrated. |
| `security_new_login` | Login security event | Prepared, not active | Security | EN/AR | Immediate/event-driven | Mandatory | Requires a real auth/security event source. |
| `billing_payment_succeeded` | Payment provider webhook | Disabled | Billing | EN/AR | Immediate/event-driven | Mandatory | Disabled until payment provider integration is live. |
| `billing_payment_failed` | Payment provider webhook | Disabled | Billing | EN/AR | Immediate/event-driven | Mandatory | Disabled until payment provider integration is live. |
| `billing_subscription_expiring` | Subscription reminder schedule | Prepared, not active | Billing | EN/AR | Scheduled | User-dismissible | Requires real subscription scheduling source. |
| `billing_subscription_expired` | Subscription expiry event | Prepared, not active | Billing | EN/AR | Immediate/event-driven | Mandatory | Requires a real subscription state-change source. |
| `release_update_available` | Release/update notification event | Prepared, not active | General | EN/AR | Immediate/campaign | User-dismissible | Requires approved release notification campaign source. |
| `release_mandatory_update` | Mandatory update campaign event | Prepared, not active | General | EN/AR | Immediate/campaign | Mandatory | Requires approved mandatory update campaign source. |
| `policy_kill_switch_notice` | Policy/service lock notice | Prepared, not active | Security | EN/AR | Scheduled/manual | Mandatory | Requires explicit admin/system event source. |

## Sender Identities

| Identity | Address |
| --- | --- |
| General | `SaturnWS <no-reply@mail.saturnws.com>` |
| Support | `SaturnWS Support <support@mail.saturnws.com>` |
| Security | `SaturnWS Security <security@mail.saturnws.com>` |
| Billing | `SaturnWS Billing <billing@mail.saturnws.com>` |
| Account | `SaturnWS <hello@mail.saturnws.com>` |

## Activation Rules

- Live/linked templates may run only if their category flag and the global outbound/inbound flag allow it.
- Prepared templates are renderable for preview/testing only; they are not emitted by fake events.
- Disabled billing templates must remain inactive until the payment provider is completed.
- Essential messages ignore user opt-out preferences.
- Non-essential messages may be suppressed by `notification_preferences`.
- Recipients marked bounced, complained, or suppressed are skipped.
