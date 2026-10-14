import { notFound } from 'next/navigation'
import { StyleGuideDemos } from '@/components/dev/StyleGuideDemos'
import { Button } from '@/components/ui/Button'
import { Badge, Card } from '@/components/ui/display'
import { Checkbox, FormField, Input, Select, Textarea } from '@/components/ui/fields'
import { getTranslations } from '@/lib/i18n/server'

// Development aid: hidden on Vercel production deploys; shown locally, in CI and on previews.
export default async function StyleGuidePage() {
  if (process.env.VERCEL_ENV === 'production') notFound()
  const t = await getTranslations('devStyle')

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold">{t('title')}</h1>
        <p className="text-muted">{t('intro')}</p>
      </header>

      <section aria-labelledby="buttons" className="flex flex-col gap-4">
        <h2 id="buttons" className="text-2xl font-bold">
          {t('buttons')}
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button>{t('primary')}</Button>
          <Button variant="secondary">{t('secondary')}</Button>
          <Button variant="danger">{t('danger')}</Button>
          <Button variant="ghost">{t('ghost')}</Button>
          <Button disabled>{t('disabled')}</Button>
        </div>
      </section>

      <section aria-labelledby="forms" className="flex max-w-md flex-col gap-5">
        <h2 id="forms" className="text-2xl font-bold">
          {t('forms')}
        </h2>
        <FormField id="name" label={t('textLabel')} hint={t('textHint')} required>
          {(props) => <Input autoComplete="off" {...props} />}
        </FormField>
        <FormField id="name-error" label={t('textLabel')} error={t('textError')}>
          {(props) => <Input autoComplete="off" {...props} />}
        </FormField>
        <FormField id="message" label={t('messageLabel')}>
          {(props) => <Textarea {...props} />}
        </FormField>
        <FormField id="group" label={t('selectLabel')}>
          {(props) => (
            <Select {...props}>
              <option>{t('optionLobbying')}</option>
              <option>{t('optionOutreach')}</option>
            </Select>
          )}
        </FormField>
        <Checkbox label={t('checkboxLabel')} />
      </section>

      <section aria-labelledby="display" className="flex flex-col gap-4">
        <h2 id="display" className="text-2xl font-bold">
          {t('display')}
        </h2>
        <Card className="flex max-w-md flex-col gap-2">
          <h3 className="text-xl font-bold">{t('cardTitle')}</h3>
          <p>{t('cardBody')}</p>
          <div className="flex flex-wrap gap-2">
            <Badge>{t('badgeNeutral')}</Badge>
            <Badge tone="brand">{t('badgeBrand')}</Badge>
            <Badge tone="success">{t('badgeSuccess')}</Badge>
            <Badge tone="danger">{t('badgeDanger')}</Badge>
          </div>
        </Card>
      </section>

      <section aria-labelledby="feedback" className="flex flex-col gap-4">
        <h2 id="feedback" className="text-2xl font-bold">
          {t('feedback')}
        </h2>
        <StyleGuideDemos />
      </section>
    </div>
  )
}
