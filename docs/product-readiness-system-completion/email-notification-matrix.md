# Email and Notification Matrix

Updated: 2026-06-24

Status: `PHASE_G_IMPLEMENTATION_COMPLETE_WITH_EXPLICIT_OPERATIONAL_CONFIGURATION_ITEMS`

This matrix records event-to-message coverage. It does not enable additional email categories and does not start manual acceptance.

## Flags and Operational Inputs

| Category | Flag / config | Current source state | Notes |
| --- | --- | --- | --- |
| Auth email | `EMAIL_AUTH_ENABLED` | Enabled in Auth and Policy source | Verification/resend queue path is active; provider delivery needs QA recipient acceptance. |
| Support email | `EMAIL_SUPPORT_ENABLED` | Enabled in Policy source | Ticket confirmation/reply/status email paths are covered by Policy Phase D/G tests. |
| Scheduler/outbox | `EMAIL_SCHEDULER_ENABLED`, `EMAIL_OUTBOUND_ENABLED`, `EMAIL_INBOUND_ENABLED` | Enabled in Policy source | Queue, retry, webhooks, inbound support reply-by-email, and cleanup are covered by automated checks. |
| Security email | `EMAIL_SECURITY_ENABLED` | Disabled in Auth/Admin source | Producers exist for selected committed account/session events; activation is deferred. |
| Admin alerts | `EMAIL_ADMIN_ALERTS_ENABLED`, `EMAIL_ADMIN_ALERT_RECIPIENTS` | Disabled / recipient configuration required | Producers exist for final email failure, webhook verification failure, cleanup failure, storage configuration failure, schema mismatch, readiness degradation, and high-severity tamper signals. Delivery remains disabled until recipients and rollout are configured. |
| Billing email | `EMAIL_BILLING_ENABLED` | Disabled | No real payment provider or committed billing event source exists. |
| Release email | `EMAIL_RELEASE_ENABLED` / release category flag | Disabled | No approved production release publication email source is active. |

## Event Coverage

