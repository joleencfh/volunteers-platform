// Who may sign in. Membership is decided by email address (spec section 4): the verified email of
// the magic-link or Google identity must match an active member's email, case-insensitively.

export type SignInIdentity = {
  email_confirmed_at?: string | null
  identities?: { provider: string; identity_data?: Record<string, unknown> | null }[] | null
}

export type MemberRecord = { email: string; status: 'active' | 'deactivated' }

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Whether the provider vouches for the email address. A magic link proves it by being
 * delivered; a Google account must also report the address as verified.
 */
export function isEmailVerified(user: SignInIdentity): boolean {
  if (!user.email_confirmed_at) return false
  return (user.identities ?? [])
    .filter((identity) => identity.provider === 'google')
    .every((identity) => identity.identity_data?.email_verified === true)
}

/** True only for a verified identity whose email belongs to an active member record. */
export function mayEnter(
  identity: { email: string | null | undefined; verified: boolean },
  member: MemberRecord | null,
): boolean {
  if (!identity.verified || !identity.email || !member) return false
  if (member.status !== 'active') return false
  return normalizeEmail(member.email) === normalizeEmail(identity.email)
}
