import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-ink hover:bg-brand-hover border-transparent',
  secondary: 'bg-paper text-ink border-ink hover:bg-surface',
  danger: 'bg-danger text-paper border-transparent hover:bg-red-800',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-surface',
}

export const buttonClasses = (variant: ButtonVariant = 'primary') =>
  cx(
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border-2 px-4 py-2',
    'text-base font-semibold transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
  )

export function Button({
  variant = 'primary',
  type = 'button',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={cx(buttonClasses(variant), className)} {...props} />
}
