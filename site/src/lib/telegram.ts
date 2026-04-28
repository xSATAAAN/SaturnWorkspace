export function buildTelegramDeepLink(opts: {
  telegramUsername: string
  message: string
}) {
  const username = opts.telegramUsername.replace(/^@/, '').trim()
  const text = encodeURIComponent(opts.message)
  return `https://t.me/${encodeURIComponent(username)}?text=${text}`
}

