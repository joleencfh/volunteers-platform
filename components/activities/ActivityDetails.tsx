import { Card } from '@/components/ui/display'
import {
  parseDetailsLoosely,
  type ActivityTypeDefinition,
  type FieldDefinition,
} from '@/lib/domain/activity-types'
import { getFormatter, getTranslations } from '@/lib/i18n/server'

type Material = { kind?: unknown; url?: unknown; text?: unknown }

const isLinkText = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('https://')

/**
 * The type-specific fields of an activity, rendered from the registry's field definitions. Stored
 * values are read loosely (unknown or invalid keys are dropped), so an old row never breaks the page.
 */
export async function ActivityDetails({
  definition,
  details,
}: {
  definition: ActivityTypeDefinition
  details: unknown
}) {
  const t = await getTranslations('activities')
  const tt = await getTranslations('activityTypes')
  const format = await getFormatter()
  const known = parseDetailsLoosely(definition.key, details)
  const filled = definition.fields.filter((field) => known[field.name] !== undefined)

  const render = (field: FieldDefinition) => {
    const value = known[field.name]
    if (field.input === 'list' && Array.isArray(value)) {
      return (
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {value.map((item, index) =>
            field.itemKind === 'material' ? (
              <li key={index}>
                <span>{tt(`options.${(item as Material).kind as 'other'}`)}: </span>
                {isLinkText((item as Material).url) ? (
                  <a
                    href={(item as Material).url as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all underline"
                  >
                    {(item as Material).url as string}
                  </a>
                ) : (
                  <span className="break-words">{String((item as Material).text ?? '')}</span>
                )}
              </li>
            ) : (
              <li key={index} className="break-words">
                {String(item)}
              </li>
            ),
          )}
        </ul>
      )
    }
    if (typeof value !== 'string') return null
    if (field.input === 'url') {
      return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="break-all underline">
          {value}
        </a>
      )
    }
    if (field.input === 'datetime') {
      return format.dateTime(new Date(value), { dateStyle: 'full', timeStyle: 'short' })
    }
    if (field.input === 'date') {
      return format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: 'medium' })
    }
    if (field.input === 'select') return tt(`options.${value as 'other'}`)
    return <span className="whitespace-pre-line break-words">{value}</span>
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{t('detail.detailsTitle')}</h2>
      {filled.length === 0 ? (
        <p>{t('detail.noDetails')}</p>
      ) : (
        <dl className="flex flex-col gap-3">
          {filled.map((field) => (
            <div key={field.name} className="flex flex-col gap-1">
              <dt className="font-semibold">{tt(field.labelKey as never)}</dt>
              <dd>{render(field)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  )
}
