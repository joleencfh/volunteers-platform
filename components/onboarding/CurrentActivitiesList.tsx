'use client'

import { useTranslations } from '@/lib/i18n/client'

export type CurrentActivity = { id: string; title: string }

/**
 * The current activities shown in the onboarding window of step 4. Activities arrive with
 * M3 (T-06); until then the list is empty and the empty state is shown.
 */
export function CurrentActivitiesList({ activities }: { activities: readonly CurrentActivity[] }) {
  const t = useTranslations('onboarding.window')
  if (activities.length === 0) return <p>{t('activitiesEmpty')}</p>
  return (
    <ul className="list-disc pl-5">
      {activities.map((activity) => (
        <li key={activity.id}>{activity.title}</li>
      ))}
    </ul>
  )
}
