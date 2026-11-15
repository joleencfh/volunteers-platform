'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button, buttonClasses } from '@/components/ui/Button'

/** `badge` is a count shown after the label; the accessible name is the visible text, so it includes it. */
export type NavItem = { href: string; label: string; badge?: number }

/** Inline links from the md breakpoint up; a menu button below it. */
export function HeaderNav({
  items,
  menuLabel,
  navLabel,
}: {
  items: NavItem[]
  menuLabel: string
  navLabel: string
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <nav aria-label={navLabel} className="md:ml-auto">
      <Button
        variant="secondary"
        className="md:hidden"
        aria-expanded={open}
        aria-controls="main-menu"
        onClick={() => setOpen((value) => !value)}
      >
        {menuLabel}
      </Button>
      <ul
        id="main-menu"
        className={`${open ? 'flex' : 'hidden'} absolute inset-x-0 top-full flex-col gap-1 border-b-2 border-ink bg-paper p-4 md:static md:flex md:flex-row md:border-0 md:p-0`}
      >
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`${buttonClasses('ghost')} w-full justify-start md:w-auto`}
              onClick={() => setOpen(false)}
            >
              {item.label}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-brand px-1.5 text-sm font-bold text-ink">
                  {item.badge}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
