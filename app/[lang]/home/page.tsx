import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { buttonClasses } from '@/components/ui/Button'
import { Card } from '@/components/ui/display'
import { requireUser } from '@/lib/authz'
import { autoOpenStepKey, buildChecklist } from '@/lib/domain/onboarding'
import { profileCompletion } from '@/lib/domain/profile-completion'
import { parseWelcomeLink, WELCOME_DOCUMENT_CONFIG_KEY } from '@/lib/domain/welcome-document'
import { getTranslations } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { OnboardingChecklist, type ChecklistRow } from './OnboardingChecklist'

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  )
}

async function HomeContent() {
  // The session is read with a timestamp, so wait for the request instead of prerendering.
  await connection()
  const member = await requireUser()
  const t = await getTranslations('home')
  const tAll = await getTranslations()

  // Everything is read with the member's own session: row-level security shows them the step
  // definitions and only their own progress, and get_profile returns their own profile.
  const supabase = await createClient()
  const [{ data: steps }, { data: completed }, { data: profile }, { data: welcome }] =
    await Promise.all([
      supabase
        .from('onboarding_steps')
        .select('id, key, title_key, confirmed_by, position, active'),
      supabase.from('user_onboarding').select('step_id').eq('user_id', member.id),
      supabase.rpc('get_profile', { owner: member.id }),
      // The config table is readable by active members; the link is checked before it is shown.
      supabase.from('config').select('value').eq('key', WELCOME_DOCUMENT_CONFIG_KEY).maybeSingle(),
    ])

  const checklist = buildChecklist(
    (steps ?? []).map((step) => ({
      id: step.id,
      key: step.key,
      titleKey: step.title_key,
      confirmedBy: step.confirmed_by,
      position: step.position,
      active: step.active,
    })),
    (completed ?? []).map((row) => row.step_id),
  )
  const rows: ChecklistRow[] = checklist.items.map((item) => ({
    ...item,
    // The title lives in messages under title_key; a step added without a message shows its key.
    title: tAll.has(item.titleKey as never) ? tAll(item.titleKey as never) : item.key,
  }))

  const own = profile?.[0]
  const completion = profileCompletion({ city: own?.city, bio: own?.bio })
  const missing = completion.missing
    .map((field) => t(`profilePrompt.fields.${field}`))
    .join(t('profilePrompt.separator'))

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-4xl font-bold">{t('welcome', { name: member.displayName })}</h1>

      {!completion.complete && (
        <Card className="flex flex-col items-start gap-3" aria-labelledby="profile-prompt-heading">
          <h2 id="profile-prompt-heading" className="text-xl font-bold">
            {t('profilePrompt.title')}
          </h2>
          <p className="max-w-prose">{t('profilePrompt.body', { missing })}</p>
          <Link href="/profile" className={buttonClasses('primary')}>
            {t('profilePrompt.action')}
          </Link>
        </Card>
      )}

      <OnboardingChecklist
        rows={rows}
        doneCount={checklist.doneCount}
        total={checklist.total}
        complete={checklist.complete}
        autoOpenKey={autoOpenStepKey(checklist.items)}
        welcomeUrl={parseWelcomeLink(welcome?.value)}
        // Activities arrive with M3 (T-06); until then the window shows its empty state.
        activities={[]}
      />
    </div>
  )
}
