import 'server-only'

export type EmailMessage = {
  to: string
  subject: string
  text: string
}

/** Sends one message or throws. Swappable so tests never reach a real provider. */
export type EmailTransport = (message: EmailMessage) => Promise<void>

const RESEND_URL = 'https://api.resend.com/emails'

/**
 * Resend over its HTTP API. Errors carry the status only: the response body and the message can
 * quote the recipient's address, which must not reach logs.
 */
export function createResendTransport(
  apiKey: string,
  from: string,
  fetchImpl: typeof fetch = fetch,
): EmailTransport {
  return async (message) => {
    const response = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    })
    if (!response.ok) throw new Error(`Email provider refused the message (${response.status})`)
  }
}

let override: EmailTransport | null = null

/** For tests: replaces the real transport. Pass null to restore it. */
export function setEmailTransport(transport: EmailTransport | null): void {
  override = transport
}

function configuredTransport(): EmailTransport {
  if (override) return override
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) throw new Error('Email is not configured (RESEND_API_KEY, EMAIL_FROM).')
  return createResendTransport(apiKey, from)
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await configuredTransport()(message)
}