| Domain | Event | Producer | Commit boundary | Recipient | Template | Idempotency | Retry / suppression | Current state |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Auth | Email verification requested | Auth Worker -> Policy internal enqueue | After verification request row | Account email | `auth.email_verification` | Purpose/user/email scoped | D1 queue retry, sensitive payload purge | `FULLY_OPERATIONAL_ENABLED` |
| Auth | Verification resend | Auth Worker -> Policy internal enqueue | Previous request invalidated, new request stored | Account email | `auth.verification_resend` | Purpose/user/email scoped | D1 queue retry, sensitive payload purge | `FULLY_OPERATIONAL_ENABLED` |
| Support | Ticket created | Policy web support create | After ticket/message transaction | Account email | `support.ticket_created` | Ticket/message idempotency | D1 queue retry, suppression handling | `FULLY_OPERATIONAL_ENABLED` |
| Support | Admin replied | Policy admin support reply | After reply commit | Ticket owner | `support.reply` | Admin reply key/thread | D1 queue retry, suppression handling | `FULLY_OPERATIONAL_ENABLED` |
| Support | Status changed | Policy support status | After status commit | Ticket owner | `support.status_changed` | Thread/status key | D1 queue retry, suppression handling | `FULLY_OPERATIONAL_ENABLED` |
| Security | New desktop device linked | Auth Worker `issueDesktopSession` | After desktop session/device login commit | Account email | `security.new_login` | Device-login id | D1 queue retry when flag enabled | `PREPARED_DISABLED_WITH_PRODUCER` |
| Security | Session revoked | Auth Worker session revoke | After revoke commit | Account email | `security.session_revoked` | UID/session/scope | D1 queue retry when flag enabled | `PREPARED_DISABLED_WITH_PRODUCER` |
| Security | Device revoked | Auth Worker device revoke | After revoke commit | Account email | `security.device_revoked` | UID/session/scope | D1 queue retry when flag enabled | `PREPARED_DISABLED_WITH_PRODUCER` |
| Security | All sessions revoked | Auth Worker revoke-all | After revoke-all commit | Account email | `security.all_sessions_revoked` | UID + active-session fingerprint | D1 queue retry when flag enabled | `PREPARED_DISABLED_WITH_PRODUCER` |
| Account lifecycle | Account deletion requested | Auth Worker deletion request | After request row/session revoke | Account email | `account.deletion_requested` | Deletion request id | D1 queue retry when flag enabled | `PREPARED_DISABLED_WITH_PRODUCER` |
| Account lifecycle | Account deletion cancelled | Auth Worker deletion cancel | After cancel/profile restore | Account email | `account.deletion_cancelled` | Request id + cancellation timestamp | D1 queue retry when flag enabled | `PREPARED_DISABLED_WITH_PRODUCER` |
| Account lifecycle | Account suspended | Admin Worker lifecycle execute | After Supabase RPC commit | Account email | `account.suspended` | Request id | D1 queue retry when flag enabled | `PREPARED_DISABLED_WITH_PRODUCER` |
| Account lifecycle | Account reactivated | Admin Worker lifecycle execute | After Supabase RPC commit | Account email | `account.reactivated` | Request id | D1 queue retry when flag enabled | `PREPARED_DISABLED_WITH_PRODUCER` |
| Admin alert | Email queue final failure | Policy outbox processor | After final failure and sensitive purge | Configured admins | `admin.email_queue_final_failure` | Failed job id | D1 queue retry, loop prevention | `OPERATIONAL_CONFIGURATION_REQUIRED` |
| Admin alert | Webhook verification failure | Policy Resend webhook verifier | After failed signature/timestamp/missing-header verification | Configured admins | `admin.webhook_repeated_failure` / `admin.tamper_detected` | Event/reason/time-bucket | D1 queue retry, cooldown via deterministic idempotency | `OPERATIONAL_CONFIGURATION_REQUIRED` |
| Admin alert | Scheduled cleanup failure | Policy email cron | After cleanup throws inside scheduler | Configured admins | `admin.email_cleanup_failure` | Failure/time-bucket | D1 queue retry, cooldown via deterministic idempotency | `OPERATIONAL_CONFIGURATION_REQUIRED` |
| Admin alert | Storage configuration failure | Policy attachment orphan cleanup | When private attachment storage binding is unavailable | Configured admins | `admin.storage_config_failure` | Daily binding key | D1 queue retry, daily cooldown | `OPERATIONAL_CONFIGURATION_REQUIRED` |
| Admin alert | Email operations schema mismatch | Policy Email Operations status diagnostics | After read-only schema diagnostic detects missing table/column | Configured admins | `admin.schema_mismatch` | Daily schema diagnostic key | D1 queue retry, daily cooldown | `OPERATIONAL_CONFIGURATION_REQUIRED` |
| Admin alert | Readiness degradation | Policy scheduled handler | After scheduler-level failure | Configured admins | `admin.readiness_degraded` | Failure/time-bucket | D1 queue retry, cooldown via deterministic idempotency | `OPERATIONAL_CONFIGURATION_REQUIRED` |
| Billing | Payment receipt/failure/renewal | None active | Not available | Customer | Prepared billing templates | Not active | Not active | `WAITING_EXTERNAL` |
| Release | Release announcement/update | None active | Not approved | Customer/admin as approved | Prepared release templates | Not active | Not active | `PREPARED_DISABLED` |
| Portal notification | Support reply/status | Policy support commit | After support event | Account portal notification | In-app notification rows | Thread/message/status key | Read/archive operations | `FULLY_OPERATIONAL_ENABLED` |

## Template Review Evidence

- `workers/policy/scripts/check-phase-g-email-content.mjs` renders Arabic and English HTML/plain-text for linked catalog events.
- The guard checks UTF-8, MIME charset, RTL/LTR wrappers, CTA safety, disabled test sends, empty URLs, unsafe interpolation, and implementation vocabulary leakage.
- Billing and release templates remain prepared but disabled because no committed external event source exists.

## Remaining Gaps

- Security email producers are implemented for selected reliable events but remain disabled by flag until category activation and preferences/destination decisions are accepted.
- Admin alert producers are now implemented in source for the required operational families, but `EMAIL_ADMIN_ALERTS_ENABLED=false` and `EMAIL_ADMIN_ALERT_RECIPIENTS` is not configured.
- Admin alert delivery must remain disabled until recipients, rollout, and Phase G manual acceptance are complete.
