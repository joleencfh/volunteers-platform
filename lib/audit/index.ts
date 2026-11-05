import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'

export type AuditEntry = {
  /** The admin who acted; null for actions by the system itself. */
  actorId: string | null
  /** What happened, for example 'application.approved'. */
  action: string
  entityType: string
  entityId?: string
  /** Ids and reasons only. Never put names, emails or other personal data here. */
  details?: Json
}

/**
 * Appends to the audit log. Pass the service-role client: only the service role may write to
 * audit_log, and it can neither change nor delete what is already there.
 * Throws if the write fails, so an action cannot complete without its audit entry.
 */
export async function recordAudit(
  client: SupabaseClient<Database>,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await client.from('audit_log').insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    details: entry.details ?? {},
  })
  // The database message can quote row values, so only the code leaves this function.
  if (error) throw new Error(`Audit write failed (${error.code}) for ${entry.action}`)
}
