'use client'

import { useId } from 'react'
import { FormField, Input, Select, Textarea } from '@/components/ui/fields'
import {
  MATERIAL_KIND_OPTIONS,
  MATERIAL_ROWS,
  type DetailDefaults,
} from '@/lib/domain/activity-input'
import type { FieldDefinition } from '@/lib/domain/activity-types'
import { useTranslations } from '@/lib/i18n/client'

/**
 * The type-specific fields of an activity, rendered from the registry's field definitions (no schema
 * is duplicated here: the server validates with the type's `detailsSchema`). Field names are
 * `details.<name>`; see `readDetails` in lib/domain/activity-input.ts for how they are read back.
 */
export function DetailFields({
  fields,
  defaults,
}: {
  fields: readonly FieldDefinition[]
  defaults?: DetailDefaults
}) {
  const t = useTranslations('activityTypes')
  const td = useTranslations('activities.form')
  const id = useId()

  return (
    <>
      {fields.map((field) => {
        const fieldId = `${id}-${field.name}`
        const name = `details.${field.name}`
        const label = t(field.labelKey as never)
        const initial = defaults?.values[field.name] ?? ''
        if (field.input === 'list' && field.itemKind === 'material') {
          return (
            <fieldset key={field.name} className="flex flex-col gap-3">
              <legend className="text-base font-semibold">{label}</legend>
              <p className="text-sm text-muted">{td('materialHint')}</p>
              {Array.from({ length: MATERIAL_ROWS }, (_, index) => (
                <div key={index} className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                  <FormField
                    id={`${fieldId}-kind-${index}`}
                    label={td('materialKind', { number: index + 1 })}
                  >
                    {(props) => (
                      <Select
                        {...props}
                        name={`${name}.kind.${index}`}
                        defaultValue={defaults?.materials[field.name]?.[index]?.kind ?? 'other'}
                      >
                        {MATERIAL_KIND_OPTIONS.map((kind) => (
                          <option key={kind} value={kind}>
                            {t(`options.${kind}`)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </FormField>
                  <FormField
                    id={`${fieldId}-value-${index}`}
                    label={td('materialValue', { number: index + 1 })}
                  >
                    {(props) => (
                      <Input
                        {...props}
                        type="text"
                        name={`${name}.value.${index}`}
                        maxLength={500}
                        defaultValue={defaults?.materials[field.name]?.[index]?.value ?? ''}
                      />
                    )}
                  </FormField>
                </div>
              ))}
            </fieldset>
          )
        }
        return (
          <FormField
            key={field.name}
            id={fieldId}
            label={label}
            required={field.required}
            hint={
              field.input === 'list'
                ? td('listHint')
                : field.input === 'url'
                  ? td('urlHint')
                  : undefined
            }
          >
            {(props) => {
              switch (field.input) {
                case 'textarea':
                  return (
                    <Textarea
                      {...props}
                      name={name}
                      required={field.required}
                      maxLength={field.maxLength}
                      defaultValue={initial}
                    />
                  )
                case 'list':
                  return (
                    <Textarea
                      {...props}
                      name={name}
                      required={field.required}
                      defaultValue={initial}
                    />
                  )
                case 'select':
                  return (
                    <Select {...props} name={name} required={field.required} defaultValue={initial}>
                      <option value="">{td('choose')}</option>
                      {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {t(`options.${option}` as never)}
                        </option>
                      ))}
                    </Select>
                  )
                default:
                  return (
                    <Input
                      {...props}
                      name={name}
                      required={field.required}
                      maxLength={field.maxLength}
                      defaultValue={initial}
                      type={
                        field.input === 'datetime'
                          ? 'datetime-local'
                          : field.input === 'date'
                            ? 'date'
                            : field.input === 'url'
                              ? 'url'
                              : 'text'
                      }
                      pattern={field.input === 'url' ? 'https://\\S+' : undefined}
                    />
                  )
              }
            }}
          </FormField>
        )
      })}
    </>
  )
}
