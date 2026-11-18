// Activity type registry (T-02, ADR-0020). To add a type: create one file in this folder that exports
// an ActivityTypeDefinition, add it to DEFINITIONS below, and add its labels under `activityTypes` in
// messages/en.json and messages/it.json. No migration: `activities.type` is text and `details` is JSON.
// A type is never removed or renamed once rows use it; mark it `selectable: false` instead.
import { callWithTargetType } from './call-with-target'
import { campaignType } from './campaign'
import { contentCreationType } from './content-creation'
import { generalType } from './general'
import { meetingType } from './meeting'
import type { ActivityTypeDefinition } from './types'

export type { ActivityTypeDefinition, FieldDefinition, FieldInput } from './types'
export { localToInstant } from './common'

const DEFINITIONS: readonly ActivityTypeDefinition[] = [
  generalType,
  campaignType,
  callWithTargetType,
  meetingType,
  contentCreationType,
]

export type ActivityTypeRegistry = {
  all: readonly ActivityTypeDefinition[]
  get: (key: string) => ActivityTypeDefinition | undefined
  selectable: () => ActivityTypeDefinition[]
  isKey: (value: unknown) => boolean
  parseLoosely: (type: string, details: unknown) => Record<string, unknown>
}

/** Builds a registry from definitions (the app's one below; tests build others). Refuses duplicate keys. */
export function createRegistry(
  definitions: readonly ActivityTypeDefinition[],
): ActivityTypeRegistry {
  const byKey = new Map<string, ActivityTypeDefinition>()
  for (const definition of definitions) {
    if (byKey.has(definition.key)) throw new Error(`Duplicate activity type: ${definition.key}`)
    byKey.set(definition.key, definition)
  }
  const get = (key: string) => byKey.get(key)
  return {
    all: definitions,
    get,
    selectable: () => definitions.filter((definition) => definition.selectable),
    isKey: (value) => typeof value === 'string' && byKey.has(value),
    parseLoosely(type, details) {
      const definition = get(type)
      if (
        !definition ||
        typeof details !== 'object' ||
        details === null ||
        Array.isArray(details)
      ) {
        return {}
      }
      const stored = details as Record<string, unknown>
      const known: Record<string, unknown> = {}
      for (const [name, schema] of Object.entries(definition.shape)) {
        if (!(name in stored)) continue
        const result = schema.safeParse(stored[name])
        if (result.success) known[name] = result.data
      }
      return known
    },
  }
}

const registry = createRegistry(DEFINITIONS)

export const ACTIVITY_TYPES = registry.all
export const getActivityType = registry.get
/** The types the create form offers (General is created by the database). */
export const selectableTypes = registry.selectable
/** True when the value is the key of a registered type (General included). */
export const isActivityTypeKey = (value: unknown): value is string => registry.isKey(value)

/**
 * The known, valid fields of a stored `details` value, never throwing: unknown keys, invalid values
 * and unknown types are dropped, so old rows stay readable after a schema change.
 */
export const parseDetailsLoosely = registry.parseLoosely
