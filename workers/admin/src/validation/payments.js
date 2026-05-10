const PLAN_VALUES = ['monthly', 'yearly']
const LOCALE_VALUES = ['en', 'ar']

function cleanText(value, maxLen = 180) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

export async function parseCreatePaymentRequest(request) {
  let payload
  try {
    payload = await request.json()
  } catch {
    throw new Error('invalid_json')
  }
  if (!payload || typeof payload !== 'object') throw new Error('invalid_payload')

  let plan = cleanText(payload.plan, 20).toLowerCase()
  if (plan === 'six_months') plan = 'yearly'
  if (!PLAN_VALUES.includes(plan)) throw new Error('invalid_plan')

  const locale = cleanText(payload.locale, 4).toLowerCase()
  const safeLocale = LOCALE_VALUES.includes(locale) ? locale : 'en'

  const customer = payload.customer && typeof payload.customer === 'object' ? payload.customer : {}
  const email = cleanText(customer.email, 120)
  const phone = cleanText(customer.phone, 40)
  const contact = cleanText(customer.contact, 120)
  const notes = cleanText(payload.notes, 500)
  const idToken = String(payload.id_token || '').trim().slice(0, 6000)

  return {
    plan,
    id_token: idToken,
    locale: safeLocale,
    customer: {
      email,
      phone,
      contact,
    },
    notes,
  }
}
