import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DependencyList,
} from "react";
import {
  Activity,
  Bug,
  CheckCircle2,
  RefreshCcw,
  ShieldAlert,
  Users,
} from "lucide-react";
import type {
  AdminAuditLogItem,
  AdminCrashGroup,
  AdminCrashLog,
  AdminDeviceChangePreview,
  AdminDeviceChangeRequest,
  AdminDeviceResetPreview,
  AdminInviteCode,
  AdminOperationPreview,
  AdminOperationReason,
  AdminSubscription,
  AdminTamperAlert,
  AdminUserDetail,
  AdminUserSummary,
  ManualGrantPreview,
  PendingSubscriptionGrant,
} from "../../../api/admin";
import { useAdapters } from "../../adapters/AdapterProvider";
import { useExperience } from "../../app/ExperienceProvider";
import { Button } from "../../components/ui/Button";
import {
  Card,
  DataTable,
  PageHeader,
  Pagination,
  SectionHeader,
  StatCard,
  TableToolbar,
  Timeline,
  type Column,
} from "../../components/ui/DataDisplay";
import {
  Alert,
  Badge,
  EmptyState,
  SkeletonStack,
} from "../../components/ui/Feedback";
import {
  FormField,
  Input,
  Select,
  Textarea,
} from "../../components/ui/FormControls";
import { Tabs } from "../../components/ui/Navigation";
import { Drawer, Modal } from "../../components/ui/Overlays";

type Resource<T> = {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => void;
};
type AccountAction = "suspend" | "reactivate" | "mark_pending_deletion";
type SubscriptionAction =
  | "suspend"
  | "resume"
  | "cancel_at_period_end"
  | "cancel_now"
  | "end_trial"
  | "correct_expiry"
  | "revoke_entitlement";
type OperationIntent =
  | { kind: "account"; uid: string; action: AccountAction }
  | {
      kind: "access";
      uid: string;
      scope: "session" | "device" | "all";
      targetId?: string;
    }
  | {
      kind: "subscription";
      subscriptionId: string;
      action: SubscriptionAction;
    };

function operationIntentKey(intent: OperationIntent | null) {
  if (!intent) return "operation:closed";
  if (intent.kind === "account") {
    return `account:${intent.uid}:${intent.action}`;
  }
  if (intent.kind === "access") {
    return `access:${intent.uid}:${intent.scope}:${intent.targetId || "all"}`;
  }
  return `subscription:${intent.subscriptionId}:${intent.action}`;
}

function useResource<T>(
  loader: () => Promise<T>,
  dependencies: DependencyList,
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError("");
      loader()
        .then((result) => {
          if (active) setData(result);
        })
        .catch((reason) => {
          if (active)
            setError(reason instanceof Error ? reason.message : "request_failed");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });
    return () => {
      active = false;
    };
    // The caller controls refresh dependencies explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, version]);
  return { data, loading, error, reload };
}

function copy(locale: "ar" | "en", en: string, ar: string) {
  return locale === "ar" ? ar : en;
}

function isCurrentSubscriptionRecord(subscription: AdminSubscription) {
  return subscription.is_current_record ?? subscription.is_current === true;
}

function subscriptionDisplayLifecycle(subscription: AdminSubscription) {
  return isCurrentSubscriptionRecord(subscription)
    ? subscription.subscription_projection?.lifecycle ||
        subscription.lifecycle_state ||
        subscription.status
    : subscription.lifecycle_state || subscription.status;
}

function adminMutationError(locale: "ar" | "en", value: unknown) {
  const code = value instanceof Error ? value.message : String(value || "");
  const messages: Record<string, [string, string]> = {
    pending_grant_already_exists: [
      "A pending grant already exists for this email.",
      "يوجد بالفعل منح معلّق لهذا البريد.",
    ],
    pending_grant_not_found: [
      "The pending grant was not found.",
      "لم يتم العثور على المنح المعلّق.",
    ],
    pending_grant_not_pending: [
      "This grant is no longer pending.",
      "هذا المنح لم يعد معلّقًا.",
    ],
    pending_grant_create_failed: [
      "The pending grant could not be created. Try again.",
      "تعذر إنشاء المنح المعلّق. حاول مرة أخرى.",
    ],
    pending_grant_cancel_failed: [
      "The pending grant could not be cancelled. Try again.",
      "تعذر إلغاء المنح المعلّق. حاول مرة أخرى.",
    ],
    preview_changed: [
      "The account state changed. Review the grant again.",
      "تغيّرت حالة الحساب. راجع المنح مرة أخرى.",
    ],
    historical_subscription_cannot_be_reactivated: [
      "This is a historical subscription. Open the current record or create a new grant.",
      "هذا اشتراك سابق. افتح السجل الحالي أو أنشئ منحًا جديدًا.",
    ],
    subscription_integrity_conflict: [
      "The subscription records conflict. Review the current record before continuing.",
      "توجد مشكلة في سجلات الاشتراك. راجع السجل الحالي قبل المتابعة.",
    ],
  };
  const message = messages[code] || [
    "The request could not be completed. Try again.",
    "تعذر إكمال الطلب. حاول مرة أخرى.",
  ];
  return copy(locale, message[0], message[1]);
}

function normalizedEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value: unknown) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail(value));
}

function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function date(value: unknown, locale: "ar" | "en") {
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed)
    : "—";
}

function statusLabel(value: unknown, locale: "ar" | "en") {
  const key = String(value || "").toLowerCase();
  const labels: Record<string, [string, string]> = {
    active: ["Active", "نشط"],
    suspended: ["Suspended", "معلّق"],
    pending_deletion: ["Pending deletion", "بانتظار الحذف"],
    deleted: ["Deleted", "محذوف"],
    none: ["No subscription", "لا يوجد اشتراك"],
    history_only: ["History only", "سجل سابق فقط"],
    integrity_conflict: ["Needs review", "يحتاج مراجعة"],
    entitled: ["Entitled", "مستحق"],
    not_entitled: ["Not entitled", "غير مستحق"],
    trialing: ["Trial", "فترة تجريبية"],
    expired: ["Expired", "منتهي"],
    cancel_at_period_end: ["Ends at period close", "ينتهي بنهاية الفترة"],
    cancelled: ["Cancelled", "ملغي"],
    past_due: ["Payment overdue", "دفعة متأخرة"],
    open: ["Open", "مفتوح"],
    investigating: ["Investigating", "قيد الفحص"],
    resolved: ["Resolved", "تم الحل"],
    ignored: ["Ignored", "متجاهل"],
    suspend: ["Suspend", "تعليق"],
    reactivate: ["Reactivate", "إعادة تفعيل"],
    mark_pending_deletion: ["Mark for deletion", "وضع علامة للحذف"],
    resume: ["Resume", "استئناف"],
    cancel_now: ["Cancel now", "إلغاء الآن"],
    end_trial: ["End trial", "إنهاء الفترة التجريبية"],
    correct_expiry: ["Correct expiry", "تصحيح الانتهاء"],
    revoke_entitlement: ["Revoke entitlement", "إلغاء الاستحقاق"],
    revoke_session: ["Revoke session", "إلغاء الجلسة"],
    revoke_device: ["Revoke device", "إلغاء الجهاز"],
    revoke_all: ["Revoke all access", "إلغاء كل الوصول"],
    admin_action: ["Administrative action", "إجراء إداري"],
    customer_request: ["Customer request", "طلب العميل"],
    security_review: ["Security review", "مراجعة أمنية"],
    technical_support: ["Technical support", "دعم فني"],
    billing_correction: ["Billing correction", "تصحيح اشتراك"],
    subscription_recovery: ["Subscription recovery", "استعادة اشتراك"],
    policy_enforcement: ["Policy enforcement", "تطبيق سياسة"],
    other: ["Other", "سبب آخر"],
    super_admin: ["Super admin", "مدير عام"],
    support: ["Support", "دعم"],
    billing: ["Billing", "اشتراكات"],
    release_manager: ["Release manager", "إدارة الإصدارات"],
    security_auditor: ["Security auditor", "مدقق أمان"],
    read_only: ["Read only", "قراءة فقط"],
    completed: ["Completed", "تم"],
    ready: ["Ready", "جاهز"],
    configured: ["Configured", "مجهز"],
    disabled: ["Disabled", "معطل"],
    missing: ["Missing", "غير متوفر"],
    migration_pending: ["Migration pending", "بانتظار الترحيل"],
    waiting_external_integration: ["Waiting for provider", "بانتظار المزود"],
    default_super_admin_compatibility: ["Compatibility mode", "وضع التوافق"],
    not_configured: ["Not configured", "غير مجهز"],
    pending_registration: ["Waiting for registration", "بانتظار التسجيل"],
    weekly: ["Weekly", "أسبوعي"],
    monthly: ["Monthly", "شهري"],
    annual: ["Annual", "سنوي"],
    lifetime: ["Lifetime", "مدى الحياة"],
    hours: ["hours", "ساعات"],
    days: ["days", "أيام"],
    weeks: ["weeks", "أسابيع"],
    months: ["months", "أشهر"],
    low: ["Low", "منخفض"],
    medium: ["Medium", "متوسط"],
    high: ["High", "مرتفع"],
    critical: ["Critical", "حرج"],
    mandatory: ["Mandatory", "إجباري"],
    optional: ["Optional", "اختياري"],
  };
  return labels[key]
    ? copy(locale, labels[key][0], labels[key][1])
    : String(value || "—").replaceAll("_", " ");
}

function tone(value: unknown) {
  const key = String(value || "").toLowerCase();
  if (
    [
      "active",
      "entitled",
      "resolved",
      "completed",
      "ready",
      "configured",
    ].includes(key)
  )
    return "success" as const;
  if (
    [
      "suspended",
      "expired",
      "cancelled",
      "critical",
      "integrity_conflict",
      "degraded",
      "missing",
    ].includes(key)
  )
    return "danger" as const;
  if (
    [
      "pending_deletion",
      "past_due",
      "investigating",
      "migration_pending",
      "waiting_external_integration",
    ].includes(key)
  )
    return "warning" as const;
  return "neutral" as const;
}

export function AdminOverviewPhaseF() {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const resource = useResource(() => admin.getDashboard(), [admin]);
  if (resource.loading && !resource.data) return <SkeletonStack rows={8} />;
  const kpis = resource.data?.kpis || {};
  const activity = resource.data?.recentActivity || [];
  return (
    <div className="stack">
      <PageHeader
        title={copy(locale, "Overview", "نظرة عامة")}
        actions={
          <Button
            onClick={resource.reload}
            leadingIcon={<RefreshCcw size={15} />}
          >
            {copy(locale, "Refresh", "تحديث")}
          </Button>
        }
      />
      {resource.error ? (
        <Alert
          title={copy(
            locale,
            "Could not load the dashboard",
            "تعذر تحميل لوحة المتابعة",
          )}
          tone="danger"
        >
          {resource.error}
        </Alert>
      ) : null}
      {resource.data?.degradedResources?.length ? (
        <Alert
          title={copy(
            locale,
            "Some metrics are delayed",
            "بعض المؤشرات متأخرة",
          )}
          tone="warning"
        >
          {resource.data.degradedResources.join(", ")}
        </Alert>
      ) : null}
      <div className="admin-metric-strip">
        <StatCard
          label={copy(locale, "Users", "المستخدمون")}
          value={kpis.total_users ?? "—"}
          icon={<Users size={17} />}
        />
        <StatCard
          label={copy(locale, "Active subscriptions", "الاشتراكات النشطة")}
          value={kpis.total_active_users ?? "—"}
          icon={<CheckCircle2 size={17} />}
        />
        <StatCard
          label={copy(locale, "Active sessions", "الجلسات النشطة")}
          value={kpis.active_sessions ?? "—"}
          icon={<Activity size={17} />}
        />
        <StatCard
          label={copy(locale, "Open crash groups", "مجموعات الأعطال المفتوحة")}
          value={kpis.unresolved_crash_groups ?? "—"}
          icon={<Bug size={17} />}
        />
      </div>
      <Card>
        <SectionHeader
          title={copy(locale, "Recent admin activity", "آخر نشاط إداري")}
        />
        {activity.length ? (
          <Timeline
            items={activity.map((item) => ({
              title: statusLabel(item.action, locale),
              body: [item.actor, item.target_type, item.target_id]
                .filter(Boolean)
                .join(" · "),
              time: date(item.timestamp, locale),
              tone: item.outcome === "completed" ? "brand" : "neutral",
            }))}
          />
        ) : (
          <EmptyState
            title={copy(locale, "No activity yet", "لا يوجد نشاط بعد")}
            body={copy(
              locale,
              "Administrative actions will appear here.",
              "ستظهر الإجراءات الإدارية هنا.",
            )}
          />
        )}
      </Card>
    </div>
  );
}

