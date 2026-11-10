import { EmptyState } from '@/components/ui/display'
import { getTranslations } from '@/lib/i18n/server'

/** Where "latest and planned work" goes once activities exist (story T-06 fills it). */
export async function ActivityFeedPlaceholder() {
  const t = await getTranslations('profile')
  return (
    <section aria-labelledby="activity-heading" className="flex flex-col gap-3">
      <h2 id="activity-heading" className="text-2xl font-bold">
        {t('activityHeading')}
      </h2>
      <EmptyState title={t('activityPlaceholder')} />
    </section>
  )
}
