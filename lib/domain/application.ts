// Validation of the public application form (spec section 4). Pure: no I/O.
import { z } from 'zod'
import { normalizeEmail } from './membership'

export const HEARD_SOURCES = [
  'global_website',
  'italian_website',
  'word_of_mouth',
  'other',
] as const
export const KNOWLEDGE_LEVELS = ['none', 'basic', 'intermediate', 'advanced'] as const

export type HeardSource = (typeof HEARD_SOURCES)[number]
export type KnowledgeLevel = (typeof KNOWLEDGE_LEVELS)[number]

/** Field names as they appear in the form. */
export const APPLICATION_FIELDS = [
  'displayName',
  'firstName',
  'lastName',
  'email',
  'city',
  'motivation',
  'heardVia',
  'heardOther',
  'knowledge',
  'privacyAccepted',
  'specialCategoryConsent',
] as const
export type ApplicationField = (typeof APPLICATION_FIELDS)[number]

/** Why a field was refused; the form maps each code to a message. */
export type FieldError = 'required' | 'tooLong' | 'invalidEmail' | 'invalidChoice'

export type ApplicationData = {
  displayName: string
  realName: string
  email: string
  city: string
  motivation: string | null
  heardVia: HeardSource
  heardOther: string | null
  knowledge: KnowledgeLevel
}

export type ParsedApplication =
  | { ok: true; data: ApplicationData }
  | { ok: false; errors: Partial<Record<ApplicationField, FieldError>> }

const text = (max: number) => z.string().trim().max(max, 'tooLong')
const required = (max: number) => text(max).min(1, 'required')

const schema = z
  .object({
    displayName: required(60),
    firstName: required(80),
    lastName: required(80),
    email: z.string().trim().min(1, 'required').max(254, 'tooLong').pipe(z.email('invalidEmail')),
    city: required(100),
    motivation: text(1000),
    heardVia: z.enum(HEARD_SOURCES, 'invalidChoice'),
    heardOther: text(200),
    knowledge: z.enum(KNOWLEDGE_LEVELS, 'invalidChoice'),
    privacyAccepted: z.literal(true, 'required'),
    specialCategoryConsent: z.literal(true, 'required'),
  })
  .superRefine((value, ctx) => {
    if (value.heardVia === 'other' && !value.heardOther) {
      ctx.addIssue({ code: 'custom', path: ['heardOther'], message: 'required' })
    }
  })

/** Checkbox values arrive as 'on' when ticked and are absent otherwise. */
const ticked = (value: unknown) => value === 'on' || value === 'true'

const asText = (value: FormDataEntryValue | null | undefined) =>
  typeof value === 'string' ? value : ''

export function parseApplication(
  raw: Record<string, FormDataEntryValue | null | undefined>,
): ParsedApplication {
  const result = schema.safeParse({
    displayName: asText(raw.displayName),
    firstName: asText(raw.firstName),
    lastName: asText(raw.lastName),
    email: asText(raw.email),
    city: asText(raw.city),
    motivation: asText(raw.motivation),
    heardVia: asText(raw.heardVia),
    heardOther: asText(raw.heardOther),
    knowledge: asText(raw.knowledge),
    privacyAccepted: ticked(raw.privacyAccepted),
    specialCategoryConsent: ticked(raw.specialCategoryConsent),
  })
  if (!result.success) {
    const errors: Partial<Record<ApplicationField, FieldError>> = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0] as ApplicationField
      if (errors[field]) continue
      // An unchosen option is "required"; other issues carry their own code as the message.
      const unchosen = issue.code === 'invalid_value' && asText(raw[field]) === ''
      errors[field] = unchosen ? 'required' : (issue.message as FieldError)
    }
    return { ok: false, errors }
  }
  const v = result.data
  return {
    ok: true,
    data: {
      displayName: v.displayName,
      realName: `${v.firstName} ${v.lastName}`,
      email: normalizeEmail(v.email),
      city: v.city,
      motivation: v.motivation || null,
      heardVia: v.heardVia,
      heardOther: v.heardVia === 'other' ? v.heardOther : null,
      knowledge: v.knowledge,
    },
  }
}
