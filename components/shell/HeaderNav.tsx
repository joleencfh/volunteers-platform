'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button, buttonClasses } from '@/components/ui/Button'

export type NavItem = { href: string; label: string }

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
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
