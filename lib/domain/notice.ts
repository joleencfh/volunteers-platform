// The version of the Italian privacy notice. The application form records it with the consent
// timestamps. Change it whenever the notice text changes in a way applicants must agree to again.
export const NOTICE_VERSION = '2026-11-draft-1'

/** Used only when `config` cannot be read; the values match the migration's seed. */
export const DEFAULT_RETENTION_MONTHS = { rejectedApplications: 6, leavers: 12 }

/** Replace `{name}` tokens in a notice paragraph. Unknown tokens are left as written. */
export function fillNotice(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (token, name: string) =>
    name in values ? String(values[name]) : token,
  )
}
