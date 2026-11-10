'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Input, Select, Textarea } from '@/components/ui/fields'
import { KNOWLEDGE_LEVELS } from '@/lib/domain/application'
import {
  PROFILE_LIMITS,
  VISIBILITY_TIERS,
  type ProfileField,
  type VisibilityTier,
} from '@/lib/domain/profile-fields'
import { useTranslations } from '@/lib/i18n/client'
import { saveProfile, type ProfileState } from './actions'

export type ProfileValues = {
  displayName: string
  city: string
  bio: string
  linkedinUrl: string
  aiSafetyKnowledge: string
  aiRisks: string
  visibility: Record<ProfileField, VisibilityTier>
}

const initial: ProfileState = { status: 'idle' }

/** The member's own profile: each optional field with a selector for who may see it. */
export function ProfileForm({ values }: { values: ProfileValues }) {
  const t = useTranslations('profile')
  const [state, action, pending] = useActionState(saveProfile, initial)
  const errors = state.errors ?? {}
  const error = (field: keyof typeof errors) =>
    errors[field] ? t(`errors.${errors[field]}`) : undefined

  const visibilitySelect = (field: ProfileField) => (
    <FormField id={`visibility-${field}`} label={t('visibility')} error={error(field)}>
      {(control) => (
        <Select {...control} name={`visibility.${field}`} defaultValue={values.visibility[field]}>
          {VISIBILITY_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {t(`tiers.${tier}`)}
            </option>
          ))}
        </Select>
      )}
    </FormField>
  )

  const message =
    state.status === 'saved'
      ? t('saved')
      : state.status === 'unavailable'
        ? t('unavailable')
        : state.status === 'invalid'
          ? t('checkFields')
          : null

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <p className="text-sm text-muted">{t('requiredNote')}</p>

      <FormField
        id="displayName"
        label={t('displayName')}
        hint={t('displayNameHint')}
        error={error('displayName')}
        required
      >
        {(control) => (
          <Input
            {...control}
            name="displayName"
            defaultValue={values.displayName}
            maxLength={PROFILE_LIMITS.displayName}
            autoComplete="nickname"
          />
        )}
      </FormField>

      <fieldset className="flex flex-col gap-3">
        <FormField id="city" label={t('city')} error={error('city')}>
          {(control) => (
            <Input
              {...control}
              name="city"
              defaultValue={values.city}
              maxLength={PROFILE_LIMITS.city}
            />
          )}
        </FormField>
        {visibilitySelect('city')}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <FormField id="bio" label={t('bio')} hint={t('bioHint')} error={error('bio')}>
          {(control) => (
            <Textarea
              {...control}
              name="bio"
              defaultValue={values.bio}
              maxLength={PROFILE_LIMITS.bio}
            />
          )}
        </FormField>
        {visibilitySelect('bio')}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <FormField
          id="linkedinUrl"
          label={t('linkedinUrl')}
          hint={t('linkedinUrlHint')}
          error={error('linkedinUrl')}
        >
          {(control) => (
            <Input
              {...control}
              name="linkedinUrl"
              type="url"
              inputMode="url"
              defaultValue={values.linkedinUrl}
              maxLength={PROFILE_LIMITS.linkedinUrl}
            />
          )}
        </FormField>
        {visibilitySelect('linkedin_url')}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <FormField id="aiSafetyKnowledge" label={t('knowledge')} error={error('aiSafetyKnowledge')}>
          {(control) => (
            <Select {...control} name="aiSafetyKnowledge" defaultValue={values.aiSafetyKnowledge}>
              <option value="">{t('knowledgeNotGiven')}</option>
              {KNOWLEDGE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t(`knowledgeOptions.${level}`)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        {visibilitySelect('ai_safety_knowledge')}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <FormField id="aiRisks" label={t('aiRisks')} error={error('aiRisks')}>
          {(control) => (
            <Textarea
              {...control}
              name="aiRisks"
              defaultValue={values.aiRisks}
              maxLength={PROFILE_LIMITS.aiRisks}
            />
          )}
        </FormField>
        {visibilitySelect('ai_risks')}
      </fieldset>

      <div className="flex flex-col gap-3">
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? t('saving') : t('save')}
        </Button>
        <p
          role={state.status === 'saved' || state.status === 'idle' ? 'status' : 'alert'}
          className={`text-base font-semibold empty:hidden ${
            state.status === 'saved' ? '' : 'text-danger'
          }`}
        >
          {message}
        </p>
      </div>
    </form>
  )
}
