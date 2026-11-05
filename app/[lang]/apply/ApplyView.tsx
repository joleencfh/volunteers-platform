'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Checkbox, FormField, Input, Select, Textarea } from '@/components/ui/fields'
import {
  HEARD_SOURCES,
  KNOWLEDGE_LEVELS,
  type ApplicationField,
  type FieldError,
} from '@/lib/domain/application'
import { useTranslations } from '@/lib/i18n/client'
import { submitApplication, type ApplyState } from './actions'

const initial: ApplyState = { status: 'idle' }

// Bots fill every field they find; people never see this one. Off-screen rather than display:none,
// which some bots skip. Out of the tab order and hidden from assistive technology.
const HONEYPOT = 'company_website'

export function ApplyView() {
  const t = useTranslations('apply')
  const [state, formAction, pending] = useActionState(submitApplication, initial)
  const values = state.values ?? {}
  // A refused submission re-renders the form from the echoed values, so key it to reset defaults.
  const formKey = state.status === 'invalid' ? JSON.stringify(values) : 'new'
  const [heardVia, setHeardVia] = useState(values.heardVia ?? '')

  const errorOf = (field: ApplicationField) => {
    const code: FieldError | undefined = state.errors?.[field]
    return code ? t(`errors.${code}`) : undefined
  }
  const hasErrors = state.status === 'invalid' && Object.keys(state.errors ?? {}).length > 0
  const notice =
    state.status === 'limited'
      ? t('tooManyRequests')
      : state.status === 'unavailable'
        ? t('unavailable')
        : hasErrors
          ? t('checkFields')
          : null

  return (
    <form
      key={formKey}
      action={formAction}
      className="flex max-w-xl flex-col gap-5"
      noValidate
      lang="it"
    >
      <p className="text-sm text-muted">{t('requiredNote')}</p>
      <p role="alert" className="text-base font-semibold text-danger empty:hidden">
        {notice}
      </p>

      <FormField
        id="displayName"
        label={t('displayName')}
        hint={t('displayNameHint')}
        error={errorOf('displayName')}
        required
      >
        {(control) => (
          <Input
            {...control}
            name="displayName"
            autoComplete="nickname"
            maxLength={60}
            defaultValue={values.displayName}
          />
        )}
      </FormField>

      <FormField id="firstName" label={t('firstName')} error={errorOf('firstName')} required>
        {(control) => (
          <Input
            {...control}
            name="firstName"
            autoComplete="given-name"
            maxLength={80}
            defaultValue={values.firstName}
          />
        )}
      </FormField>

      <FormField
        id="lastName"
        label={t('lastName')}
        hint={t('adminOnlyHint')}
        error={errorOf('lastName')}
        required
      >
        {(control) => (
          <Input
            {...control}
            name="lastName"
            autoComplete="family-name"
            maxLength={80}
            defaultValue={values.lastName}
          />
        )}
      </FormField>

      <FormField
        id="email"
        label={t('email')}
        hint={t('emailHint')}
        error={errorOf('email')}
        required
      >
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            defaultValue={values.email}
          />
        )}
      </FormField>

      <FormField
        id="city"
        label={t('city')}
        hint={t('adminOnlyHint')}
        error={errorOf('city')}
        required
      >
        {(control) => (
          <Input
            {...control}
            name="city"
            autoComplete="address-level2"
            maxLength={100}
            defaultValue={values.city}
          />
        )}
      </FormField>

      <FormField
        id="motivation"
        label={t('motivation')}
        hint={t('motivationHint')}
        error={errorOf('motivation')}
      >
        {(control) => (
          <Textarea
            {...control}
            name="motivation"
            maxLength={1000}
            defaultValue={values.motivation}
          />
        )}
      </FormField>

      <FormField
        id="heardVia"
        label={t('heardVia')}
        hint={t('adminOnlyHint')}
        error={errorOf('heardVia')}
        required
      >
        {(control) => (
          <Select
            {...control}
            name="heardVia"
            value={heardVia}
            onChange={(event) => setHeardVia(event.target.value)}
          >
            <option value="">{t('choose')}</option>
            {HEARD_SOURCES.map((source) => (
              <option key={source} value={source}>
                {t(`heardOptions.${source}`)}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      {heardVia === 'other' && (
        <FormField id="heardOther" label={t('heardOther')} error={errorOf('heardOther')} required>
          {(control) => (
            <Input
              {...control}
              name="heardOther"
              maxLength={200}
              defaultValue={values.heardOther}
            />
          )}
        </FormField>
      )}

      <FormField id="knowledge" label={t('knowledge')} error={errorOf('knowledge')} required>
        {(control) => (
          <Select {...control} name="knowledge" defaultValue={values.knowledge ?? ''}>
            <option value="">{t('choose')}</option>
            {KNOWLEDGE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {t(`knowledgeOptions.${level}`)}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-base font-semibold">{t('consentTitle')}</legend>
        <ConsentBox
          name="privacyAccepted"
          error={errorOf('privacyAccepted')}
          defaultChecked={values.privacyAccepted === 'on'}
          label={
            <>
              {t('privacyConsent')}{' '}
              <Link href="/privacy" className="underline" target="_blank">
                {t('privacyLink')}
              </Link>
              <span aria-hidden="true"> *</span>
            </>
          }
        />
        <ConsentBox
          name="specialCategoryConsent"
          error={errorOf('specialCategoryConsent')}
          defaultChecked={values.specialCategoryConsent === 'on'}
          label={
            <>
              {t('specialCategoryConsent')}
              <span aria-hidden="true"> *</span>
            </>
          }
        />
      </fieldset>

      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <input type="text" name={HONEYPOT} tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t('sending') : t('submit')}
      </Button>
    </form>
  )
}

function ConsentBox({
  name,
  label,
  error,
  defaultChecked,
}: {
  name: string
  label: React.ReactNode
  error?: string
  defaultChecked: boolean
}) {
  const errorId = error ? `${name}-error` : undefined
  return (
    <div className="flex flex-col gap-1">
      <Checkbox
        name={name}
        id={name}
        label={label}
        defaultChecked={defaultChecked}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
      />
      {error && (
        <p id={errorId} className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
