import { Badge } from '@/components/ui/display'
import { getTranslations } from '@/lib/i18n/server'
import type { UserLevel } from '@/lib/domain/review'

/** The member's level, shown on every profile. */
export async function LevelBadge({ level }: { level: UserLevel }) {
  const t = await getTranslations('profile')
  return (
    <Badge tone="brand">
      {t('levelLabel')}: {t(`levels.${level}`)}
    </Badge>
  )
}
