// Telegram helpers.
// All functions no-op when the env vars are unset (e.g. local dev) and never
// throw — a notification failure must not affect the caller's main flow.

const API_BASE = 'https://api.telegram.org'

function creds(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return null
  return { token, chatId }
}

// Sends a plain-text message to the configured chat.
export async function sendTelegramMessage(text: string, chatId?: string): Promise<void> {
  const c = creds()
  if (!c) return
  try {
    await fetch(`${API_BASE}/bot${c.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId ?? c.chatId, text }),
    })
  } catch (err) {
    console.error('Telegram sendMessage error:', err)
  }
}

// Sends a Telegram alert for a new form submission.
export async function notifyNewLead(kind: string, row: Record<string, string>) {
  const lines = Object.entries(row)
    .filter(([, value]) => value?.toString().trim())
    .map(([label, value]) => `${label}: ${value}`)
  await sendTelegramMessage(`🏊 ${kind}\n\n${lines.join('\n')}`)
}
