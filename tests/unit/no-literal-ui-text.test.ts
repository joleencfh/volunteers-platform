import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

// CLAUDE.md rule 1: no literal UI strings in components. Text goes through messages/*.json.
// This scans every .tsx file under app/ and components/ for text a person would read.

const ROOT = process.cwd()
const ACCESSIBLE_ATTRIBUTES = new Set([
  'alt',
  'title',
  'placeholder',
  'label',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
])

function tsxFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.name.endsWith('.tsx') ? [path] : []
  })
}

/** Literal text in JSX children or in accessible-name attributes, as `file:line text`. */
export function findLiteralText(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: string[] = []
  const report = (node: ts.Node, text: string) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    found.push(`${file}:${line + 1} "${text.trim()}"`)
  }
  const hasLetters = (text: string) => /\p{L}/u.test(text)

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && hasLetters(node.text)) report(node, node.text)
    // {'text'} as a child
    if (
      ts.isJsxExpression(node) &&
      ts.isJsxElement(node.parent) &&
      node.expression &&
      (ts.isStringLiteral(node.expression) ||
        ts.isNoSubstitutionTemplateLiteral(node.expression)) &&
      hasLetters(node.expression.text)
    ) {
      report(node, node.expression.text)
    }
    if (
      ts.isJsxAttribute(node) &&
      ACCESSIBLE_ATTRIBUTES.has(node.name.getText(sf)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      hasLetters(node.initializer.text)
    ) {
      report(node, node.initializer.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

describe('no literal UI text', () => {
  it('detects literal text (the guard itself works)', () => {
    const bad = `export const A = () => <main title="Hello"><h1>Welcome</h1>{'Again'}</main>`
    expect(findLiteralText('bad.tsx', bad)).toHaveLength(3)
  })

  it('allows translated text and non-text content', () => {
    const good = `export const A = ({ t }) => <main className="p-4"><h1>{t('title')}</h1>{' '}|</main>`
    expect(findLiteralText('good.tsx', good)).toEqual([])
  })

  it('finds none under app/ and components/', () => {
    const files = [...tsxFiles('app'), ...tsxFiles('components')]
    const offenders = files.flatMap((file) =>
      findLiteralText(file, readFileSync(join(ROOT, file), 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})