export function AdminUsersPhaseF() {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [accountStatus, setAccountStatus] = useState("");
  const [subscription, setSubscription] = useState("");
  const [selected, setSelected] = useState<AdminUserSummary | null>(null);
  const [selectedDeviceChange, setSelectedDeviceChange] =
    useState<AdminDeviceChangeRequest | null>(null);
  const resource = useResource(
    () =>
      admin.listUsers({
        search,
        page,
        limit: 25,
        accountStatus,
        subscription,
        sort: "activity_desc",
      }),
    [admin, search, page, accountStatus, subscription],
  );
  const deviceChanges = useResource(
    () => admin.listDeviceChangeRequests("pending"),
    [admin],
  );
  const columns: Column<AdminUserSummary>[] = [
    {
      key: "user",
      header: copy(locale, "User", "المستخدم"),
      render: (row) => (
        <div>
          <strong>{row.display_name || row.email}</strong>
          <small className="block secondary">{row.email}</small>
        </div>
      ),
    },
    {
      key: "account",
      header: copy(locale, "Account", "الحساب"),
      render: (row) => (
        <Badge tone={tone(row.account_status)}>
          {statusLabel(row.account_status, locale)}
        </Badge>
      ),
    },
    {
      key: "subscription",
      header: copy(locale, "Subscription", "الاشتراك"),
      render: (row) => (
        <Badge tone={tone(row.subscription_presence)}>
          {statusLabel(row.subscription_presence, locale)}
        </Badge>
      ),
    },
    {
      key: "sessions",
      header: copy(locale, "Sessions / devices", "الجلسات / الأجهزة"),
      render: (row) => `${row.session_count || 0} / ${row.device_count || 0}`,
    },
    {
      key: "activity",
      header: copy(locale, "Last activity", "آخر نشاط"),
      render: (row) => date(row.last_activity_at, locale),
    },
  ];
  const deviceChangeColumns: Column<AdminDeviceChangeRequest>[] = [
    {
      key: "account",
      header: copy(locale, "Account", "الحساب"),
      render: (row) => (
        <div>
          <strong>{row.account?.display_name || row.account?.normalized_email || row.firebase_uid}</strong>
          <small className="block secondary">{row.account?.normalized_email || row.firebase_uid}</small>
        </div>
      ),
    },
    {
      key: "device",
      header: copy(locale, "Requested device", "الجهاز المطلوب"),
      render: (row) => (
        <div>
          <strong>{row.device_name || copy(locale, "Desktop device", "جهاز سطح مكتب")}</strong>
          <small className="block secondary">{[row.platform, row.os_version].filter(Boolean).join(" · ")}</small>
        </div>
      ),
    },
    {
      key: "requested",
      header: copy(locale, "Requested", "تاريخ الطلب"),
      render: (row) => date(row.requested_at, locale),
    },
    {
      key: "action",
      header: copy(locale, "Action", "الإجراء"),
      render: (row) => (
        <Button size="sm" onClick={() => setSelectedDeviceChange(row)}>
          {copy(locale, "Review", "مراجعة")}
        </Button>
      ),
    },
  ];
  return (
    <div className="stack">
      <PageHeader title={copy(locale, "Users", "المستخدمون")} />
      <section>
        <SectionHeader
          title={copy(locale, "Device change requests", "طلبات تغيير الجهاز")}
        />
        {deviceChanges.error ? (
          <Alert title={copy(locale, "Could not load device requests", "تعذر تحميل طلبات الأجهزة")} tone="danger">
            {deviceChanges.error}
          </Alert>
        ) : (
          <DataTable
            columns={deviceChangeColumns}
            rows={deviceChanges.data || []}
            loading={deviceChanges.loading}
            rowKey={(row) => row.id}
            emptyTitle={copy(locale, "No pending device changes", "لا توجد طلبات تغيير معلقة")}
            emptyBody=""
          />
        )}
      </section>
      <TableToolbar
        searchLabel={copy(
          locale,
          "Search by name, email, or UID",
          "ابحث بالاسم أو البريد أو المعرّف",
        )}
        searchValue={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        filters={
          <>
            <Select
              aria-label={copy(locale, "Account status", "حالة الحساب")}
              value={accountStatus}
              onChange={(event) => {
                setAccountStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">
                {copy(locale, "All account states", "كل حالات الحساب")}
              </option>
              <option value="active">{statusLabel("active", locale)}</option>
              <option value="suspended">
                {statusLabel("suspended", locale)}
              </option>
              <option value="pending_deletion">
                {statusLabel("pending_deletion", locale)}
              </option>
            </Select>
            <Select
              aria-label={copy(
                locale,
                "Subscription presence",
                "وجود الاشتراك",
              )}
              value={subscription}
              onChange={(event) => {
                setSubscription(event.target.value);
                setPage(1);
              }}
            >
              <option value="">
                {copy(locale, "All subscription states", "كل حالات الاشتراك")}
              </option>
              <option value="none">{statusLabel("none", locale)}</option>
              <option value="active">{statusLabel("active", locale)}</option>
              <option value="history_only">
                {statusLabel("history_only", locale)}
              </option>
              <option value="integrity_conflict">
                {statusLabel("integrity_conflict", locale)}
              </option>
            </Select>
          </>
        }
      />
      {resource.error ? (
        <Alert
          title={copy(locale, "Could not load users", "تعذر تحميل المستخدمين")}
          tone="danger"
        >
          {resource.error}
        </Alert>
      ) : (
        <DataTable
          columns={columns}
          rows={resource.data?.items || []}
          loading={resource.loading}
          rowKey={(row) => row.firebase_uid}
          onRowClick={setSelected}
          emptyTitle={copy(locale, "No users found", "لا يوجد مستخدمون")}
          emptyBody={copy(
            locale,
            "Change the search or filters.",
            "غيّر البحث أو عوامل التصفية.",
          )}
        />
      )}
      {resource.data ? (
        <Pagination
          page={page}
          pages={Math.max(
            1,
            Math.ceil(resource.data.total / resource.data.limit),
          )}
          label={copy(
            locale,
            `${resource.data.total} users`,
            `${resource.data.total} مستخدم`,
          )}
          previousLabel={copy(locale, "Previous", "السابق")}
          nextLabel={copy(locale, "Next", "التالي")}
          onChange={setPage}
        />
      ) : null}
      <UserDetailDrawer
        user={selected}
        onClose={() => setSelected(null)}
        onChanged={resource.reload}
      />
      <DeviceChangeDialog
        key={selectedDeviceChange?.id || "device-change:closed"}
        request={selectedDeviceChange}
        onClose={() => setSelectedDeviceChange(null)}
        onChanged={() => {
          setSelectedDeviceChange(null);
          deviceChanges.reload();
          resource.reload();
        }}
      />
    </div>
  );
}

function UserDetailDrawer({
  user,
  onClose,
  onChanged,
}: {
  user: AdminUserSummary | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const detail = useResource(
    () =>
      user
        ? admin.getUserDetail(user.firebase_uid)
        : Promise.resolve(null as unknown as AdminUserDetail),
    [admin, user?.firebase_uid],
  );
  const [operation, setOperation] = useState<OperationIntent | null>(null);
  const [recoveryEvidence, setRecoveryEvidence] = useState<
    NonNullable<AdminUserDetail["recovery_evidence"]>[number] | null
  >(null);
  const [deviceResetOpen, setDeviceResetOpen] = useState(false);
  const data = detail.data;
  const profile = data?.profile || user;
  const closeOperation = () => setOperation(null);
  const changed = () => {
    closeOperation();
    detail.reload();
    onChanged();
  };
  return (
    <>
      <Drawer
        open={Boolean(user)}
        onClose={onClose}
        title={
          profile?.display_name ||
          profile?.email ||
          copy(locale, "User details", "تفاصيل المستخدم")
        }
        description={profile?.email || undefined}
        closeLabel={copy(locale, "Close", "إغلاق")}
      >
        <div className="stack">
          {detail.loading ? (
            <SkeletonStack rows={8} />
          ) : detail.error ? (
            <Alert
              title={copy(
                locale,
                "Could not load user details",
                "تعذر تحميل تفاصيل المستخدم",
              )}
              tone="danger"
            >
              {detail.error}
            </Alert>
          ) : data ? (
            <>
              <section>
                <SectionHeader title={copy(locale, "Identity", "الهوية")} />
                <dl className="detail-list">
                  <div>
                    <dt>{copy(locale, "Firebase UID", "معرّف Firebase")}</dt>
                    <dd className="mono">{data.profile.firebase_uid}</dd>
                  </div>
                  <div>
                    <dt>{copy(locale, "Verification", "التحقق")}</dt>
                    <dd>
                      {data.profile.email_verified_at
                        ? date(data.profile.email_verified_at, locale)
                        : copy(locale, "Not verified", "غير متحقق")}
                    </dd>
                  </div>
                  <div>
                    <dt>{copy(locale, "Locale", "اللغة")}</dt>
                    <dd>{data.profile.locale || "—"}</dd>
                  </div>
                  <div>
                    <dt>{copy(locale, "Account status", "حالة الحساب")}</dt>
                    <dd>
                      <Badge tone={tone(data.profile.account_status)}>
                        {statusLabel(data.profile.account_status, locale)}
                      </Badge>
                    </dd>
                  </div>
                </dl>
              </section>
              <section>
                <SectionHeader
                  title={copy(locale, "Subscription", "الاشتراك")}
                />
                <dl className="detail-list">
                  <div>
                    <dt>{copy(locale, "Entitlement", "الاستحقاق")}</dt>
                    <dd>
                      {statusLabel(
                        data.subscription_projection?.entitlement,
                        locale,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{copy(locale, "Plan", "الخطة")}</dt>
                    <dd>
                      {data.subscription_projection?.plan_term ||
                        copy(locale, "No subscription", "لا يوجد اشتراك")}
                    </dd>
                  </div>
                  <div>
                    <dt>{copy(locale, "History records", "سجلات الاشتراك")}</dt>
                    <dd>{data.subscription_history?.length || 0}</dd>
                  </div>
                  <div>
                    <dt>{copy(locale, "Integrity", "سلامة البيانات")}</dt>
                    <dd>{data.subscription_integrity?.integrity || "ok"}</dd>
                  </div>
                </dl>
              </section>
              <section>
                <SectionHeader
                  title={copy(
                    locale,
                    "Desktop device",
                    "جهاز سطح المكتب",
                  )}
                  action={
                    <div className="cluster">
                      {data.device_binding ? (
                        <Button size="sm" variant="danger" onClick={() => setDeviceResetOpen(true)}>
                          {copy(locale, "Reset device", "إعادة ضبط الجهاز")}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        onClick={() =>
                          setOperation({
                            kind: "access",
                            uid: data.profile.firebase_uid,
                            scope: "all",
                          })
                        }
                      >
                        {copy(locale, "End sessions", "إنهاء الجلسات")}
                      </Button>
                    </div>
                  }
                />
                {data.device_binding ? (
                  <dl className="detail-list">
                    <div><dt>{copy(locale, "Device", "الجهاز")}</dt><dd>{data.device_binding.device_name || data.device_binding.device_key}</dd></div>
                    <div><dt>{copy(locale, "Platform", "النظام")}</dt><dd>{[data.device_binding.platform, data.device_binding.os_version].filter(Boolean).join(" · ") || "—"}</dd></div>
                    <div><dt>{copy(locale, "Linked", "تاريخ الربط")}</dt><dd>{date(data.device_binding.bound_at, locale)}</dd></div>
                    <div><dt>{copy(locale, "Last activity", "آخر نشاط")}</dt><dd>{date(data.device_binding.last_seen_at, locale)}</dd></div>
                  </dl>
                ) : (
                  <EmptyState title={copy(locale, "No linked desktop device", "لا يوجد جهاز سطح مكتب مرتبط")} body="" />
                )}
                {data.device_change_requests?.length ? (
                  <DataTable
                    columns={[
                      { key: "device", header: copy(locale, "Requested device", "الجهاز المطلوب"), render: (row) => row.device_name || row.requested_device_key },
                      { key: "status", header: copy(locale, "Status", "الحالة"), render: (row) => <Badge tone={tone(row.status)}>{statusLabel(row.status, locale)}</Badge> },
                      { key: "requested", header: copy(locale, "Requested", "تاريخ الطلب"), render: (row) => date(row.requested_at, locale) },
                    ]}
                    rows={data.device_change_requests}
                    rowKey={(row) => row.id}
                    emptyTitle=""
                    emptyBody=""
                  />
                ) : null}
              </section>
              <section>
                <SectionHeader title={copy(locale, "Sessions", "الجلسات")} />
                <DataTable
                  columns={[
                    {
                      key: "device",
                      header: copy(locale, "Device", "الجهاز"),
                      render: (row: Record<string, unknown>) =>
                        String(row.device_key || "—"),
                    },
                    {
                      key: "created",
                      header: copy(locale, "Created", "الإنشاء"),
                      render: (row) => date(row.created_at, locale),
                    },
                    {
                      key: "activity",
                      header: copy(locale, "Last activity", "آخر نشاط"),
                      render: (row) => date(row.last_seen_at, locale),
                    },
                    {
                      key: "status",
                      header: copy(locale, "Status", "الحالة"),
                      render: (row) => (
                        <Badge tone={row.revoked_at ? "neutral" : "success"}>
                          {row.revoked_at
                            ? copy(locale, "Revoked", "ملغاة")
                            : copy(locale, "Active", "نشطة")}
                        </Badge>
                      ),
                    },
                    {
                      key: "action",
                      header: copy(locale, "Action", "الإجراء"),
                      render: (row) =>
                        row.revoked_at ? (
                          "—"
                        ) : (
                          <Button
                            size="sm"
                            onClick={() =>
                              setOperation({
                                kind: "access",
                                uid: data.profile.firebase_uid,
                                scope: "session",
                                targetId: String(row.id || ""),
                              })
                            }
                          >
                            {copy(locale, "Revoke", "إلغاء")}
                          </Button>
                        ),
                    },
                  ]}
                  rows={data.sessions || []}
                  rowKey={(row) => String(row.id)}
                  emptyTitle={copy(locale, "No sessions", "لا توجد جلسات")}
                  emptyBody={copy(
                    locale,
                    "This account has no recorded app sessions.",
                    "لا توجد جلسات مسجلة لهذا الحساب.",
                  )}
                />
              </section>
              <section>
                <SectionHeader
                  title={copy(locale, "Access requests", "طلبات الوصول")}
                />
                <DataTable
                  columns={[
                    {
                      key: "device",
                      header: copy(locale, "Device", "الجهاز"),
                      render: (row: Record<string, unknown>) =>
                        String(row.device_key || "—"),
                    },
                    {
                      key: "status",
                      header: copy(locale, "Status", "الحالة"),
                      render: (row) => (
                        <Badge tone={tone(row.status)}>
                          {statusLabel(row.status, locale)}
                        </Badge>
                      ),
                    },
                    {
                      key: "created",
                      header: copy(locale, "Created", "الإنشاء"),
                      render: (row) => date(row.created_at, locale),
                    },
                    {
                      key: "expiry",
                      header: copy(locale, "Expiry", "الانتهاء"),
                      render: (row) => date(row.expires_at, locale),
                    },
                  ]}
                  rows={data.login_requests || []}
                  rowKey={(row) => String(row.id)}
                  emptyTitle={copy(
                    locale,
                    "No access requests",
                    "لا توجد طلبات وصول",
                  )}
                  emptyBody={copy(
                    locale,
                    "Device login requests will appear here.",
                    "ستظهر طلبات ربط الأجهزة هنا.",
                  )}
                />
              </section>
              <section>
                <SectionHeader title={copy(locale, "Support", "الدعم")} />
                <DataTable
                  columns={[
                    {
                      key: "subject",
                      header: copy(locale, "Subject", "الموضوع"),
                      render: (row) => row.subject,
                    },
                    {
                      key: "status",
                      header: copy(locale, "Status", "الحالة"),
                      render: (row) => (
                        <Badge tone={tone(row.status)}>
                          {statusLabel(row.status, locale)}
                        </Badge>
                      ),
                    },
                    {
                      key: "priority",
                      header: copy(locale, "Priority", "الأولوية"),
                      render: (row) => statusLabel(row.priority, locale),
                    },
                    {
                      key: "updated",
                      header: copy(locale, "Updated", "آخر تحديث"),
                      render: (row) => date(row.updated_at, locale),
                    },
                  ]}
                  rows={data.support_threads || []}
                  rowKey={(row) => row.id}
                  emptyTitle={copy(
                    locale,
                    "No support threads",
                    "لا توجد محادثات دعم",
                  )}
                  emptyBody={copy(
                    locale,
                    "Support conversations for this account will appear here.",
                    "ستظهر محادثات الدعم الخاصة بهذا الحساب هنا.",
                  )}
                />
              </section>
              {data.recovery_evidence?.some(
                (item) => item.status === "available",
              ) ? (
                <section>
                  <SectionHeader
                    title={copy(
                      locale,
                      "Subscription recovery",
                      "استعادة الاشتراك",
                    )}
                  />
                  <DataTable
                    columns={[
                      {
                        key: "source",
                        header: copy(locale, "Evidence", "المرجع"),
                        render: (row) => row.evidence_type,
                      },
                      {
                        key: "remaining",
                        header: copy(
                          locale,
                          "Remaining time",
                          "المدة المتبقية",
                        ),
                        render: (row) =>
                          copy(
                            locale,
                            `${Math.ceil(row.remaining_seconds / 86400)} days`,
                            `${Math.ceil(row.remaining_seconds / 86400)} يوم`,
                          ),
                      },
                      {
                        key: "expiry",
                        header: copy(
                          locale,
                          "Evidence expiry",
                          "انتهاء المرجع",
                        ),
                        render: (row) => date(row.expires_at, locale),
                      },
                      {
                        key: "action",
                        header: copy(locale, "Action", "الإجراء"),
                        render: (row) => (
                          <Button
                            size="sm"
                            onClick={() => setRecoveryEvidence(row)}
                          >
                            {copy(locale, "Restore time", "استعادة المدة")}
                          </Button>
                        ),
                      },
                    ]}
                    rows={data.recovery_evidence.filter(
                      (item) => item.status === "available",
                    )}
                    rowKey={(row) => row.id}
                    emptyTitle={copy(
                      locale,
                      "No recovery evidence",
                      "لا يوجد مرجع للاستعادة",
                    )}
                    emptyBody=""
                  />
                </section>
              ) : null}
              <section>
                <SectionHeader title={copy(locale, "Diagnostics", "التشخيص")} />
                <div className="admin-metric-strip">
                  <StatCard
                    label={copy(locale, "Recent crashes", "الأعطال الحديثة")}
                    value={data.crashes.length}
                  />
                  <StatCard
                    label={copy(locale, "Tamper alerts", "تنبيهات العبث")}
                    value={
                      data.tamper_alerts?.filter((item) => !item.resolved)
                        .length || 0
                    }
                  />
                  <StatCard
                    label={copy(locale, "Admin actions", "إجراءات الإدارة")}
                    value={data.audit?.length || 0}
                  />
                </div>
              </section>
              <section className="danger-zone">
                <SectionHeader
                  title={copy(locale, "Account actions", "إجراءات الحساب")}
                />
                <div className="cluster">
                  <Button
                    onClick={() =>
                      setOperation({
                        kind: "account",
                        uid: data.profile.firebase_uid,
                        action:
                          data.profile.account_status === "suspended"
                            ? "reactivate"
                            : "suspend",
                      })
                    }
                  >
                    {data.profile.account_status === "suspended"
                      ? copy(locale, "Reactivate account", "إعادة تفعيل الحساب")
                      : copy(locale, "Suspend account", "تعليق الحساب")}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      setOperation({
                        kind: "account",
                        uid: data.profile.firebase_uid,
                        action: "mark_pending_deletion",
                      })
                    }
                  >
                    {copy(locale, "Mark for deletion", "وضع علامة للحذف")}
                  </Button>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </Drawer>
      <AdminOperationDialog
        key={operationIntentKey(operation)}
        intent={operation}
        onClose={closeOperation}
        onChanged={changed}
      />
      <SubscriptionRecoveryDrawer
        key={recoveryEvidence ? `recovery:${String(recoveryEvidence.subscription_id || "unknown")}` : "recovery:closed"}
        evidence={recoveryEvidence}
        user={data || null}
        onClose={() => setRecoveryEvidence(null)}
        onChanged={() => {
          setRecoveryEvidence(null);
          changed();
        }}
      />
      <DeviceResetDialog
        key={deviceResetOpen ? `device-reset:${data?.profile.firebase_uid || "unknown"}` : "device-reset:closed"}
        open={deviceResetOpen}
        user={data || null}
        onClose={() => setDeviceResetOpen(false)}
        onChanged={() => {
          setDeviceResetOpen(false);
          changed();
        }}
      />
    </>
  );
}

function DeviceChangeDialog({
  request,
  onClose,
  onChanged,
}: {
  request: AdminDeviceChangeRequest | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const [action, setAction] = useState<"approve" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<AdminDeviceChangePreview | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const review = async () => {
    if (!request || reason.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      setPreview(await admin.previewDeviceChange(request.id, { action, reason: reason.trim() }));
    } catch (failure) {
      setPreview(null);
      setError(failure instanceof Error ? failure.message : "device_change_preview_failed");
    } finally {
      setBusy(false);
    }
  };
  const execute = async () => {
    if (!request || !preview) return;
    setBusy(true);
    setError("");
    try {
      await admin.executeDeviceChange(request.id, {
        action,
        reason: reason.trim(),
        preview_hash: preview.preview_hash,
        request_id: requestId,
      });
      onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "device_change_failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={Boolean(request)}
      onClose={onClose}
      title={copy(locale, "Review device change", "مراجعة تغيير الجهاز")}
      closeLabel={copy(locale, "Close", "إغلاق")}
      footer={
        <>
          <Button onClick={review} disabled={busy || reason.trim().length < 3}>{copy(locale, "Review changes", "مراجعة التغييرات")}</Button>
          <Button variant={action === "approve" ? "primary" : "danger"} onClick={execute} disabled={!preview || busy}>{action === "approve" ? copy(locale, "Approve", "موافقة") : copy(locale, "Reject", "رفض")}</Button>
        </>
      }
    >
      <div className="stack">
        <dl className="detail-list">
          <div><dt>{copy(locale, "Account", "الحساب")}</dt><dd>{request?.account?.normalized_email || request?.firebase_uid || "—"}</dd></div>
          <div><dt>{copy(locale, "Requested device", "الجهاز المطلوب")}</dt><dd>{request?.device_name || request?.requested_device_key || "—"}</dd></div>
          <div><dt>{copy(locale, "User reason", "سبب المستخدم")}</dt><dd>{request?.user_reason || "—"}</dd></div>
        </dl>
        <FormField label={copy(locale, "Decision", "القرار")}>
          <Select value={action} onChange={(event) => { setAction(event.target.value as "approve" | "reject"); setPreview(null); }}>
            <option value="approve">{copy(locale, "Approve", "موافقة")}</option>
            <option value="reject">{copy(locale, "Reject", "رفض")}</option>
          </Select>
        </FormField>
        <FormField label={copy(locale, "Reason", "السبب")} required>
          <Textarea value={reason} maxLength={1000} onChange={(event) => { setReason(event.target.value); setPreview(null); }} />
        </FormField>
        {preview ? <Alert title={copy(locale, "Decision preview", "معاينة القرار")} tone={action === "approve" ? "warning" : "danger"}>{action === "approve" ? copy(locale, "The current device sessions will be revoked and the requested device will become the only linked device.", "ستُلغى جلسات الجهاز الحالي وسيصبح الجهاز المطلوب هو الجهاز الوحيد المرتبط.") : copy(locale, "The requested desktop device will remain blocked.", "سيظل جهاز سطح المكتب المطلوب محظورًا.")}</Alert> : null}
        {error ? <Alert title={copy(locale, "Could not complete the request", "تعذر إكمال الطلب")} tone="danger">{error}</Alert> : null}
      </div>
    </Modal>
  );
}

function DeviceResetDialog({
  open,
  user,
  onClose,
  onChanged,
}: {
  open: boolean;
  user: AdminUserDetail | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<AdminDeviceResetPreview | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const review = async () => {
    if (!user || reason.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      setPreview(await admin.previewDeviceReset(user.profile.firebase_uid, reason.trim()));
    } catch (failure) {
      setPreview(null);
      setError(failure instanceof Error ? failure.message : "device_reset_preview_failed");
    } finally {
      setBusy(false);
    }
  };
  const execute = async () => {
    if (!user || !preview) return;
    setBusy(true);
    setError("");
    try {
      await admin.executeDeviceReset(user.profile.firebase_uid, { reason: reason.trim(), preview_hash: preview.preview_hash, request_id: requestId });
      onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "device_reset_failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={copy(locale, "Reset linked device", "إعادة ضبط الجهاز المرتبط")}
      closeLabel={copy(locale, "Close", "إغلاق")}
      footer={<><Button onClick={review} disabled={busy || reason.trim().length < 3}>{copy(locale, "Review changes", "مراجعة التغييرات")}</Button><Button variant="danger" onClick={execute} disabled={!preview || busy}>{copy(locale, "Reset device", "إعادة ضبط الجهاز")}</Button></>}
    >
      <div className="stack">
        <dl className="detail-list"><div><dt>{copy(locale, "Current device", "الجهاز الحالي")}</dt><dd>{user?.device_binding?.device_name || user?.device_binding?.device_key || "—"}</dd></div></dl>
        <FormField label={copy(locale, "Reason", "السبب")} required><Textarea value={reason} maxLength={1000} onChange={(event) => { setReason(event.target.value); setPreview(null); }} /></FormField>
        {preview ? <Alert title={copy(locale, "Reset preview", "معاينة إعادة الضبط")} tone="danger">{copy(locale, `${preview.active_session_count} active sessions will be revoked. The next desktop sign-in will bind the new device.`, `سيتم إلغاء ${preview.active_session_count} جلسة نشطة. سيربط تسجيل الدخول التالي الجهاز الجديد.`)}</Alert> : null}
        {error ? <Alert title={copy(locale, "Could not reset the device", "تعذر إعادة ضبط الجهاز")} tone="danger">{error}</Alert> : null}
      </div>
    </Modal>
  );
}

function SubscriptionRecoveryDrawer({
  evidence,
  user,
  onClose,
  onChanged,
}: {
  evidence: NonNullable<AdminUserDetail["recovery_evidence"]>[number] | null;
  user: AdminUserDetail | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const source = user?.subscription_history?.find(
    (row) => String(row.id || "") === String(evidence?.subscription_id || ""),
  );
  const inferred = String(source?.plan_term || source?.plan || "monthly");
  const [plan, setPlan] = useState<
    "weekly" | "monthly" | "annual" | "lifetime"
  >(() =>
    inferred === "weekly" || inferred === "annual" || inferred === "lifetime"
      ? inferred
      : "monthly",
  );
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<ManualGrantPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const input =
    evidence && user
      ? {
          target_firebase_uid: user.profile.firebase_uid,
          target_email: user.profile.email,
          operation_type: "restore_remaining_time" as const,
          plan,
          duration_mode:
            plan === "lifetime" ? ("lifetime" as const) : ("duration" as const),
          duration_value: 1,
          duration_unit: "days" as const,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          reason_code: "subscription_recovery" as const,
          reason_note: note.trim() || undefined,
          recovery_evidence_id: evidence.id,
        }
      : null;
  const review = async () => {
    if (!input) return;
    setBusy(true);
    setError("");
    try {
      setPreview(await admin.previewManualGrant(input));
    } catch (failure) {
      setPreview(null);
      setError(
        failure instanceof Error ? failure.message : "recovery_preview_failed",
      );
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    if (!input || !preview) return;
    setBusy(true);
    setError("");
    try {
      await admin.executeManualGrant({
        ...input,
        reason: note.trim() || "subscription_recovery",
        idempotency_key: idempotencyKey,
        preview_hash: preview.preview_hash,
      });
      setIdempotencyKey(crypto.randomUUID());
      onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "recovery_failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={Boolean(evidence)}
      onClose={onClose}
      title={copy(
        locale,
        "Restore previous subscription time",
        "استعادة مدة اشتراك سابقة",
      )}
      description={copy(
        locale,
        "Review the evidence and resulting expiry before confirming.",
        "راجع المرجع وتاريخ الانتهاء الناتج قبل التأكيد.",
      )}
      closeLabel={copy(locale, "Close", "إغلاق")}
      footer={
        <>
          <Button onClick={review} disabled={busy}>
            {copy(locale, "Review changes", "مراجعة التغييرات")}
          </Button>
          <Button
            variant="primary"
            onClick={restore}
            disabled={!preview || preview.blocked || busy}
          >
            {copy(locale, "Restore time", "استعادة المدة")}
          </Button>
        </>
      }
    >
      <div className="stack">
        <dl className="detail-list">
          <div>
            <dt>{copy(locale, "Evidence", "المرجع")}</dt>
            <dd>{evidence?.evidence_type || "—"}</dd>
          </div>
          <div>
            <dt>{copy(locale, "Remaining time", "المدة المتبقية")}</dt>
            <dd>
              {evidence
                ? copy(
                    locale,
                    `${Math.ceil(evidence.remaining_seconds / 86400)} days`,
                    `${Math.ceil(evidence.remaining_seconds / 86400)} يوم`,
                  )
                : "—"}
            </dd>
          </div>
        </dl>
        <FormField label={copy(locale, "Plan", "الخطة")}>
          <Select
            value={plan}
            onChange={(event) => {
              setPlan(event.target.value as typeof plan);
              setPreview(null);
            }}
          >
            <option value="weekly">{copy(locale, "Weekly", "أسبوعي")}</option>
            <option value="monthly">{copy(locale, "Monthly", "شهري")}</option>
            <option value="annual">{copy(locale, "Annual", "سنوي")}</option>
            <option value="lifetime">
              {copy(locale, "Lifetime", "مدى الحياة")}
            </option>
          </Select>
        </FormField>
        <FormField label={copy(locale, "Note", "ملاحظة")}>
          <Textarea
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setPreview(null);
            }}
          />
        </FormField>
        {preview ? (
          <Alert
            title={copy(locale, "Recovery preview", "معاينة الاستعادة")}
            tone={preview.blocked ? "danger" : "info"}
          >
            {copy(
              locale,
              `New expiry: ${date(preview.proposed_state.expires_at, locale)}`,
              `الانتهاء الجديد: ${date(preview.proposed_state.expires_at, locale)}`,
            )}
          </Alert>
        ) : null}
        {error ? (
          <Alert
            title={copy(
              locale,
              "Could not restore the subscription",
              "تعذر استعادة الاشتراك",
            )}
            tone="danger"
          >
            {error}
          </Alert>
        ) : null}
      </div>
    </Drawer>
  );
}

export function AdminSubscriptionsPhaseF() {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [current, setCurrent] = useState("current");
  const [lifecycle, setLifecycle] = useState("");
  const [selected, setSelected] = useState<AdminSubscription | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [pendingToCancel, setPendingToCancel] = useState<PendingSubscriptionGrant | null>(null);
  const resource = useResource(
    () =>
      admin.listSubscriptions({ search, page, limit: 25, current, lifecycle }),
    [admin, search, page, current, lifecycle],
  );
  const pendingGrants = useResource(
    () => admin.listPendingSubscriptionGrants("pending"),
    [admin],
  );
  const columns: Column<AdminSubscription>[] = [
    {
      key: "user",
      header: copy(locale, "User", "المستخدم"),
      render: (row) => row.user_email || row.firebase_user_id || "—",
    },
    {
      key: "term",
      header: copy(locale, "Plan", "الخطة"),
      render: (row) =>
        row.plan_term || row.subscription_projection?.plan_term || row.plan,
    },
    {
      key: "lifecycle",
      header: copy(locale, "Lifecycle", "دورة الاشتراك"),
      render: (row) => (
        <Badge tone={tone(subscriptionDisplayLifecycle(row))}>
          {statusLabel(subscriptionDisplayLifecycle(row), locale)}
        </Badge>
      ),
    },
    {
      key: "source",
      header: copy(locale, "Source", "المصدر"),
      render: (row) => row.source_type || row.provider || "—",
    },
    {
      key: "end",
      header: copy(locale, "Period end", "نهاية الفترة"),
      render: (row) =>
        row.plan_term === "lifetime"
          ? copy(locale, "Lifetime", "مدى الحياة")
          : date(row.period_end_at || row.expires_at, locale),
    },
    {
      key: "current",
      header: copy(locale, "Record", "السجل"),
      render: (row) => {
        const isCurrentRecord = isCurrentSubscriptionRecord(row);
        return (
          <Badge tone={isCurrentRecord ? "info" : "neutral"}>
            {isCurrentRecord
              ? copy(locale, "Current", "حالي")
              : copy(locale, "History", "سابق")}
          </Badge>
        );
      },
    },
  ];
  const pendingColumns: Column<PendingSubscriptionGrant>[] = [
    {
      key: "email",
      header: copy(locale, "Email", "البريد"),
      render: (row) => <span className="mono table-primary-value">{row.normalized_email}</span>,
    },
    {
      key: "plan",
      header: copy(locale, "Plan", "الخطة"),
      render: (row) => statusLabel(row.plan_term, locale),
    },
    {
      key: "duration",
      header: copy(locale, "Duration", "المدة"),
      render: (row) => row.duration_mode === "lifetime"
        ? copy(locale, "Lifetime", "مدى الحياة")
        : row.duration_mode === "exact"
          ? date(row.exact_expiry, locale)
          : `${row.duration_value || "—"} ${statusLabel(row.duration_unit, locale)}`,
    },
    {
      key: "deadline",
      header: copy(locale, "Registration deadline", "مهلة التسجيل"),
      render: (row) => date(row.claim_deadline, locale),
    },
    {
      key: "action",
      header: copy(locale, "Action", "الإجراء"),
      render: (row) => (
        <Button size="sm" variant="text" onClick={() => setPendingToCancel(row)}>
          {copy(locale, "Cancel", "إلغاء")}
        </Button>
      ),
    },
  ];
  return (
    <div className="stack">
      <PageHeader
        title={copy(locale, "Subscriptions", "الاشتراكات")}
        actions={
          <Button variant="primary" onClick={() => setGrantOpen(true)}>
            {copy(locale, "Grant subscription", "منح اشتراك")}
          </Button>
        }
      />
      {pendingGrants.data?.length ? (
        <section className="admin-inline-section">
          <SectionHeader
            title={copy(locale, "Waiting for registration", "بانتظار التسجيل")}
            description={copy(
              locale,
              "These grants activate automatically after the matching email is verified.",
              "تُفعّل هذه المنح تلقائيًا بعد التحقق من البريد المطابق.",
            )}
          />
          <DataTable
            columns={pendingColumns}
            rows={pendingGrants.data}
            loading={pendingGrants.loading}
            rowKey={(row) => row.id}
            emptyTitle=""
            emptyBody=""
          />
        </section>
      ) : null}
      <TableToolbar
        searchLabel={copy(
          locale,
          "Search by user identity",
          "ابحث بهوية المستخدم",
        )}
        searchValue={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        filters={
          <>
            <Select
              aria-label={copy(locale, "Record type", "نوع السجل")}
              value={current}
              onChange={(event) => {
                setCurrent(event.target.value);
                setPage(1);
              }}
            >
              <option value="">
                {copy(locale, "All records", "كل السجلات")}
              </option>
              <option value="current">
                {copy(locale, "Current only", "الحالية فقط")}
              </option>
              <option value="history">
                {copy(locale, "History only", "السابقة فقط")}
              </option>
            </Select>
            <Select
              aria-label={copy(locale, "Lifecycle", "دورة الاشتراك")}
              value={lifecycle}
              onChange={(event) => {
                setLifecycle(event.target.value);
                setPage(1);
              }}
            >
              <option value="">
                {copy(locale, "All lifecycle states", "كل حالات الاشتراك")}
              </option>
              {[
                "trialing",
                "active",
                "past_due",
                "cancel_at_period_end",
                "cancelled",
                "expired",
                "suspended",
              ].map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value, locale)}
                </option>
              ))}
            </Select>
          </>
        }
      />
      {resource.error ? (
        <Alert
          title={copy(
            locale,
            "Could not load subscriptions",
            "تعذر تحميل الاشتراكات",
          )}
          tone="danger"
        >
          {resource.error}
        </Alert>
      ) : (
        <DataTable
          columns={columns}
          rows={resource.data?.items || []}
          loading={resource.loading}
          rowKey={(row) => row.id}
          onRowClick={setSelected}
          emptyTitle={copy(
            locale,
            "No subscriptions found",
            "لا توجد اشتراكات",
          )}
          emptyBody={copy(
            locale,
            "Only real subscription rows appear here.",
            "تظهر هنا سجلات الاشتراك الفعلية فقط.",
          )}
        />
      )}
      {resource.data ? (
        <Pagination
          page={page}
          pages={Math.max(
            1,
            Math.ceil(resource.data.total / resource.data.limit),
          )}
          label={copy(
            locale,
            `${resource.data.total} subscriptions`,
            `${resource.data.total} اشتراك`,
          )}
          previousLabel={copy(locale, "Previous", "السابق")}
          nextLabel={copy(locale, "Next", "التالي")}
          onChange={setPage}
        />
      ) : null}
      <SubscriptionDetailDrawer
        subscription={selected}
        onClose={() => setSelected(null)}
        onChanged={resource.reload}
      />
      <ManualGrantDrawer
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        onChanged={() => {
          resource.reload();
          pendingGrants.reload();
        }}
      />
      <PendingGrantCancelDialog
        key={pendingToCancel?.id || "pending-grant:closed"}
        grant={pendingToCancel}
        onClose={() => setPendingToCancel(null)}
        onChanged={() => {
          setPendingToCancel(null);
          pendingGrants.reload();
        }}
      />
    </div>
  );
}

function PendingGrantCancelDialog({
  grant,
  onClose,
  onChanged,
}: {
  grant: PendingSubscriptionGrant | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancelGrant = async () => {
    if (!grant || reason.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      await admin.cancelPendingSubscriptionGrant(grant.id, reason.trim());
      onChanged();
    } catch (cause) {
      setError(adminMutationError(locale, cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={Boolean(grant)}
      onClose={onClose}
      title={copy(locale, "Cancel pending grant", "إلغاء المنح المعلّق")}
      description={grant?.normalized_email}
      closeLabel={copy(locale, "Close", "إغلاق")}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>{copy(locale, "Keep grant", "الإبقاء على المنح")}</Button>
          <Button
            variant="danger"
            disabled={reason.trim().length < 3 || busy}
            onClick={cancelGrant}
          >
            {copy(locale, "Cancel grant", "إلغاء المنح")}
          </Button>
        </>
      }
    >
      <div className="stack stack--compact">
        <FormField label={copy(locale, "Reason", "السبب")} required>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
        </FormField>
        {error ? <Alert title={copy(locale, "Could not cancel the grant", "تعذر إلغاء المنح")} tone="danger">{error}</Alert> : null}
      </div>
    </Modal>
  );
}

function SubscriptionDetailDrawer({
  subscription,
  onClose,
  onChanged,
}: {
  subscription: AdminSubscription | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { locale } = useExperience();
  const [operation, setOperation] = useState<OperationIntent | null>(null);
  if (!subscription) return null;
  const isCurrentRecord = isCurrentSubscriptionRecord(subscription);
  const isExpiredCurrent =
    isCurrentRecord &&
    ["expired", "no_subscription"].includes(
      String(subscriptionDisplayLifecycle(subscription)),
    );
  let actions: SubscriptionAction[] = [];
  if (isExpiredCurrent) {
    actions = ["correct_expiry"];
  } else if (isCurrentRecord && subscription.lifecycle_state === "suspended") {
    actions = ["resume"];
  } else if (isCurrentRecord && subscription.plan_term === "lifetime") {
    actions = ["suspend", "cancel_now", "revoke_entitlement"];
  } else if (isCurrentRecord) {
    actions = [
      "suspend",
      "cancel_at_period_end",
      "cancel_now",
      "correct_expiry",
      "revoke_entitlement",
    ];
  }
  if (isCurrentRecord && subscription.lifecycle_state === "trialing") actions.unshift("end_trial");
  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={copy(locale, "Subscription details", "تفاصيل الاشتراك")}
        description={
          subscription.user_email ||
          subscription.firebase_user_id ||
          subscription.id
        }
        closeLabel={copy(locale, "Close", "إغلاق")}
      >
        <div className="stack">
          <dl className="detail-list">
            <div>
              <dt>{copy(locale, "Subscription ID", "معرّف الاشتراك")}</dt>
              <dd className="mono">{subscription.id}</dd>
            </div>
            <div>
              <dt>{copy(locale, "Lifecycle", "دورة الاشتراك")}</dt>
              <dd>
                <Badge
                  tone={tone(
                    subscription.lifecycle_state || subscription.status,
                  )}
                >
                  {statusLabel(
                    subscription.lifecycle_state || subscription.status,
                    locale,
                  )}
                </Badge>
              </dd>
            </div>
            <div>
              <dt>{copy(locale, "Entitlement", "الاستحقاق")}</dt>
              <dd>
                {statusLabel(
                  subscription.subscription_projection?.entitlement,
                  locale,
                )}
              </dd>
            </div>
            <div>
              <dt>{copy(locale, "Plan", "الخطة")}</dt>
              <dd>{subscription.plan_term || subscription.plan}</dd>
            </div>
            <div>
              <dt>{copy(locale, "Source", "المصدر")}</dt>
              <dd>
                {subscription.source_type || subscription.provider || "—"}
              </dd>
            </div>
            <div>
              <dt>{copy(locale, "Period", "الفترة")}</dt>
              <dd>
                {date(
                  subscription.period_start_at || subscription.created_at,
                  locale,
                )}{" "}
                →{" "}
                {subscription.plan_term === "lifetime"
                  ? copy(locale, "Lifetime", "مدى الحياة")
                  : date(
                      subscription.period_end_at || subscription.expires_at,
                      locale,
                    )}
              </dd>
            </div>
          </dl>
          {subscription.integrity_warning ? (
            <Alert
              title={copy(locale, "Change blocked", "التغيير محظور")}
              tone="danger"
            >
              {copy(
                locale,
                "Resolve the subscription integrity conflict first.",
                "يجب حل تعارض بيانات الاشتراك أولًا.",
              )}
            </Alert>
          ) : !isCurrentRecord ? (
            <Alert title={copy(locale, "Historical record", "سجل سابق")} tone="info">
              {copy(locale, "Historical subscriptions are read-only.", "الاشتراكات السابقة متاحة للعرض فقط.")}
            </Alert>
          ) : (
            <section className="danger-zone">
              <SectionHeader
                title={copy(locale, "Subscription actions", "إجراءات الاشتراك")}
              />
              <div className="cluster">
                {actions.map((action) => (
                  <Button
                    key={action}
                    variant={
                      ["cancel_now", "revoke_entitlement"].includes(action)
                        ? "danger"
                        : "secondary"
                    }
                    onClick={() =>
                      setOperation({
                        kind: "subscription",
                        subscriptionId: subscription.id,
                        action,
                      })
                    }
                  >
                    {action === "correct_expiry" && isExpiredCurrent
                      ? copy(locale, "Renew subscription", "تجديد الاشتراك")
                      : statusLabel(action, locale)}
                  </Button>
                ))}
              </div>
            </section>
          )}
        </div>
      </Drawer>
      <AdminOperationDialog
        key={operationIntentKey(operation)}
        intent={operation}
        onClose={() => setOperation(null)}
        onChanged={() => {
          setOperation(null);
          onClose();
          onChanged();
        }}
      />
    </>
  );
}

function ManualGrantDrawer({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminUserSummary | null>(null);
  const [plan, setPlan] = useState<
    "weekly" | "monthly" | "annual" | "lifetime"
  >("monthly");
  const [duration, setDuration] = useState("30");
  const [unit, setUnit] = useState<"days" | "weeks" | "months">("days");
  const [reasonCode, setReasonCode] = useState<
    | "admin_grant"
    | "compensation"
    | "trial"
    | "technical_support"
    | "subscription_replacement"
    | "other"
  >("admin_grant");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<ManualGrantPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const debouncedSearch = useDebouncedValue(search);
  const users = useResource(
    () =>
      open && debouncedSearch.trim().length >= 2
        ? admin.listUsers({ search: debouncedSearch, limit: 8 })
        : Promise.resolve({ items: [], total: 0, page: 1, limit: 8 }),
    [admin, open, debouncedSearch],
  );
  const typedEmail = validEmail(search) ? normalizedEmail(search) : "";
  const exactUser =
    users.data?.items.find(
      (user) => normalizedEmail(user.email) === typedEmail,
    ) || null;
  const targetUser = selected || exactUser;
  const targetEmail = selected?.email || typedEmail;
  const operation =
    targetUser?.subscription_presence === "active"
      ? "extend_current"
      : "start_from_now";
  const input = targetEmail
    ? {
        target_email: targetEmail,
        operation_type: operation as "extend_current" | "start_from_now",
        plan,
        duration_mode:
          plan === "lifetime" ? ("lifetime" as const) : ("duration" as const),
        duration_value: plan === "lifetime" ? undefined : Number(duration),
        duration_unit: unit,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        reason_code: reasonCode,
        reason_note: note || undefined,
      }
    : null;
  const runPreview = async () => {
    if (!input) return;
    setBusy(true);
    setError("");
    try {
      setPreview(await admin.previewManualGrant(input));
    } catch (reason) {
      setPreview(null);
      setError(adminMutationError(locale, reason));
    } finally {
      setBusy(false);
    }
  };
  const reasonValid = reasonCode !== "other" || note.trim().length >= 3;
  const execute = async () => {
    if (!input || !preview || !reasonValid) return;
    setBusy(true);
    setError("");
    try {
      await admin.executeManualGrant({
        ...input,
        reason: note || reasonCode,
        idempotency_key: idempotencyKey,
        preview_hash: preview.preview_hash,
      });
      setIdempotencyKey(crypto.randomUUID());
      onChanged();
      onClose();
    } catch (reason) {
      setError(adminMutationError(locale, reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      className="manual-grant-drawer"
      title={copy(locale, "Grant subscription", "منح اشتراك")}
      description={copy(
        locale,
        "Choose an existing user or enter the email that will register later.",
        "اختر مستخدمًا حاليًا أو اكتب البريد الذي سيسجل لاحقًا.",
      )}
      closeLabel={copy(locale, "Close", "إغلاق")}
      footer={
        <>
          <Button
            onClick={runPreview}
            disabled={!input || !reasonValid || busy}
          >
            {copy(locale, "Review changes", "مراجعة التغييرات")}
          </Button>
          <Button
            variant="primary"
            onClick={execute}
            disabled={!preview || preview.blocked || !reasonValid || busy}
          >
            {copy(locale, "Confirm grant", "تأكيد المنح")}
          </Button>
        </>
      }
    >
      <div className="stack manual-grant-form">
        <FormField label={copy(locale, "User", "المستخدم")}>
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setSelected(null);
              setPreview(null);
            }}
            placeholder={copy(
              locale,
              "Search by name or email",
              "ابحث بالاسم أو البريد",
            )}
          />
        </FormField>
        {users.data?.items.length ? (
          <div className="selection-list">
            {users.data.items.map((user) => (
              <button
                type="button"
                key={user.firebase_uid}
                className={
                  selected?.firebase_uid === user.firebase_uid
                    ? "is-selected"
                    : ""
                }
                onClick={() => {
                  setSelected(user);
                  setSearch(user.email);
                  setPreview(null);
                }}
              >
                <strong>{user.display_name || user.email}</strong>
                <small>
                  {user.email} ·{" "}
                  {statusLabel(user.subscription_presence, locale)}
                </small>
              </button>
            ))}
          </div>
        ) : null}
        {typedEmail && !exactUser && !users.loading ? (
          <Alert
            title={copy(locale, "Grant after registration", "منح بعد التسجيل")}
            tone="info"
          >
            {copy(
              locale,
              "The subscription will start automatically after this email creates and verifies its account.",
              "سيبدأ الاشتراك تلقائيًا بعد إنشاء الحساب بهذا البريد والتحقق منه.",
            )}
          </Alert>
        ) : null}
        <div className="form-grid">
          <FormField label={copy(locale, "Plan", "الخطة")}>
            <Select
              value={plan}
              onChange={(event) => {
                setPlan(event.target.value as typeof plan);
                setPreview(null);
              }}
            >
              <option value="weekly">{copy(locale, "Weekly", "أسبوعي")}</option>
              <option value="monthly">{copy(locale, "Monthly", "شهري")}</option>
              <option value="annual">{copy(locale, "Annual", "سنوي")}</option>
              <option value="lifetime">
                {copy(locale, "Lifetime", "مدى الحياة")}
              </option>
            </Select>
          </FormField>
          {plan !== "lifetime" ? (
            <>
              <FormField label={copy(locale, "Duration", "المدة")}>
                <Input
                  type="number"
                  min="1"
                  value={duration}
                  onChange={(event) => {
                    setDuration(event.target.value);
                    setPreview(null);
                  }}
                />
              </FormField>
              <FormField label={copy(locale, "Unit", "الوحدة")}>
                <Select
                  value={unit}
                  onChange={(event) => {
                    setUnit(event.target.value as typeof unit);
                    setPreview(null);
                  }}
                >
                  <option value="days">{copy(locale, "Days", "أيام")}</option>
                  <option value="weeks">
                    {copy(locale, "Weeks", "أسابيع")}
                  </option>
                  <option value="months">
                    {copy(locale, "Months", "أشهر")}
                  </option>
                </Select>
              </FormField>
            </>
          ) : null}
        </div>
        <FormField label={copy(locale, "Reason", "السبب")}>
          <Select
            value={reasonCode}
            onChange={(event) => {
              setReasonCode(event.target.value as typeof reasonCode);
              setPreview(null);
            }}
          >
            <option value="admin_grant">
              {copy(locale, "Administrative grant", "منح إداري")}
            </option>
            <option value="compensation">
              {copy(locale, "Compensation", "تعويض")}
            </option>
            <option value="trial">
              {copy(locale, "Trial", "فترة تجريبية")}
            </option>
            <option value="technical_support">
              {copy(locale, "Technical support", "دعم فني")}
            </option>
            <option value="subscription_replacement">
              {copy(locale, "Subscription replacement", "استبدال اشتراك")}
            </option>
            <option value="other">{copy(locale, "Other", "سبب آخر")}</option>
          </Select>
        </FormField>
        <FormField
          label={copy(locale, "Note", "ملاحظة")}
          required={reasonCode === "other"}
        >
          <Textarea
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setPreview(null);
            }}
          />
        </FormField>
        {preview ? (
          <Alert
            title={copy(locale, "Change preview", "معاينة التغيير")}
            tone={preview.blocked ? "danger" : "info"}
          >
            {copy(
              locale,
              preview.pending_registration
                ? "The grant will activate after account registration and email verification."
                : `Result: ${preview.proposed_state.resulting_entitlement}; expiry: ${date(preview.proposed_state.expires_at, locale)}`,
              preview.pending_registration
                ? "سيُفعّل المنح بعد إنشاء الحساب والتحقق من البريد."
                : `النتيجة: ${statusLabel(preview.proposed_state.resulting_entitlement, locale)}؛ الانتهاء: ${date(preview.proposed_state.expires_at, locale)}`,
            )}
          </Alert>
        ) : null}
        {error ? (
          <Alert
            title={copy(
              locale,
              "Could not complete the request",
              "تعذر إكمال الطلب",
            )}
            tone="danger"
          >
            {error}
          </Alert>
        ) : null}
      </div>
    </Drawer>
  );
}

function AdminOperationDialog({
  intent,
  onClose,
  onChanged,
}: {
  intent: OperationIntent | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const [reasonCode, setReasonCode] =
    useState<AdminOperationReason["reason_code"]>("admin_action");
  const [note, setNote] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const [preview, setPreview] = useState<AdminOperationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reason = { reason_code: reasonCode, reason_note: note || undefined };
  const review = async () => {
    if (!intent) return;
    setBusy(true);
    setError("");
    try {
      const result =
        intent.kind === "account"
          ? await admin.previewAccountLifecycle(intent.uid, {
              ...reason,
              action: intent.action,
            })
          : intent.kind === "access"
            ? await admin.previewAccessRevocation(intent.uid, {
                ...reason,
                scope: intent.scope,
                target_id: intent.targetId,
              })
            : await admin.previewSubscriptionTransition(intent.subscriptionId, {
                ...reason,
                action: intent.action,
                new_expiry: newExpiry
                  ? new Date(newExpiry).toISOString()
                  : undefined,
              });
      setPreview(result);
    } catch (reasonError) {
      setError(
        reasonError instanceof Error ? reasonError.message : "preview_failed",
      );
    } finally {
      setBusy(false);
    }
  };
  const execute = async () => {
    if (!intent || !preview) return;
    setBusy(true);
    setError("");
    try {
      const request_id = crypto.randomUUID();
      if (intent.kind === "account")
        await admin.executeAccountLifecycle(intent.uid, {
          ...reason,
          action: intent.action,
          preview_hash: preview.preview_hash,
          request_id,
        });
      else if (intent.kind === "access")
        await admin.executeAccessRevocation(intent.uid, {
          ...reason,
          scope: intent.scope,
          target_id: intent.targetId,
          preview_hash: preview.preview_hash,
          request_id,
        });
      else
        await admin.executeSubscriptionTransition(intent.subscriptionId, {
          ...reason,
          action: intent.action,
          new_expiry: newExpiry ? new Date(newExpiry).toISOString() : undefined,
          preview_hash: preview.preview_hash,
          request_id,
        });
      onChanged();
    } catch (executeError) {
      setError(
        executeError instanceof Error
          ? executeError.message
          : "operation_failed",
      );
    } finally {
      setBusy(false);
    }
  };
  const action =
    intent?.kind === "account"
      ? intent.action
      : intent?.kind === "access"
        ? `revoke_${intent.scope}`
        : intent?.action;
  return (
    <Modal
      open={Boolean(intent)}
      onClose={onClose}
      title={statusLabel(action, locale)}
      description={copy(
        locale,
        "Review the impact before confirming.",
        "راجع التأثير قبل التأكيد.",
      )}
      closeLabel={copy(locale, "Close", "إغلاق")}
      footer={
        <>
          <Button onClick={review} disabled={busy}>
            {copy(locale, "Review changes", "مراجعة التغييرات")}
          </Button>
          <Button
            variant="danger"
            onClick={execute}
            disabled={!preview || busy}
          >
            {copy(locale, "Confirm", "تأكيد")}
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormField label={copy(locale, "Reason", "السبب")}>
          <Select
            value={reasonCode}
            onChange={(event) => {
              setReasonCode(
                event.target.value as AdminOperationReason["reason_code"],
              );
              setPreview(null);
            }}
          >
            {[
              "admin_action",
              "customer_request",
              "security_review",
              "technical_support",
              "billing_correction",
              "subscription_recovery",
              "policy_enforcement",
              "other",
            ].map((value) => (
              <option key={value} value={value}>
                {statusLabel(value, locale)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label={copy(locale, "Note", "ملاحظة")}
          required={reasonCode === "other"}
        >
          <Textarea
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setPreview(null);
            }}
          />
        </FormField>
        {intent?.kind === "subscription" &&
        intent.action === "correct_expiry" ? (
          <FormField
            label={copy(locale, "New expiry", "تاريخ الانتهاء الجديد")}
            required
          >
            <Input
              type="datetime-local"
              value={newExpiry}
              onChange={(event) => {
                setNewExpiry(event.target.value);
                setPreview(null);
              }}
            />
          </FormField>
        ) : null}
        {preview ? (
          <Alert
            title={copy(locale, "Change preview", "معاينة التغيير")}
            tone={preview.sessions_will_be_revoked ? "warning" : "info"}
          >
            {preview.sessions_will_be_revoked
              ? copy(
                  locale,
                  "Active sessions will be revoked.",
                  "سيتم إلغاء الجلسات النشطة.",
                )
              : copy(
                  locale,
                  "No session revocation is expected.",
                  "لا يُتوقع إلغاء جلسات.",
                )}
          </Alert>
        ) : null}
        {error ? (
          <Alert
            title={copy(
              locale,
              "Could not complete the request",
              "تعذر إكمال الطلب",
            )}
            tone="danger"
          >
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}

export function AdminDiagnosticsPhaseF() {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const [tab, setTab] = useState("groups");
  const [selectedGroup, setSelectedGroup] = useState<AdminCrashGroup | null>(
    null,
  );
  const [selectedTamper, setSelectedTamper] = useState<AdminTamperAlert | null>(
    null,
  );
  const groups = useResource(() => admin.listCrashGroups(), [admin]);
  const logs = useResource(() => admin.listCrashLogs("error"), [admin]);
  const warnings = useResource(() => admin.listCrashLogs("warning"), [admin]);
  const tamper = useResource(
    () => admin.listTamperAlerts({ resolved: false }),
    [admin],
  );
  const groupColumns: Column<AdminCrashGroup>[] = [
    {
      key: "type",
      header: copy(locale, "Error", "الخطأ"),
      render: (row) => row.error_type,
    },
    {
      key: "count",
      header: copy(locale, "Occurrences", "التكرار"),
      render: (row) => row.count,
    },
    {
      key: "users",
      header: copy(locale, "Affected users", "المستخدمون المتأثرون"),
      render: (row) => row.affected_user_count || 0,
    },
    {
      key: "status",
      header: copy(locale, "Status", "الحالة"),
      render: (row) => (
        <Badge tone={tone(row.status)}>{statusLabel(row.status, locale)}</Badge>
      ),
    },
    {
      key: "date",
      header: copy(locale, "Last seen", "آخر ظهور"),
      render: (row) => date(row.last_seen_at, locale),
    },
    {
      key: "action",
      header: copy(locale, "Action", "الإجراء"),
      render: (row) => (
        <Button size="sm" onClick={() => setSelectedGroup(row)}>
          {copy(locale, "Update", "تحديث")}
        </Button>
      ),
    },
  ];
  const logColumns: Column<AdminCrashLog>[] = [
    {
      key: "type",
      header: copy(locale, "Error", "الخطأ"),
      render: (row) => row.error_type,
    },
    {
      key: "message",
      header: copy(locale, "Summary", "الملخص"),
      render: (row) => row.message || row.stack_trace?.split("\n")[0] || "—",
    },
    {
      key: "version",
      header: copy(locale, "Version", "الإصدار"),
      render: (row) => row.app_version || "—",
    },
    {
      key: "date",
      header: copy(locale, "Time", "الوقت"),
      render: (row) => date(row.happened_at, locale),
    },
  ];
  const warningColumns: Column<AdminCrashLog>[] = [
    {
      key: "type",
      header: copy(locale, "Type", "النوع"),
      render: (row) => row.error_type,
    },
    ...logColumns.slice(1),
  ];
  const tamperColumns: Column<AdminTamperAlert>[] = [
    {
      key: "severity",
      header: copy(locale, "Severity", "الخطورة"),
      render: (row) => (
        <Badge tone={tone(row.severity)}>
          {statusLabel(row.severity, locale)}
        </Badge>
      ),
    },
    {
      key: "reason",
      header: copy(locale, "Summary", "الملخص"),
      render: (row) => row.reason,
    },
    {
      key: "device",
      header: copy(locale, "Device", "الجهاز"),
      render: (row) => row.hwid || "—",
    },
    {
      key: "date",
      header: copy(locale, "Time", "الوقت"),
      render: (row) => date(row.happened_at, locale),
    },
    {
      key: "action",
      header: copy(locale, "Action", "الإجراء"),
      render: (row) => (
        <Button size="sm" onClick={() => setSelectedTamper(row)}>
          {copy(locale, "Resolve", "حل")}
        </Button>
      ),
    },
  ];
  return (
    <div className="stack">
      <PageHeader title={copy(locale, "Diagnostics", "التشخيص")} />
      <Tabs
        ariaLabel={copy(locale, "Diagnostics sections", "أقسام التشخيص")}
        active={tab}
        onChange={setTab}
        items={[
          {
            id: "groups",
            label: copy(locale, "Crash groups", "مجموعات الأعطال"),
          },
          { id: "occurrences", label: copy(locale, "Occurrences", "الأعطال") },
          {
            id: "warnings",
            label: copy(locale, "Operational warnings", "تنبيهات التشغيل"),
          },
          {
            id: "tamper",
            label: copy(locale, "Tamper alerts", "تنبيهات العبث"),
          },
        ]}
      />
      {tab === "groups" ? (
        <DataTable
          columns={groupColumns}
          rows={groups.data || []}
          loading={groups.loading}
          rowKey={(row) => row.fingerprint}
          emptyTitle={copy(locale, "No crash groups", "لا توجد مجموعات أعطال")}
          emptyBody={copy(
            locale,
            "New groups will appear here.",
            "ستظهر المجموعات الجديدة هنا.",
          )}
        />
      ) : tab === "warnings" ? (
        <DataTable
          columns={warningColumns}
          rows={warnings.data || []}
          loading={warnings.loading}
          rowKey={(row) => row.id}
          emptyTitle={copy(locale, "No operational warnings", "لا توجد تنبيهات تشغيل")}
          emptyBody={copy(locale, "No recoverable operational events need review.", "لا توجد أحداث تشغيل قابلة للاسترداد تحتاج إلى مراجعة.")}
        />
      ) : tab === "tamper" ? (
        <DataTable
          columns={tamperColumns}
          rows={tamper.data || []}
          loading={tamper.loading}
          rowKey={(row) => row.id}
          emptyTitle={copy(locale, "No open alerts", "لا توجد تنبيهات مفتوحة")}
          emptyBody={copy(
            locale,
            "There are no unresolved tamper alerts.",
            "لا توجد تنبيهات عبث غير محلولة.",
          )}
        />
      ) : (
        <DataTable
          columns={logColumns}
          rows={logs.data || []}
          loading={logs.loading}
          rowKey={(row) => row.id}
          emptyTitle={copy(locale, "No crash reports", "لا توجد تقارير أعطال")}
          emptyBody={copy(
            locale,
            "Crash reports will appear here.",
            "ستظهر تقارير الأعطال هنا.",
          )}
        />
      )}
      <CrashGroupStateDialog
        key={selectedGroup?.fingerprint || "crash-group:closed"}
        group={selectedGroup}
        onClose={() => setSelectedGroup(null)}
        onChanged={() => {
          setSelectedGroup(null);
          groups.reload();
        }}
      />
      <TamperResolveDialog
        key={selectedTamper?.id || "tamper:closed"}
        alert={selectedTamper}
        onClose={() => setSelectedTamper(null)}
        onChanged={() => {
          setSelectedTamper(null);
          tamper.reload();
        }}
      />
    </div>
  );
}

function CrashGroupStateDialog({
  group,
  onClose,
  onChanged,
}: {
  group: AdminCrashGroup | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const [status, setStatus] =
    useState<NonNullable<AdminCrashGroup["status"]>>(() => group?.status || "open");
  const [assignee, setAssignee] = useState(() => group?.assignee || "");
  const [note, setNote] = useState(() => group?.note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!group) return;
    setBusy(true);
    setError("");
    try {
      await admin.updateCrashGroupState(group.fingerprint, {
        status,
        assignee: assignee.trim() || undefined,
        note: note.trim() || undefined,
      });
      onChanged();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "crash_group_update_failed",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={Boolean(group)}
      onClose={onClose}
      title={copy(locale, "Update crash group", "تحديث مجموعة الأعطال")}
      closeLabel={copy(locale, "Close", "إغلاق")}
      footer={
        <Button variant="primary" loading={busy} onClick={save}>
          {copy(locale, "Save", "حفظ")}
        </Button>
      }
    >
      <div className="stack">
        <FormField label={copy(locale, "Status", "الحالة")}>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            {(["open", "investigating", "resolved", "ignored"] as const).map(
              (value) => (
                <option key={value} value={value}>
                  {statusLabel(value, locale)}
                </option>
              ),
            )}
          </Select>
        </FormField>
        <FormField label={copy(locale, "Assignee", "المسؤول")}>
          <Input
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
          />
        </FormField>
        <FormField label={copy(locale, "Note", "ملاحظة")}>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </FormField>
        {error ? (
          <Alert
            title={copy(
              locale,
              "Could not save the change",
              "تعذر حفظ التغيير",
            )}
            tone="danger"
          >
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}

function TamperResolveDialog({
  alert,
  onClose,
  onChanged,
}: {
  alert: AdminTamperAlert | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resolve = async () => {
    if (!alert || reason.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      await admin.resolveTamperAlert(alert.id, reason.trim());
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "tamper_resolve_failed",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={Boolean(alert)}
      onClose={onClose}
      title={copy(locale, "Resolve tamper alert", "حل تنبيه العبث")}
      closeLabel={copy(locale, "Close", "إغلاق")}
      footer={
        <Button
          variant="primary"
          loading={busy}
          disabled={reason.trim().length < 3}
          onClick={resolve}
        >
          {copy(locale, "Resolve alert", "حل التنبيه")}
        </Button>
      }
    >
      <div className="stack">
        <FormField
          label={copy(locale, "Resolution note", "ملاحظة الحل")}
          required
        >
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
        {error ? (
          <Alert
            title={copy(
              locale,
              "Could not resolve the alert",
              "تعذر حل التنبيه",
            )}
            tone="danger"
          >
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}

export function AdminAuditPhaseF() {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const [search, setSearch] = useState("");
  const resource = useResource(() => admin.listAuditLog(), [admin]);
  const rows = useMemo(
    () =>
      (resource.data || []).filter(
        (row) =>
          !search ||
          [
            row.action,
            row.actor,
            row.target_type,
            row.target_id,
            row.request_id,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value).toLowerCase().includes(search.toLowerCase()),
            ),
      ),
    [resource.data, search],
  );
  const columns: Column<AdminAuditLogItem>[] = [
    {
      key: "time",
      header: copy(locale, "Time", "الوقت"),
      render: (row) => date(row.timestamp || row.happened_at || row.at, locale),
    },
    {
      key: "actor",
      header: copy(locale, "Actor", "المنفذ"),
      render: (row) => row.actor || row.admin_email || "—",
    },
    {
      key: "action",
      header: copy(locale, "Action", "الإجراء"),
      render: (row) => statusLabel(row.action || row.type, locale),
    },
    {
      key: "target",
      header: copy(locale, "Target", "الهدف"),
      render: (row) =>
        [row.target_type || row.entity, row.target_id || row.entity_id]
          .filter(Boolean)
          .join(" · ") || "—",
    },
    {
      key: "outcome",
      header: copy(locale, "Result", "النتيجة"),
      render: (row) => (
        <Badge tone={tone(row.outcome)}>
          {statusLabel(row.outcome, locale)}
        </Badge>
      ),
    },
  ];
  return (
    <div className="stack">
      <PageHeader title={copy(locale, "Audit log", "سجل التدقيق")} />
      <TableToolbar
        searchLabel={copy(locale, "Search activity", "ابحث في النشاط")}
        searchValue={search}
        onSearch={setSearch}
      />
      {resource.error ? (
        <Alert
          title={copy(
            locale,
            "Could not load audit activity",
            "تعذر تحميل سجل التدقيق",
          )}
          tone="danger"
        >
          {resource.error}
        </Alert>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          loading={resource.loading}
          rowKey={(row) => row.id || `${row.timestamp}-${row.action}`}
          emptyTitle={copy(locale, "No audit records", "لا توجد سجلات تدقيق")}
          emptyBody={copy(
            locale,
            "Administrative actions will appear here.",
            "ستظهر الإجراءات الإدارية هنا.",
          )}
        />
      )}
    </div>
  );
}

export function AdminPoliciesPhaseF() {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const [tab, setTab] = useState("global");
  const state = useResource(() => admin.getPolicyState(), [admin]);
  const invites = useResource(() => admin.listInvites(), [admin]);
  const [killSwitch, setKillSwitch] = useState(false);
  const [mandatory, setMandatory] = useState(false);
  const [minimumVersion, setMinimumVersion] = useState("");
  const [updateMode, setUpdateMode] = useState("optional");
  const [reason, setReason] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revokeInvite, setRevokeInvite] = useState<AdminInviteCode | null>(
    null,
  );
  useEffect(() => {
    const global = state.data?.global_policy;
    if (!global) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setKillSwitch(Boolean(global.kill_switch_enabled));
      setMandatory(Boolean(global.mandatory_update_enabled));
      setMinimumVersion(global.minimum_supported_version || "");
      setUpdateMode(global.update_mode || "optional");
    });
    return () => {
      active = false;
    };
  }, [state.data]);
  const savePolicy = async () => {
    setBusy(true);
    setError("");
    try {
      await admin.updateGlobalPolicy({
        kill_switch_enabled: killSwitch,
        mandatory_update_enabled: mandatory,
        minimum_supported_version: minimumVersion,
        update_mode: updateMode,
        reason,
      });
      setPreviewOpen(false);
      setAcknowledged(false);
      setReason("");
      state.reload();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "policy_update_failed",
      );
    } finally {
      setBusy(false);
    }
  };
  const versionColumns: Column<{
    version: string;
    reason?: string | null;
    created_at?: string;
  }>[] = [
    {
      key: "version",
      header: copy(locale, "Version", "الإصدار"),
      render: (row) => row.version,
    },
    {
      key: "reason",
      header: copy(locale, "Reason", "السبب"),
      render: (row) => row.reason || "—",
    },
    {
      key: "date",
      header: copy(locale, "Disabled at", "تاريخ التعطيل"),
      render: (row) => date(row.created_at, locale),
    },
    {
      key: "action",
      header: copy(locale, "Action", "الإجراء"),
      render: (row) => (
        <Button
          size="sm"
          onClick={() =>
            admin
              .updateDisabledVersion({
                version: row.version,
                disabled: false,
                reason: "Re-enabled by administrator",
              })
              .then(state.reload)
          }
        >
          {copy(locale, "Enable", "إعادة التفعيل")}
        </Button>
      ),
    },
  ];
  const inviteColumns: Column<AdminInviteCode>[] = [
    {
      key: "status",
      header: copy(locale, "Status", "الحالة"),
      render: (row) => (
        <Badge tone={tone(row.status)}>{statusLabel(row.status, locale)}</Badge>
      ),
    },
    {
      key: "uses",
      header: copy(locale, "Usage", "الاستخدام"),
      render: (row) => `${row.used_count}/${row.max_uses || "∞"}`,
    },
    {
      key: "expiry",
      header: copy(locale, "Expiry", "الانتهاء"),
      render: (row) =>
        row.expires_at
          ? date(row.expires_at, locale)
          : copy(locale, "No expiry", "بلا انتهاء"),
    },
    {
      key: "note",
      header: copy(locale, "Note", "ملاحظة"),
      render: (row) => row.note || "—",
    },
    {
      key: "action",
      header: copy(locale, "Action", "الإجراء"),
      render: (row) =>
        row.status === "active" ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => setRevokeInvite(row)}
          >
            {copy(locale, "Revoke", "إلغاء")}
          </Button>
        ) : (
          "—"
        ),
    },
  ];
  const planColumns: Column<{
    plan_id: string;
    features_json?: string | null;
    blocked_actions_json?: string | null;
    limits_json?: string | null;
  }>[] = [
    {
      key: "plan",
      header: copy(locale, "Plan", "الخطة"),
      render: (row) => row.plan_id,
    },
    {
      key: "features",
      header: copy(locale, "Features", "الخصائص"),
      render: (row) => safeJsonCount(row.features_json),
    },
    {
      key: "blocked",
      header: copy(locale, "Blocked actions", "الإجراءات المحظورة"),
      render: (row) => safeJsonCount(row.blocked_actions_json),
    },
    {
      key: "limits",
      header: copy(locale, "Limits", "الحدود"),
      render: (row) => safeJsonCount(row.limits_json),
    },
  ];
  return (
    <div className="stack">
      <PageHeader title={copy(locale, "Policies", "السياسات")} />
      <Tabs
        ariaLabel={copy(locale, "Policy sections", "أقسام السياسات")}
        active={tab}
        onChange={setTab}
        items={[
          {
            id: "global",
            label: copy(locale, "Global policy", "السياسة العامة"),
          },
          {
            id: "versions",
            label: copy(locale, "Disabled versions", "الإصدارات المعطلة"),
          },
          {
            id: "invites",
            label: copy(locale, "Invite codes", "أكواد الدعوة"),
          },
          { id: "plans", label: copy(locale, "Plan features", "خصائص الخطط") },
        ]}
      />
      {state.error ? (
        <Alert
          title={copy(
            locale,
            "Could not load policy state",
            "تعذر تحميل حالة السياسات",
          )}
          tone="danger"
        >
          {state.error}
        </Alert>
      ) : tab === "global" ? (
        <Card>
          <SectionHeader
            title={copy(locale, "Global access policy", "سياسة الوصول العامة")}
          />
          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              setPreviewOpen(true);
            }}
          >
            <div className="form-grid">
              <FormField label={copy(locale, "Update mode", "وضع التحديث")}>
                <Select
                  value={updateMode}
                  onChange={(event) => setUpdateMode(event.target.value)}
                >
                  <option value="optional">
                    {copy(locale, "Optional", "اختياري")}
                  </option>
                  <option value="mandatory">
                    {copy(locale, "Mandatory", "إجباري")}
                  </option>
                </Select>
              </FormField>
              <FormField
                label={copy(
                  locale,
                  "Minimum supported version",
                  "أقل إصدار مدعوم",
                )}
              >
                <Input
                  value={minimumVersion}
                  onChange={(event) => setMinimumVersion(event.target.value)}
                />
              </FormField>
            </div>
            <label className="ui-check">
              <input
                type="checkbox"
                checked={mandatory}
                onChange={(event) => setMandatory(event.target.checked)}
              />
              <span>
                {copy(
                  locale,
                  "Require the configured update",
                  "إلزام التحديث المحدد",
                )}
              </span>
            </label>
            <label className="ui-check">
              <input
                type="checkbox"
                checked={killSwitch}
                onChange={(event) => setKillSwitch(event.target.checked)}
              />
              <span>
                {copy(
                  locale,
                  "Stop customer access globally",
                  "إيقاف وصول المستخدمين بالكامل",
                )}
              </span>
            </label>
            <FormField label={copy(locale, "Reason", "السبب")} required>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </FormField>
            <Button variant="primary" disabled={reason.trim().length < 3}>
              {copy(locale, "Review changes", "مراجعة التغييرات")}
            </Button>
          </form>
        </Card>
      ) : tab === "versions" ? (
        <Card>
          <SectionHeader
            title={copy(locale, "Disabled versions", "الإصدارات المعطلة")}
          />
          <DataTable
            columns={versionColumns}
            rows={state.data?.disabled_versions || []}
            rowKey={(row) => row.version}
            emptyTitle={copy(
              locale,
              "No disabled versions",
              "لا توجد إصدارات معطلة",
            )}
            emptyBody={copy(
              locale,
              "All recorded versions remain eligible for policy evaluation.",
              "كل الإصدارات المسجلة متاحة لتقييم السياسة.",
            )}
          />
        </Card>
      ) : tab === "invites" ? (
        <div className="stack">
          <div className="split">
            <span />
            <Button variant="primary" onClick={() => setInviteOpen(true)}>
              {copy(locale, "Create invite code", "إنشاء كود دعوة")}
            </Button>
          </div>
          <DataTable
            columns={inviteColumns}
            rows={invites.data || []}
            loading={invites.loading}
            rowKey={(row) => row.id}
            emptyTitle={copy(locale, "No invite codes", "لا توجد أكواد دعوة")}
            emptyBody={copy(
              locale,
              "Create a code when invite-based access is required.",
              "أنشئ كودًا عند الحاجة إلى وصول بالدعوة.",
            )}
          />
        </div>
      ) : (
        <Card>
          <SectionHeader
            title={copy(locale, "Plan feature policies", "سياسات خصائص الخطط")}
          />
          <DataTable
            columns={planColumns}
            rows={state.data?.plan_features || []}
            rowKey={(row) => row.plan_id}
            emptyTitle={copy(locale, "No plan policies", "لا توجد سياسات خطط")}
            emptyBody={copy(
              locale,
              "Plan policies will appear here.",
              "ستظهر سياسات الخطط هنا.",
            )}
          />
        </Card>
      )}
      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={copy(locale, "Confirm policy change", "تأكيد تغيير السياسة")}
        description={copy(
          locale,
          "This change can affect customer access.",
          "قد يؤثر هذا التغيير في وصول المستخدمين.",
        )}
        closeLabel={copy(locale, "Close", "إغلاق")}
        footer={
          <>
            <Button onClick={() => setPreviewOpen(false)}>
              {copy(locale, "Back", "رجوع")}
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={!acknowledged}
              onClick={savePolicy}
            >
              {copy(locale, "Apply policy", "تطبيق السياسة")}
            </Button>
          </>
        }
      >
        <div className="stack">
          <dl className="detail-list">
            <div>
              <dt>{copy(locale, "Update mode", "وضع التحديث")}</dt>
              <dd>{statusLabel(updateMode, locale)}</dd>
            </div>
            <div>
              <dt>{copy(locale, "Minimum version", "أقل إصدار")}</dt>
              <dd>{minimumVersion || "—"}</dd>
            </div>
            <div>
              <dt>{copy(locale, "Kill switch", "إيقاف الخدمة")}</dt>
              <dd>
                <Badge tone={killSwitch ? "danger" : "success"}>
                  {killSwitch
                    ? copy(locale, "Enabled", "مفعّل")
                    : copy(locale, "Disabled", "معطّل")}
                </Badge>
              </dd>
            </div>
          </dl>
          <label className="ui-check">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              {copy(
                locale,
                "I reviewed the scope and impact.",
                "راجعت النطاق والتأثير.",
              )}
            </span>
          </label>
          {error ? (
            <Alert
              title={copy(
                locale,
                "Could not update the policy",
                "تعذر تحديث السياسة",
              )}
              tone="danger"
            >
              {error}
            </Alert>
          ) : null}
        </div>
      </Modal>
      <InviteCreateDrawer
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onChanged={invites.reload}
      />
      <InviteRevokeDialog
        invite={revokeInvite}
        onClose={() => setRevokeInvite(null)}
        onChanged={invites.reload}
      />
    </div>
  );
}

function safeJsonCount(value?: string | null) {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.length
      : parsed && typeof parsed === "object"
        ? Object.keys(parsed).length
        : 0;
  } catch {
    return 0;
  }
}

function InviteCreateDrawer({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const [expiry, setExpiry] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [note, setNote] = useState("");
  const [onePerUser, setOnePerUser] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await admin.createInvite({
        request_id: crypto.randomUUID(),
        expires_at: expiry ? new Date(expiry).toISOString() : undefined,
        max_uses: maxUses ? Number(maxUses) : undefined,
        note,
        restrictions: { one_per_user: onePerUser },
      });
      setCode(result.code || "");
      onChanged();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "invite_create_failed",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={open}
      onClose={() => {
        setCode("");
        onClose();
      }}
      title={copy(locale, "Create invite code", "إنشاء كود دعوة")}
      description={copy(
        locale,
        "The code is shown once after creation.",
        "يظهر الكود مرة واحدة بعد الإنشاء.",
      )}
      closeLabel={copy(locale, "Close", "إغلاق")}
      footer={
        <Button
          variant="primary"
          loading={busy}
          onClick={create}
          disabled={Boolean(code)}
        >
          {copy(locale, "Create code", "إنشاء الكود")}
        </Button>
      }
    >
      <div className="stack">
        <div className="form-grid">
          <FormField label={copy(locale, "Expiry", "الانتهاء")}>
            <Input
              type="datetime-local"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
            />
          </FormField>
          <FormField
            label={copy(locale, "Maximum uses", "الحد الأقصى للاستخدام")}
          >
            <Input
              type="number"
              min="1"
              max="100000"
              value={maxUses}
              onChange={(event) => setMaxUses(event.target.value)}
            />
          </FormField>
        </div>
        <label className="ui-check">
          <input
            type="checkbox"
            checked={onePerUser}
            onChange={(event) => setOnePerUser(event.target.checked)}
          />
          <span>
            {copy(
              locale,
              "One successful use per user",
              "استخدام ناجح واحد لكل مستخدم",
            )}
          </span>
        </label>
        <FormField label={copy(locale, "Note", "ملاحظة")}>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </FormField>
        {code ? (
          <Alert
            title={copy(locale, "Copy this code now", "انسخ هذا الكود الآن")}
            tone="success"
          >
            <strong className="mono">{code}</strong>
            <div>
              <Button
                size="sm"
                onClick={() => navigator.clipboard.writeText(code)}
              >
                {copy(locale, "Copy code", "نسخ الكود")}
              </Button>
            </div>
          </Alert>
        ) : null}
        {error ? (
          <Alert
            title={copy(
              locale,
              "Could not create the code",
              "تعذر إنشاء الكود",
            )}
            tone="danger"
          >
            {error}
          </Alert>
        ) : null}
      </div>
    </Drawer>
  );
}

function InviteRevokeDialog({
  invite,
  onClose,
  onChanged,
}: {
  invite: AdminInviteCode | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const revoke = async () => {
    if (!invite) return;
    try {
      await admin.revokeInvite(invite.id, reason);
      onChanged();
      onClose();
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "invite_revoke_failed",
      );
    }
  };
  return (
    <Modal
      open={Boolean(invite)}
      onClose={onClose}
      title={copy(locale, "Revoke invite code", "إلغاء كود الدعوة")}
      closeLabel={copy(locale, "Close", "إغلاق")}
      footer={
        <Button
          variant="danger"
          disabled={reason.trim().length < 3}
          onClick={revoke}
        >
          {copy(locale, "Revoke code", "إلغاء الكود")}
        </Button>
      }
    >
      <div className="stack">
        <FormField label={copy(locale, "Reason", "السبب")} required>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
        {error ? (
          <Alert
            title={copy(
              locale,
              "Could not revoke the code",
              "تعذر إلغاء الكود",
            )}
            tone="danger"
          >
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}

export function AdminReadinessPhaseF() {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const resource = useResource(() => admin.getReadiness(), [admin]);
  if (resource.loading && !resource.data) return <SkeletonStack rows={8} />;
  const sections = resource.data
    ? [
        {
          title: copy(locale, "Services", "الخدمات"),
          values: resource.data.services,
        },
        {
          title: copy(locale, "Integrations", "التكاملات"),
          values: resource.data.integrations,
        },
        {
          title: copy(locale, "Admin security", "أمان الإدارة"),
          values: resource.data.admin_security,
        },
      ]
    : [];
  return (
    <div className="stack">
      <PageHeader
        title={copy(locale, "Readiness", "الجاهزية")}
        actions={
          <Button
            onClick={resource.reload}
            leadingIcon={<RefreshCcw size={15} />}
          >
            {copy(locale, "Refresh", "تحديث")}
          </Button>
        }
      />
      {resource.error ? (
        <Alert
          title={copy(
            locale,
            "Could not load readiness checks",
            "تعذر تحميل فحوصات الجاهزية",
          )}
          tone="danger"
        >
          {resource.error}
        </Alert>
      ) : (
        sections.map((section) => (
          <Card key={section.title}>
            <SectionHeader title={section.title} />
            <dl className="detail-list">
              {Object.entries(section.values).map(([key, value]) => (
                <div key={key}>
                  <dt>{statusLabel(key, locale)}</dt>
                  <dd>
                    <Badge tone={tone(value)}>
                      {statusLabel(value, locale)}
                    </Badge>
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        ))
      )}
    </div>
  );
}

export function AdminSettingsPhaseF() {
  const { locale } = useExperience();
  const { admin } = useAdapters();
  const session = useResource(() => admin.getSession(), [admin]);
  return (
    <div className="stack">
      <PageHeader title={copy(locale, "Admin settings", "إعدادات الإدارة")} />
      {session.error ? (
        <Alert
          title={copy(
            locale,
            "Could not load the admin session",
            "تعذر تحميل جلسة الإدارة",
          )}
          tone="danger"
        >
          {session.error}
        </Alert>
      ) : session.data ? (
        <>
          <Card>
            <SectionHeader
              title={copy(locale, "Admin identity", "هوية الإدارة")}
            />
            <dl className="detail-list">
              <div>
                <dt>{copy(locale, "Account", "الحساب")}</dt>
                <dd>{session.data.email}</dd>
              </div>
              <div>
                <dt>{copy(locale, "Role", "الدور")}</dt>
                <dd>
                  <Badge tone="info">
                    {statusLabel(session.data.role, locale)}
                  </Badge>
                </dd>
              </div>
            </dl>
          </Card>
          <Card>
            <SectionHeader title={copy(locale, "Permissions", "الصلاحيات")} />
            <div className="cluster">
              {session.data.permissions.map((permission) => (
                <Badge key={permission}>{permission}</Badge>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <SkeletonStack rows={5} />
      )}
    </div>
  );
}

export function AdminNotAvailable({ title }: { title: string }) {
  const { locale } = useExperience();
  return (
    <EmptyState
      icon={ShieldAlert}
      title={title}
      body={copy(
        locale,
        "This section is not exposed because it has no operational backend.",
        "هذا القسم غير معروض لأنه لا يملك نظام تشغيل خلفي فعليًا.",
      )}
    />
  );
}
