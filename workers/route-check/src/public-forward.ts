import { error, readJson } from "./route-attempt-core.js"

type RouteAttemptFetcher = {
  fetch(request: Request): Promise<Response>
}

function internalRequest(request: Request, path: string, body: string): Request {
  const headers = new Headers({ "Content-Type": "application/json" })
  for (const name of ["X-Route-Token", "CF-Connecting-IP"]) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  return new Request(`https://route-attempt.invalid${path}`, {
    method: "POST",
    headers,
    body,
  })
}

export async function forwardJsonRequest(
  request: Request,
  stub: RouteAttemptFetcher,
  path: string,
): Promise<Response> {
  let body: string
  try {
    body = JSON.stringify(await readJson(request))
  } catch (caught) {
    const tooLarge = caught instanceof Error && caught.message === "request_too_large"
    return error(tooLarge ? "request_too_large" : "invalid_json", tooLarge ? 413 : 400)
  }

  try {
    return await stub.fetch(internalRequest(request, path, body))
  } catch {
    return error("route_check_unavailable", 503)
  }
}
