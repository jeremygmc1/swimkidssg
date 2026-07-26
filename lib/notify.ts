// Sends a Telegram alert for a new form submission.
// No-ops when the env vars are unset (e.g. local dev), and never throws —
// a notification failure must not affect the visitor's submission.
export async function notifyNewLead(kind: string, row: Record<string, string>) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return

  const lines = Object.entries(row)
    .filter(([, value]) => value?.toString().trim())
    .map(([label, value]) => `${label}: ${value}`)
  const text = `🏊 ${kind}\n\n${lines.join('\n')}`

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
  } catch (err) {
    console.error('Telegram notify error:', err)
  }
}
