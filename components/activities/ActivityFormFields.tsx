'use client'

import { useId } from 'react'
import { Checkbox, FormField, Input, Select, Textarea } from '@/components/ui/fields'
import {
  ACTIVITY_DESCRIPTION_MAX_LENGTH,
  ACTIVITY_STATUSES,
  ACTIVITY_TITLE_MAX_LENGTH,
  type ActivityStatus,
} from '@/lib/domain/activities'
import { LINK_LABEL_MAX_LENGTH, LINK_ROWS, type DetailDefaults } from '@/lib/domain/activity-input'
import type { FieldDefinition } from '@/lib/domain/activity-types'
import { MAX_URL_LENGTH } from '@/lib/domain/meetings'
import { useTranslations } from '@/lib/i18n/client'
import { DetailFields } from './DetailFields'

/** What an edit form starts with; a create form passes nothing. */
export type ActivityDefaults = {
  title: string
  description: string
  status: ActivityStatus
  startsOn: string
  dueOn: string
  keyActivity: boolean
  links: { label: string; url: string }[]
  details: DetailDefaults
}

/** The fields shared by the create and edit forms: common fields, the type's fields, and links. */
export function ActivityFormFields({
  fields,
  defaults,
}: {
  fields: readonly FieldDefinition[]
  defaults?: ActivityDefaults
}) {
  const t = useTranslations('activities.form')
  const ts = useTranslations('activities.status')
  const id = useId()

  return (
    <>
      <FormField id={`${id}-title`} label={t('title')} required>
        {(props) => (
          <Input
            {...props}
            name="title"
            required
            maxLength={ACTIVITY_TITLE_MAX_LENGTH}
            autoComplete="off"
            defaultValue={defaults?.title}
          />
        )}
      </FormField>
      <FormField id={`${id}-description`} label={t('description')}>
        {(props) => (
          <Textarea
            {...props}
            name="description"
            maxLength={ACTIVITY_DESCRIPTION_MAX_LENGTH}
            defaultValue={defaults?.description}
          />
        )}
      </FormField>
      <FormField id={`${id}-status`} label={t('status')}>
        {(props) => (
          <Select {...props} name="status" defaultValue={defaults?.status ?? 'planned'}>
            {ACTIVITY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ts(status)}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${id}-starts`} label={t('startsOn')}>
          {(props) => (
            <Input {...props} type="date" name="startsOn" defaultValue={defaults?.startsOn} />
          )}
        </FormField>
        <FormField id={`${id}-due`} label={t('dueOn')}>
          {(props) => <Input {...props} type="date" name="dueOn" defaultValue={defaults?.dueOn} />}
        </FormField>
      </div>
      <Checkbox
        name="keyActivity"
        label={t('keyActivity')}
        defaultChecked={defaults?.keyActivity}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-bold">{t('typeFields')}</legend>
        <DetailFields fields={fields} defaults={defaults?.details} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-bold">{t('links')}</legend>
        <p className="text-sm text-muted">{t('linksHint')}</p>
        {Array.from({ length: LINK_ROWS }, (_, index) => (
          <div key={index} className="grid gap-3 sm:grid-cols-2">
            <FormField
              id={`${id}-link-label-${index}`}
              label={t('linkLabel', { number: index + 1 })}
            >
              {(props) => (
                <Input
                  {...props}
                  name={`links.label.${index}`}
                  maxLength={LINK_LABEL_MAX_LENGTH}
                  defaultValue={defaults?.links[index]?.label}
                />
              )}
            </FormField>
            <FormField id={`${id}-link-url-${index}`} label={t('linkUrl', { number: index + 1 })}>
              {(props) => (
                <Input
                  {...props}
                  type="url"
                  name={`links.url.${index}`}
                  maxLength={MAX_URL_LENGTH}
                  pattern="https://\S+"
                  defaultValue={defaults?.links[index]?.url}
                />
              )}
            </FormField>
          </div>
        ))}
      </fieldset>
    </>
  )
}
