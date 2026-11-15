import { Card } from '@/components/ui/display'
import { getTranslations } from '@/lib/i18n/server'

/** The area of the limited view that says full details are for members. W-03 adds the join button here. */
export async function JoinRequestPlaceholder() {
  const t = await getTranslations('groups')
  return (
    <Card className="flex flex-col gap-2 bg-surface">
      <h2 className="text-xl font-bold">{t('limitedTitle')}</h2>
      <p className="max-w-prose">{t('limitedBody')}</p>
    </Card>
  )
}
