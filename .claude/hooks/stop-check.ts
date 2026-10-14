// Stop hook: before Claude finishes, run `bun run check:fast` if source files changed.
// A failure (exit code 2) keeps Claude working and feeds the output back. It never loops: it does
// nothing when stop_hook_active is set, and it skips a tree it has already checked successfully.
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

async function readInput(): Promise<{ stop_hook_active?: boolean }> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

const input = await readInput()
if (input.stop_hook_active) process.exit(0)

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

const SOURCE = /\.(ts|tsx|mts|js|mjs|json|yml|yaml|sql|css)$/i
const changed = git('status', '--porcelain', '--untracked-files=all')
  .split('\n')
  .map((line) => line.slice(3).trim())
  .filter((file) => file && SOURCE.test(file) && !file.startsWith('.claude/'))
if (changed.length === 0) process.exit(0)

// Fingerprint of the working tree: skip the check if this exact state already passed
const hash = createHash('sha1')
hash.update(git('diff', 'HEAD'))
for (const file of changed) {
  const full = path.join(root, file)
  if (existsSync(full)) hash.update(file).update(readFileSync(full))
}
const fingerprint = hash.digest('hex')
const cache = path.join(root, '.claude', '.last-check')
if (existsSync(cache) && readFileSync(cache, 'utf8').trim() === fingerprint) process.exit(0)

const result = spawnSync(process.execPath, ['run', 'check:fast'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 300_000,
  maxBuffer: 64 * 1024 * 1024,
})

if (result.status === 0) {
  writeFileSync(cache, fingerprint)
  process.exit(0)
}

const output = `${result.stdout}\n${result.stderr}`.trim().split('\n').slice(-80).join('\n')
console.error(`bun run check:fast failed. Fix the problems below, then finish.\n\n${output}`)
process.exit(2)
