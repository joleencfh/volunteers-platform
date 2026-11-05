// Validation of an admin's decision on an application (spec sections 3 and 4). Pure: no I/O.
import { z } from 'zod'

export const USER_LEVELS = ['new', 'fresh', 'experienced'] as const
export type UserLevel = (typeof USER_LEVELS)[number]

/** Everyone starts as `new`; an admin may start someone who is already experienced higher. */
export const DEFAULT_START_LEVEL: UserLevel = 'new'

export const REASON_MAX_LENGTH = 500

/** Why a decision was refused; the form maps each code to a message. */
export type ReviewError = 'invalidApplication' | 'invalidLevel' | 'reasonRequired' | 'tooLong'

export type ReviewField = 'applicationId' | 'level' | 'reason'

export type ParsedApproval =
  | { ok: true; data: { applicationId: string; level: UserLevel; reason: string | null } }
  | { ok: false; errors: Partial<Record<ReviewField, ReviewError>> }

export type ParsedRejection =
  | { ok: true; data: { applicationId: string } }
  | { ok: false; errors: Partial<Record<ReviewField, ReviewError>> }

const applicationId = z.uuid('invalidApplication')

const approvalSchema = z
  .object({
    applicationId,
    level: z.enum(USER_LEVELS, 'invalidLevel'),
    reason: z.string().trim().max(REASON_MAX_LENGTH, 'tooLong'),
  })
  .superRefine((value, context) => {
    // A higher starting level is a judgement call that later readers of the log must be able to
    // follow, so it needs a reason.
    if (value.level !== DEFAULT_START_LEVEL && value.reason === '') {
      context.addIssue({ code: 'custom', path: ['reason'], message: 'reasonRequired' })
    }
  })

function errorsOf(error: z.ZodError): Partial<Record<ReviewField, ReviewError>> {
  const errors: Partial<Record<ReviewField, ReviewError>> = {}
  for (const issue of error.issues) {
    const field = issue.path[0] as ReviewField
    errors[field] ??= issue.message as ReviewError
  }
  return errors
}

/** Parses the approve form. The reason is only kept when a higher level was chosen. */
export function parseApproval(raw: Record<string, unknown>): ParsedApproval {
  const result = approvalSchema.safeParse({
    applicationId: raw.applicationId,
    level: raw.level ?? DEFAULT_START_LEVEL,
    reason: typeof raw.reason === 'string' ? raw.reason : '',
  })
  if (!result.success) return { ok: false, errors: errorsOf(result.error) }
  const { level, reason } = result.data
  return {
    ok: true,
    data: {
      applicationId: result.data.applicationId,
      level,
      reason: level === DEFAULT_START_LEVEL || reason === '' ? null : reason,
    },
  }
}

export function parseRejection(raw: Record<string, unknown>): ParsedRejection {
  const result = z.object({ applicationId }).safeParse({ applicationId: raw.applicationId })
  if (!result.success) return { ok: false, errors: errorsOf(result.error) }
  return { ok: true, data: { applicationId: result.data.applicationId } }
}
