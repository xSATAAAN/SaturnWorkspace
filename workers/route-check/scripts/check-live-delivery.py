from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request


ROUTE_ORIGIN = "https://route-check.saturnws.com"
POLICY_ORIGIN = "https://api.saturnws.com"
TIMEOUT_SECONDS = 8
POLICY_USER_AGENT = "SaturnWorkspace-RouteCapability/1"
ROUTE_USER_AGENT = "SaturnWorkspace-RouteCheck/1"


def request_json(url: str, *, user_agent: str, expected_status: int, expected_error: str) -> None:
    request = urllib.request.Request(
        url,
        data=b"{}",
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "User-Agent": user_agent,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            status = response.status
            content_type = str(response.headers.get("Content-Type") or "").lower()
            raw = response.read(64 * 1024)
    except urllib.error.HTTPError as exc:
        status = exc.code
        content_type = str(exc.headers.get("Content-Type") or "").lower()
        raw = exc.read(64 * 1024)
    if status != expected_status or "application/json" not in content_type:
        raise RuntimeError(f"delivery_boundary_rejected:{urllib.parse.urlsplit(url).hostname}:{status}")
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"delivery_response_invalid:{url}") from exc
    if not isinstance(body, dict) or body.get("error") != expected_error:
        raise RuntimeError(f"delivery_contract_mismatch:{url}")


request_json(
    f"{POLICY_ORIGIN}/v1/route-check/capability",
    user_agent=POLICY_USER_AGENT,
    expected_status=400,
    expected_error="invalid_route_attempt",
)
request_json(
    f"{ROUTE_ORIGIN}/v1/host-exit",
    user_agent=ROUTE_USER_AGENT,
    expected_status=401,
    expected_error="route_capability_required",
)
for hostname in ("v4.route-check.saturnws.com", "v6.route-check.saturnws.com"):
    request_json(
        f"https://{hostname}/v1/network",
        user_agent=ROUTE_USER_AGENT,
        expected_status=403,
        expected_error="forbidden_origin",
    )

print(json.dumps({
    "status": "PASS",
    "transport": "python_urllib",
    "policy_capability_reached": True,
    "route_worker_reached": True,
    "browser_only_edge_challenge_absent": True,
    "sent_capability_or_user_data": False,
}))
