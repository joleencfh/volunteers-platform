# Design tokens

The tokens live in `app/globals.css` under `@theme` and become Tailwind utilities (`bg-brand`, `text-muted`, `rounded-md`, ...). This page records where they come from and the rules that go with them.

## Source

- **Orange `#FF9416`**: sampled from the PauseAI logo file the maintainer supplied (`docs/assets/pauseai-logo-on-orange.png`, background pixel is exactly this value) and equal to `--hero-orange` in the stylesheet of https://pauseai.info (checked 2026-10-14). The site's darker `#f68b1e` brand orange and `#ffe7cc` tint also appear there; the tint is used as `brand-tint`.
- **Logo files**: originals in `docs/assets/`; copies with the padding trimmed in `public/` (`pauseai-logo.png` for white backgrounds, `pauseai-logo-on-orange.png` for orange ones).
- **Typeface: Geist** (the `create-next-app` default), a decision of the maintainer. pauseai.info itself uses Roboto Slab for body text and Saira Condensed for headings; we deliberately do not copy them.

## Colour

| Token                         | Value                 | Use                                                          |
| ----------------------------- | --------------------- | ------------------------------------------------------------ |
| `brand`                       | `#ff9416`             | Backgrounds with black text: primary buttons, footer, badges |
| `brand-hover`                 | `#e68500`             | Hover state of `brand`                                       |
| `brand-tint`                  | `#ffe7cc`             | Soft highlights, with black text                             |
| `ink` / `ink-soft`            | `#000` / `#262626`    | Text, borders                                                |
| `paper`                       | `#fff`                | Page background                                              |
| `muted`                       | `#595959`             | Secondary text (7:1 on white)                                |
| `surface`                     | `#f5f5f5`             | Hover and disabled backgrounds                               |
| `line` / `line-strong`        | `#e5e5e5` / `#737373` | Decorative borders / form control borders (4.7:1)            |
| `danger`, `success` (+ tints) | `#b91c1c`, `#166534`  | Errors and confirmations, each with a light tint             |

## Rules

1. Text on orange is black. Orange is never text on white (it fails contrast); use `ink` or `muted`.
2. Focus is a 3px black outline with a white halo (`:focus-visible` in `globals.css`); never remove it.
3. Interactive targets are at least 44px (`min-h-11`).
4. Colour never carries meaning alone: errors also have text, badges have text.
5. Layouts work from 375px to 1440px and do not scroll sideways.
6. Animations respect `prefers-reduced-motion`.

## Scale

- **Type**: `text-xs` 12px, `sm` 14, `base` 16, `lg` 18, `xl` 20, `2xl` 24, `3xl` 30, `4xl` 36, each with an explicit line height.
- **Spacing**: Tailwind's 4px step (`--spacing: 0.25rem`).
- **Radius**: `sm` 4px, `md` 8px, `lg` 12px.

## Primitives

`components/ui`: Button, Input, Textarea, Select, Checkbox, FormField (with error text), Card, Badge, Modal (native `<dialog>`), Toast (`ToastProvider` and `useToast`), EmptyState. All of them are shown on `/dev/style`, which is hidden on Vercel production deploys (`VERCEL_ENV=production`) and available locally, in CI and on previews.

Primitives take no built-in text: labels such as the dialog's close button come in as props, from `messages/*.json`.
