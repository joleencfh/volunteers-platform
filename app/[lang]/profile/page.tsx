import { connection } from 'next/server'
import { Suspense } from 'react'
import { LevelBadge } from '@/components/profile/LevelBadge'
import { Card } from '@/components/ui/display'
import { requireUser } from '@/lib/authz'
import {
  DEFAULT_TIERS,
  PROFILE_FIELDS,
  VISIBILITY_TIERS,
  type ProfileField,
  type VisibilityTier,
} from '@/lib/domain/profile-fields'
import { getFormatter, getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { ProfileForm } from './ProfileForm'

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileContent />
    </Suspense>
  )
}

async function ProfileContent() {
  // The session is read with a timestamp, so wait for the request instead of prerendering.
  await connection()
  const member = await requireUser()
  const t = await getTranslations('profile')
  const format = await getFormatter()

  // The member's own row, through the same function everyone else's profile goes through.
  const supabase = await createClient()
  const [{ data: profile }, { data: choices }] = await Promise.all([
    supabase.rpc('get_profile', { owner: member.id }),
    supabase.from('profile_visibility').select('field, tier').eq('user_id', member.id),
  ])
  const own = profile?.[0]

  const visibility: Record<ProfileField, VisibilityTier> = { ...DEFAULT_TIERS }
  for (const choice of choices ?? []) {
    const field = PROFILE_FIELDS.find((candidate) => candidate === choice.field)
    const tier = VISIBILITY_TIERS.find((candidate) => candidate === choice.tier)
    if (field && tier) visibility[field] = tier
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-4xl font-bold">{t('title')}</h1>
        <LevelBadge level={member.level} />
      </div>
      <p className="max-w-prose">{t('intro')}</p>

      <ProfileForm
        values={{
          displayName: own?.display_name ?? member.displayName,
          city: own?.city ?? '',
          bio: own?.bio ?? '',
          linkedinUrl: own?.linkedin_url ?? '',
          aiSafetyKnowledge: own?.ai_safety_knowledge ?? '',
          aiRisks: own?.ai_risks ?? '',
          visibility,
        }}
      />

      <section aria-labelledby="fixed-heading" className="flex flex-col gap-3">
        <h2 id="fixed-heading" className="text-2xl font-bold">
          {t('fixedHeading')}
        </h2>
        <Card>
          <p className="mb-3 text-muted">{t('fixedHint')}</p>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
            <dt className="font-semibold">{t('realName')}</dt>
            <dd className="break-words">{own?.real_name}</dd>
            <dt className="font-semibold">{t('email')}</dt>
            <dd className="break-words">{own?.email ?? member.email}</dd>
            {own?.joined_at && (
              <>
                <dt className="font-semibold">{t('joinedAt')}</dt>
                <dd>{format.dateTime(new Date(own.joined_at), { dateStyle: 'medium' })}</dd>
              </>
            )}
          </dl>
        </Card>
      </section>
    </div>
  )
}
