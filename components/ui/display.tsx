import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-lg border-2 border-line bg-paper p-5', className)} {...props} />
  )
}

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'danger'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface text-ink border-line-strong',
  brand: 'bg-brand text-ink border-transparent',
  success: 'bg-success-tint text-success border-success',
  danger: 'bg-danger-tint text-danger border-danger',
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-line-strong p-8 text-center">
      <h2 className="text-xl font-bold">{title}</h2>
      {description && <p className="max-w-prose text-muted">{description}</p>}
      {action}
    </div>
  )
}
