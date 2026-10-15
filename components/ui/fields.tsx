import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cx } from './cx'

const control =
  'block min-h-11 w-full rounded-md border-2 bg-paper px-3 py-2 text-base text-ink ' +
  'placeholder:text-muted disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-70 ' +
  'aria-[invalid=true]:border-danger'

const border = 'border-line-strong'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(control, border, className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(control, border, 'min-h-28', className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(control, border, className)} {...props}>
      {children}
    </select>
  )
}

export function Checkbox({
  label,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode }) {
  return (
    <label className={cx('flex min-h-11 cursor-pointer items-center gap-3 text-base', className)}>
      <input
        type="checkbox"
        className="size-6 shrink-0 cursor-pointer rounded-sm border-2 border-line-strong accent-brand"
        {...props}
      />
      <span>{label}</span>
    </label>
  )
}

export type ControlProps = {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

/**
 * A label, optional hint and error around one control. The control comes from a render
 * function that receives the id and ARIA attributes to spread on it, so label, hint and error
 * are always wired to it.
 */
export function FormField({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  children: (props: ControlProps) => ReactNode
}) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-semibold">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {error && (
        <p id={errorId} className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
