'use client'

import { useActionState, useId } from 'react'
import { assignLead, type AssignLeadState } from '@/app/[lang]/groups/[slug]/actions'
import { Button } from '@/components/ui/Button'
import { FormField, Select } from '@/components/ui/fields'
import { useFormatter, useTranslations } from '@/lib/i18n/client'

const initial: AssignLeadState = { status: 'idle' }

/** Picks a member and a week (the current one or one of the next four) and assigns the lead. */
export function AssignLeadForm({
  groupId,
  members,
  weeks,
}: {
  groupId: string
  members: { id: string; name: string }[]
  /** Mondays as `YYYY-MM-DD`, the current week first. */
  weeks: string[]
}) {
  const t = useTranslations('groups.leadWeek')
  const format = useFormatter()
  const [state, action, working] = useActionState(assignLead, initial)
  const id = useId()

  const failed = state.status !== 'idle' && state.status !== 'assigned'
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={`${id}-user`} label={t('member')}>
          {(props) => (
            <Select {...props} name="userId" required defaultValue="">
              <option value="" disabled>
                {t('chooseMember')}
              </option>
              {members.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField id={`${id}-week`} label={t('week')}>
          {(props) => (
            <Select {...props} name="weekStart" required defaultValue={weeks[0]}>
              {weeks.map((week) => (
                <option key={week} value={week}>
                  {t('weekOption', {
                    date: format.dateTime(new Date(`${week}T00:00:00Z`), {
                      dateStyle: 'medium',
                      timeZone: 'UTC',
                    }),
                  })}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>
      <div>
        <Button type="submit" disabled={working}>
          {working ? t('working') : t('assign')}
        </Button>
      </div>
      <p
        role={failed ? 'alert' : 'status'}
        className={`text-base font-semibold empty:hidden ${failed ? 'text-danger' : ''}`}
      >
        {state.status === 'idle' ? null : t(state.status)}
      </p>
    </form>
  )
}
