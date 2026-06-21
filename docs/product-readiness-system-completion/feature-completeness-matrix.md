# Feature Completeness Matrix

Legend:
- `COMPLETE_AND_VERIFIED`: implemented and locally/live verified with evidence.
- `IMPLEMENTED_NOT_VERIFIED`: code exists but current audit did not execute E2E proof.
- `IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED`: code is deployed/protected but manual operational acceptance is deferred to Phase G; do not treat as complete.

Phase B status: `COMPLETE_AUTOMATED_VERIFICATION_PENDING_PHASE_G_MANUAL_ACCEPTANCE`. OTP/Auth rows keep their implementation evidence; all Phase B manual acceptance is deferred to Phase G. Phase C is active. No B.3/B.4 or dependency gate exists.
- `PARTIALLY_IMPLEMENTED`: UI/API exists but behavior, state model, or edge cases are incomplete.
- `BROKEN`: current implementation contradicts required product behavior or known production errors.
- `UI_ONLY`: visual shell exists without real production backend.
- `BACKEND_ONLY`: backend exists but production UI does not expose it properly.
- `WAITING_EXTERNAL_INTEGRATION`: depends on provider/secrets/live credentials.
- `DEPRECATED_OR_DEAD`: old/duplicate path should be removed or hidden.
- `NOT_IMPLEMENTED`: no real implementation found.

