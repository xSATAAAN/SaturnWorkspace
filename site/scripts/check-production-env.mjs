const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
]

const missing = required.filter((key) => !process.env[key])

if (missing.length > 0) {
  console.error(`Missing required production frontend env: ${missing.join(', ')}`)
  process.exit(1)
}

console.log('Production frontend env check passed.')
