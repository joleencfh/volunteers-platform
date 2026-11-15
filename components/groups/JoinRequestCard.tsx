import { Card } from '@/components/ui/display'
import { getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { JoinRequestButton } from './JoinRequestButton'

/**
 * The area of the limited view that says full details are for members, with the way in: a "Request
 * to join" button, or the news that a request is already waiting. A person can read only their own
 * requests (row-level security), so this never shows anyone else's.
 */
export async function JoinRequestCard({ groupId, userId }: { groupId: string; userId: string }) {
  const t = await getTranslations('groups')
  const supabase = await createClient()
  const { data } = await supabase
    .from('wg_join_requests')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .limit(1)
  const pending = (data?.length ?? 0) > 0

  return (
    <Card className="flex flex-col gap-3 bg-surface">
      <h2 className="text-xl font-bold">{t('limitedTitle')}</h2>
      <p className="max-w-prose">{t('limitedBody')}</p>
      {pending ? (
        <div role="status" className="flex flex-col gap-1">
          <p className="font-semibold">{t('join.pendingTitle')}</p>
          <p className="max-w-prose">{t('join.pendingBody')}</p>
        </div>
      ) : (
        <JoinRequestButton groupId={groupId} />
      )}
    </Card>
  )
}
