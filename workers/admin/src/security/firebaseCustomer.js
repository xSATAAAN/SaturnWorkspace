export async function verifyFirebaseCustomer(idToken, env) {
  const token = String(idToken || "").trim()
  if (!token) throw new Error("firebase_token_missing")
  const webApiKey = String(env.FIREBASE_WEB_API_KEY || "").trim()
  if (!webApiKey) throw new Error("firebase_not_configured")
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(webApiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ idToken: token }),
  })
  if (!response.ok) throw new Error("firebase_token_invalid")
  const payload = await response.json().catch(() => null)
  const user = payload?.users?.[0]
  const userId = String(user?.localId || "").trim()
  const email = String(user?.email || "").trim().toLowerCase()
  const emailVerified = Boolean(user?.emailVerified)
  if (!userId || !email || !emailVerified) throw new Error("firebase_user_not_verified")
  return { user_id: userId, email }
}
