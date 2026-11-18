'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/authz'
import { requireWgMember } from '@/lib/authz/wg'
import { refusalFromDbCode } from '@/lib/domain/activities'
import { isValidSlug } from '@/lib/domain/groups'
import { postmortemSchema } from '@/lib/domain/postmortem'
import { createClient } from '@/lib/supabase/server'

export type PostmortemState = {
  status: 'idle' | 'done' | 'invalid' | 'notAllowed' | 'notFound' | 'conflict' | 'unavailable'
}

const targetSchema = z.object({
  groupId: z.uuid(),
  slug: z.string().refine(isValidSlug),
  activityId: z.uuid(),
})

const text = (formData: FormData, key: string) => {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

/**
 * Saves the three postmortem texts of an activity. Any member of the group (and admins) get past
 * `requireWgMember`; who may actually write (participants, experienced members, admins) is decided
 * by save_postmortem in the database, which touches no other column and refuses archived activities.
 */
export async function savePostmortem(
  _previous: PostmortemState,
  formData: FormData,
): Promise<PostmortemState> {
  await requireUser()
  const target = targetSchema.safeParse({
    groupId: text(formData, 'groupId'),
    slug: text(formData, 'slug'),
    activityId: text(formData, 'activityId'),
  })
  if (!target.success) return { status: 'invalid' }
  await requireWgMember(target.data.groupId)

  const input = postmortemSchema.safeParse({
    wentWell: text(formData, 'wentWell'),
    improvements: text(formData, 'improvements'),
    learnings: text(formData, 'learnings'),
  })
  if (!input.success) return { status: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('save_postmortem', {
    p_activity: target.data.activityId,
    p_went_well: input.data.wentWell as string,
    p_improvements: input.data.improvements as string,
    p_learnings: input.data.learnings as string,
  })
  if (error) {
    const refusal = refusalFromDbCode(error.code)
    return { status: refusal }
  }

  revalidatePath('/groups/[slug]/activities/[id]', 'page')
  return { status: 'done' }
}
