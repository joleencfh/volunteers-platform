'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/display'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useTranslations } from '@/lib/i18n/client'

/** The interactive parts of /dev/style: they need state, the rest of the page is server-rendered. */
export function StyleGuideDemos() {
  const t = useTranslations('devStyle')
  const common = useTranslations('common')
  const toast = useToast()
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setOpen(true)}>{t('openModal')}</Button>
        <Button variant="secondary" onClick={() => toast(t('toastMessage'), 'success')}>
          {t('toastInfo')}
        </Button>
        <Button variant="secondary" onClick={() => toast(t('toastErrorMessage'), 'error')}>
          {t('toastError')}
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('modalTitle')}
        closeLabel={common('close')}
        footer={<Button onClick={() => setOpen(false)}>{common('close')}</Button>}
      >
        <p>{t('modalBody')}</p>
      </Modal>
      <EmptyState
        title={t('emptyTitle')}
        description={t('emptyBody')}
        action={<Button variant="secondary">{t('emptyAction')}</Button>}
      />
    </div>
  )
}
