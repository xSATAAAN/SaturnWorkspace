const PLAN_VALUES = ['monthly', 'six_months']
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

  const plan = cleanText(payload.plan, 20).toLowerCase()
  if (!PLAN_VALUES.includes(plan)) throw new Error('invalid_plan')

  const locale = cleanText(payload.locale, 4).toLowerCase()
  const safeLocale = LOCALE_VALUES.includes(locale) ? locale : 'en'

  const customer = payload.customer && typeof payload.customer === 'object' ? payload.customer : {}
  const email = cleanText(customer.email, 120)
  const phone = cleanText(customer.phone, 40)
  const contact = cleanText(customer.contact, 120)
  const notes = cleanText(payload.notes, 500)

  return {
    plan,
    locale: safeLocale,
    customer: {
      email,
      phone,
      contact,
    },
    notes,
  }
}
