'use client'

import { useTranslations } from '@/lib/i18n/client'

export type CurrentActivity = {
  id: string
  title: string
  /** The group the activity belongs to, when known. */
  groupName?: string
  /** planned or active; shown as a label when it is one of the known statuses. */
  status?: string
}

/**
 * The current activities shown in the onboarding window of step 4: the pages choose which
 * activities the member may see. An empty list shows the empty state.
 */
export function CurrentActivitiesList({ activities }: { activities: readonly CurrentActivity[] }) {
  const t = useTranslations('onboarding.window')
  const ts = useTranslations('activities.status')
  if (activities.length === 0) return <p>{t('activitiesEmpty')}</p>
  return (
    <ul className="list-disc pl-5">
      {activities.map((activity) => {
        const status =
          activity.status === 'planned' || activity.status === 'active' ? ts(activity.status) : null
        const meta = [activity.groupName, status].filter(Boolean).join(', ')
        return (
          <li key={activity.id}>
            {activity.title}
            {meta && <span className="text-muted">{` (${meta})`}</span>}
          </li>
        )
      })}
    </ul>
  )
}
