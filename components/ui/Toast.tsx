'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { cx } from './cx'

type ToastTone = 'info' | 'success' | 'error'
type ToastItem = { id: number; message: ReactNode; tone: ToastTone }

const ToastContext = createContext<((message: ReactNode, tone?: ToastTone) => void) | null>(null)

const tones: Record<ToastTone, string> = {
  info: 'border-ink bg-paper text-ink',
  success: 'border-success bg-success-tint text-success',
  error: 'border-danger bg-danger-tint text-danger',
}

// Errors stay until dismissed; other messages clear themselves.
const AUTO_DISMISS_MS = 6000

/** Renders the toast region and provides `useToast()`. Mounted once, in the root layout. */
export function ToastProvider({
  dismissLabel,
  children,
}: {
  dismissLabel: string
  children: ReactNode
}) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (message: ReactNode, tone: ToastTone = 'info') => {
      const id = Date.now() + Math.random()
      setToasts((current) => [...current, { id, message, tone }])
      if (tone !== 'error') setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-96"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              'flex w-full items-center justify-between gap-3 rounded-md border-2 p-3 shadow-lg',
              tones[toast.tone],
            )}
          >
            <p className="font-semibold">{toast.message}</p>
            <Button variant="ghost" aria-label={dismissLabel} onClick={() => dismiss(toast.id)}>
              <span aria-hidden="true">×</span>
            </Button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast must be used inside ToastProvider')
  return show
}
