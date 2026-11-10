// The welcome document link (spec section 8, step 3). Pure: no I/O.
// The link is a setting in the config table (key onboarding.welcome_document_url), so whatever is
// stored there is untrusted: only an absolute http or https URL may become a link.

export const WELCOME_DOCUMENT_CONFIG_KEY = 'onboarding.welcome_document_url'

/** The safe URL to link to, or null when the value is empty, not a string or not http(s). */
export function parseWelcomeLink(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}
