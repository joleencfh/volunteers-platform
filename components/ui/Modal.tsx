'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'

/**
 * A modal dialog on the native <dialog> element: the browser traps focus inside, makes the rest
 * of the page inert, closes on Escape and returns focus to the trigger. `open` is controlled.
 */
export function Modal({
  open,
  onClose,
  title,
  closeLabel,
  footer,
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  closeLabel: string
  footer?: ReactNode
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself, not on its content.
        if (event.target === ref.current) onClose()
      }}
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-lg border-2 border-ink bg-paper p-0 text-ink backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-2xl font-bold">
            {title}
          </h2>
          <Button variant="ghost" aria-label={closeLabel} onClick={onClose}>
            <span aria-hidden="true">×</span>
          </Button>
        </div>
        <div>{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3">{footer}</div>}
      </div>
    </dialog>
  )
}
