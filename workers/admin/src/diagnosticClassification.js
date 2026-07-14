const EXPECTED_MESSAGES = new Set([
  "account not found",
  "account_not_found",
  "cancelled",
  "email already exists",
  "invalid_email_requires_at",
  "profile does not exist",
  "profile_not_found",
  "session_ip_already_used",
  "startup_preload_missing",
]);

const WARNING_ERROR_TYPES = new Set([
  "googledriveautosyncfailed",
  "googledriveinitialsyncfailed",
  "updatemanifesterror",
  "updatemanifestfetcherror",
  "timeouterror",
]);

const NETWORK_WARNING_TOKENS = [
  "winerror 10051",
  "winerror 10054",
  "winerror 10060",
  "winerror 10065",
  "connection reset",
  "getaddrinfo",
  "network timeout",
  "network_timeout",
  "timed out",
  "unable to reach",
];

export function classifyDiagnostic(row) {
  const errorType = String(row?.error_type || "").trim().toLowerCase();
  const message = String(row?.message || "").trim().toLowerCase();
  const stack = String(row?.stack_trace || "").trim().toLowerCase();
  const combined = `${message} ${stack}`;

  if (EXPECTED_MESSAGES.has(message)) return "expected";
  if (WARNING_ERROR_TYPES.has(errorType)) return "warning";
  if (NETWORK_WARNING_TOKENS.some((token) => combined.includes(token))) return "warning";
  return "error";
}

export function isActionableCrash(row) {
  return classifyDiagnostic(row) === "error";
}