| # | Feature / flow | Customer surface | Admin surface | Desktop surface | Backend / storage | Status | Severity | Recommended phase |
|---:|---|---|---|---|---|---|---|---|
| 1 | Public homepage | `site/src/new-ui/pages/production/ProductionPages.tsx` | N/A | N/A | Static content | IMPLEMENTED_NOT_VERIFIED | Medium | E |
| 2 | Public pricing | Production pricing page | N/A | N/A | Static plan adapter | PARTIALLY_IMPLEMENTED | High | E |
| 3 | Pricing plan source | `productionAdapters.listStaticPlans` | N/A | N/A | No canonical plan API found | UI_ONLY | High | E |
| 4 | Weekly plan display | Pricing card | N/A | N/A | Static only | PARTIALLY_IMPLEMENTED | Medium | E |
| 5 | Monthly plan discount/trial copy | Pricing card | N/A | N/A | Static only | PARTIALLY_IMPLEMENTED | Medium | E |
| 6 | Yearly plan discount/trial copy | Pricing card | N/A | N/A | Static only | PARTIALLY_IMPLEMENTED | Medium | E |
| 7 | Public checkout button | Pricing page -> auth checkout intent | N/A | N/A | `/api/payments/create` behind feature flag | PARTIALLY_IMPLEMENTED | High | E |
| 8 | Payment intent creation | Checkout dialog | Admin payment shell | N/A | Admin Worker `routes/payments.js`, order service | WAITING_EXTERNAL_INTEGRATION | High | E |
| 9 | Payment idempotency | Payment API | Admin commerce | N/A | Order service, not fully verified in this pass | IMPLEMENTED_NOT_VERIFIED | High | G |
| 10 | Payment status lookup | Customer payment shell | Admin commerce shell | N/A | `/api/payments/:orderId` | PARTIALLY_IMPLEMENTED | Medium | E |
| 11 | Invoices | Portal payments page | Admin commerce | N/A | No real invoice API surfaced | UI_ONLY | Medium | E |
| 12 | Public download page | `/download` | N/A | N/A | Release adapter/latest manifest | PARTIALLY_IMPLEMENTED | High | E |
| 13 | Authenticated downloads | `/account/downloads` | N/A | N/A | Same release data, gating unclear | PARTIALLY_IMPLEMENTED | High | E |
| 14 | Release notes / changelog | Public route exists | Admin releases | N/A | R2 manifest/release records | IMPLEMENTED_NOT_VERIFIED | Medium | E/F |
| 15 | Stable/beta release admin | N/A | Admin releases page | N/A | Admin Worker R2 OTA release methods | IMPLEMENTED_NOT_VERIFIED | High | F |
| 16 | Targeted OTA release UI | N/A | Admin release publish target fields | N/A | Admin Worker `target_user_emails` etc. | PARTIALLY_IMPLEMENTED | High | F |
| 17 | Mandatory update policy | System/update pages | Admin policies | Desktop startup/update gate | Policy Worker D1 + OTA manifest | PARTIALLY_IMPLEMENTED | Critical | F/G |
| 18 | Silent update mode | N/A | Admin release controls | Desktop updater | OTA path excluded from this phase | IMPLEMENTED_NOT_VERIFIED | High | G |
| 19 | Public contact page | `/contact`, `/support` | N/A | N/A | Shows sign-in prompt, no public unauth contact | PARTIALLY_IMPLEMENTED | Medium | D |
| 20 | Customer support portal | `/account/support` | Admin support inbox | N/A | Policy Worker D1 support tables | IMPLEMENTED_NOT_VERIFIED | High | D |
| 21 | Customer create ticket | Portal support form | Admin inbox | Desktop support exists elsewhere | `/v1/web/support/messages` | IMPLEMENTED_NOT_VERIFIED | High | D |
| 22 | Customer reply to ticket | Portal support drawer | Admin inbox | N/A | `/v1/web/support/reply` | IMPLEMENTED_NOT_VERIFIED | High | D |
| 23 | Ticket status changes | Portal open/closed | Admin status drawer | N/A | Policy Worker support status route | IMPLEMENTED_NOT_VERIFIED | Medium | D |
| 24 | Admin support replies | N/A | Admin support drawer | N/A | `/v1/admin/support/reply` | IMPLEMENTED_NOT_VERIFIED | High | D |
| 25 | Admin internal notes | N/A | Admin support drawer | N/A | `internal_note` option | IMPLEMENTED_NOT_VERIFIED | Medium | D |
| 26 | Support sender blocking | N/A | Admin support drawer | N/A | `/v1/admin/support/block` | IMPLEMENTED_NOT_VERIFIED | Medium | D/F |
| 27 | Support reply by email | Email provider | Admin support | N/A | Policy Worker Resend inbound/outbound | WAITING_EXTERNAL_INTEGRATION | High | D |
| 28 | Support attachments | Not found | Not found | Not found | No attachment storage flow found | NOT_IMPLEMENTED | Low | D/F |
| 29 | Operational email catalog | N/A | `/communications` | N/A | Policy Worker D1 email tables | IMPLEMENTED_NOT_VERIFIED | High | D/F |
| 30 | Email queue/retry/lock | N/A | Admin email ops | N/A | Policy Worker scheduled handler/D1 lock | IMPLEMENTED_NOT_VERIFIED | High | G |
| 31 | Email provider events | N/A | Admin email ops provider tab | N/A | `/api/webhooks/resend`, `email_events` | IMPLEMENTED_NOT_VERIFIED | High | G |
| 32 | Auth sign in email/password | `/account/signin` | Admin guard separate | Desktop inline login | Firebase + Auth Worker helper | PARTIALLY_IMPLEMENTED | Critical | B |
| 33 | Auth sign up email/password | `/account/signup` | N/A | Desktop inline signup | Firebase signUp, email verification API | PARTIALLY_IMPLEMENTED | Critical | B |
| 34 | Google sign in | Auth pages | Admin Google guard | N/A | Firebase Auth | IMPLEMENTED_NOT_VERIFIED | High | B |
| 35 | Password reset | Auth page | N/A | N/A | Firebase reset | IMPLEMENTED_NOT_VERIFIED | Medium | B |
| 36 | Email verification request | `/account/verify` | N/A | N/A | Auth Worker `account_email_verifications` | IMPLEMENTED_NOT_VERIFIED | High | B |
| 37 | Email verification status | Verify page | N/A | N/A | Auth Worker `/email-verification/status` | IMPLEMENTED_NOT_VERIFIED | Medium | B |
| 38 | Auth hydration/session persistence | `useAuthState`, production adapter | Admin guard | N/A | Firebase `onAuthStateChanged`; canonical account refresh after OTP | IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED | Critical | G |
| 39 | Route protection loading state | `RequireAuth` | `AdminGuard` | N/A | Adapter readiness; automated Phase B regression | IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED | Critical | G |
| 40 | Account portal overview | `/account` | N/A | N/A | Auth Worker subscription endpoint | PARTIALLY_IMPLEMENTED | High | B/C |
| 41 | Account profile identity | Portal settings | Admin user detail | Desktop runtime | Firebase UID + Auth Worker identity endpoint | IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED | High | C/G |
| 42 | Account devices page | `/account/devices` | Admin user detail sessions | Desktop app session | Auth Worker ownership checks + Supabase `app_sessions` | IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED | Medium | C/G |
| 43 | Desktop device start | N/A | Access requests | Desktop login gate | Auth Worker `device_login_sessions` | IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED | High | C/G |
| 44 | Desktop device complete via web | `/activate`, auth state | Access requests | Pending login | Auth Worker `/device/complete` | IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED | Critical | C/G |
| 45 | Desktop password complete | N/A | Access requests | Inline login/signup | Auth Worker `/device/password-complete` | IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED | Critical | C/G |
| 46 | Desktop poll | N/A | Access requests | Pending login | Auth Worker `/device/poll`; atomic consume/replay guard | IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED | Critical | C/G |
| 47 | Desktop session verify/refresh | Portal devices/sessions | Admin user detail sessions | Startup gate | Auth Worker `/session/verify`, `/session/refresh` | IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED | Critical | C/G |
| 48 | Desktop logout/revoke | Account devices/sessions | N/A | Desktop logout/account switch | Auth Worker session logout and owned revoke endpoints | IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED | Medium | C/G |
| 49 | No-subscription account state | Account portal | Admin subscriptions | Desktop startup | Explicit `linked` + `no_subscription`; policy denies paid access | IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED | Critical | C/G |
| 50 | Expired subscription state | Portal subscription | Admin subscriptions | Desktop startup | Explicit connection/entitlement split | IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED | Critical | C/G |
| 51 | Trialing/grace state | Pricing/signup/portal | Admin grant | Desktop entitlement | Explicit Auth/desktop states; broader subscription truth remains Phase E | PARTIALLY_IMPLEMENTED | High | E/G |
| 52 | Cancel-at-period-end state | Portal billing | Admin subscriptions | Desktop entitlement | Not in Auth enum | NOT_IMPLEMENTED | High | E |
| 53 | Lifetime subscription | Portal subscription | Admin grant | Desktop entitlement | `is_unlimited` metadata only | PARTIALLY_IMPLEMENTED | High | E/F |
| 54 | Subscription grant | N/A | Admin create subscription/manual grant | Desktop entitlement | Supabase `account_subscriptions`; deployed manual grant preview/execute | IMPLEMENTED_NOT_OPERATIONALLY_ACCEPTED | Critical | F/G |
| 55 | Subscription status update | N/A | Admin subscriptions table | Desktop entitlement | Supabase PATCH | IMPLEMENTED_NOT_VERIFIED | High | F |
| 56 | HWID reset | N/A | Admin subscriptions | Desktop entitlement | Supabase app_sessions revoke | IMPLEMENTED_NOT_VERIFIED | High | F |
| 57 | Access requests | N/A | Admin access requests | Desktop pending login | Supabase `device_login_sessions` | PARTIALLY_IMPLEMENTED | High | C/F |
| 58 | Promo codes | Pricing shell | Admin promos | N/A | Supabase `promo_codes` | PARTIALLY_IMPLEMENTED | Medium | E/F |
| 59 | Private tier / feature payload | N/A | Admin promos/subscription feature payload | Desktop policy | Supabase metadata, policy D1 features | PARTIALLY_IMPLEMENTED | High | E/F |
| 60 | Admin dashboard KPIs | N/A | Admin overview | N/A | Supabase reads | BROKEN | High | F |
| 61 | Admin recent activity | N/A | Admin overview raw JSON | N/A | Crashes + updates raw merge | BROKEN | Medium | F |
| 62 | Admin users list | N/A | Users routes mapped to subscriptions page | N/A | No true user table UI; must not represent users as subscription rows | PARTIALLY_IMPLEMENTED | High | F |
| 63 | Admin user detail | N/A | API exists in admin adapter | N/A | Supabase subscription/session/crashes | IMPLEMENTED_NOT_VERIFIED | Medium | F |
| 64 | Crash logs | N/A | Diagnostics page | Desktop crash reporter | Supabase `crash_logs` | IMPLEMENTED_NOT_VERIFIED | High | F/G |
| 65 | Crash groups | N/A | Diagnostics page | N/A | Admin Worker grouping | IMPLEMENTED_NOT_VERIFIED | Medium | F/G |
| 66 | Tamper alerts | N/A | Admin dashboard only | N/A | Supabase `tamper_alerts` | BACKEND_ONLY | Medium | F |
| 67 | Audit log | N/A | Admin audit page | N/A | R2 fallback + Supabase `admin_activity` | PARTIALLY_IMPLEMENTED | High | F |
| 68 | Policy global controls | N/A | Admin policies + old floating panel | Desktop policy gate | Policy Worker D1 | PARTIALLY_IMPLEMENTED | Critical | F |
| 69 | Old floating Policy Controls | N/A | Injected JS panel | N/A | Admin Worker proxy to Policy | DEPRECATED_OR_DEAD | High | F |
| 70 | Invite validation | Auth unlock flows | Policy admin | Desktop policy unlock | Policy Worker D1 invite tables | IMPLEMENTED_NOT_VERIFIED | Medium | F/G |
| 71 | Invite code admin management | N/A | Admin policies shell only | N/A | Policy Worker likely backend | BACKEND_ONLY | Medium | F |
| 72 | Kill switch / policy lock | System pages | Admin policies | Desktop startup gate | Policy Worker D1 | PARTIALLY_IMPLEMENTED | Critical | G |
| 73 | Disabled versions | System/update | Admin policies | Desktop policy gate | Policy Worker D1 | PARTIALLY_IMPLEMENTED | Critical | F/G |
| 74 | Release catalog visibility | Public releases/download | Admin policy old/new controls | Desktop update gate | Policy D1 release_catalog + R2 manifest | PARTIALLY_IMPLEMENTED | High | F/G |
| 75 | Legal pages | Public legal routes | Admin content shell | N/A | Static content adapter | IMPLEMENTED_NOT_VERIFIED | Low | E/F |
| 76 | Admin content editing | Public legal/FAQ | Admin content route | N/A | No real content backend found | UI_ONLY | Low | F |
| 77 | Notifications in customer portal | Portal notifications | Admin communications | N/A | No customer notification API found beyond email/support | UI_ONLY | Medium | D/F |
| 78 | Security settings | Portal settings/security | N/A | N/A | Firebase password reset only | PARTIALLY_IMPLEMENTED | Medium | B |
| 79 | Account deletion/danger zone | Portal settings | Admin users | Desktop data | No production deletion flow verified | NOT_IMPLEMENTED | Medium | F |
| 80 | Admin preauth | N/A | Admin preauth/session | N/A | Admin Worker preauth endpoints | IMPLEMENTED_NOT_VERIFIED | High | F/G |
| 81 | Admin route cleanup | N/A | `/communications` vs old `/admin/communications` | N/A | Router supports clean admin host paths | IMPLEMENTED_NOT_VERIFIED | Low | F |
| 82 | Desktop Google Drive OAuth config | N/A | N/A | Cloud backup auth | Auth Worker `/oauth/google-drive-config` | IMPLEMENTED_NOT_VERIFIED | Medium | G |
| 83 | Desktop policy check | N/A | Admin policies | Desktop startup/session | Policy Worker `/v1/policy/check` style routes | PARTIALLY_IMPLEMENTED | Critical | G |
| 84 | Desktop support bridge | Portal support separate | Admin support | In-app support | Policy Worker app support routes | IMPLEMENTED_NOT_VERIFIED | Medium | D/G |
| 85 | Desktop crash reporting | N/A | Diagnostics | Crash reporter | Admin Worker `/crash-logs` ingestion | IMPLEMENTED_NOT_VERIFIED | High | G |
| 86 | Product readiness coverage page | N/A | Admin `coverage` route exists in router only | N/A | No production backing | UI_ONLY | Low | F |
| 87 | Static legacy public pages | Root HTML files | N/A | N/A | Static files in web-platform root | DEPRECATED_OR_DEAD | Medium | E |
| 88 | No-subscription user projected as `monthly` | Customer portal subscription summary | Admin users/subscriptions projections | Desktop entitlement later | Subscription truth/projection defect; root cause intentionally deferred | BROKEN_NON_BLOCKING_PHASE_C | Critical for final correctness | E/G |
| 89 | Manual Grant daily admin UX | N/A | Grant subscription drawer | N/A | Admin Worker manual grant preview/execute | PARTIALLY_IMPLEMENTED | Medium | F |
| 90 | Subscription recovery action placement | N/A | Manual grant operation selector | N/A | `restore_remaining_time` operation | PARTIALLY_IMPLEMENTED | Medium | F |

Highest priority blockers:
1. Auth readiness/hydration can route signed-in users to the auth gate during refresh.
2. Phase C account linking no longer requires a subscription in local automated verification; production acceptance remains deferred to Phase G.
3. Desktop startup now separates `linked` from `no_subscription`; the Supabase session-independence migration is prepared but not yet applied.
4. No-subscription users can be projected as `monthly`; this belongs exclusively to Phase E subscription truth normalization, does not block Phase C, and has no separate dependency gate.
5. Subscription source of truth is split between Supabase/Auth/Admin and D1/Policy.
6. Subscription status vocabulary is incomplete for planned production states.
7. Admin Users and Subscriptions IA are conflated; this belongs to Phase F.
8. Admin dashboard and old Policy Controls still expose prototype/raw administration patterns.
