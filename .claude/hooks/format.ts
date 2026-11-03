// PostToolUse hook for Edit|Write|MultiEdit: formats the edited file with Prettier.
// Never blocks: formatting problems are caught later by `bun run format:check`.
import { spawnSync } from 'node:child_process'
import path from 'node:path'

async function readInput(): Promise<{ tool_input?: { file_path?: string } }> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

const input = await readInput()
const filePath = input.tool_input?.file_path
if (!filePath) process.exit(0)

const FORMATTED = /\.(ts|tsx|mts|js|mjs|json|md|css|yml|yaml)$/i
if (!FORMATTED.test(filePath)) process.exit(0)

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const target = path.resolve(root, filePath)
// Only format files inside the project
if (path.relative(root, target).startsWith('..')) process.exit(0)
// process.execPath is bun when this script runs under bun; prettier respects .prettierignore
spawnSync(process.execPath, ['x', 'prettier', '--write', '--ignore-unknown', target], {
  cwd: root,
  stdio: 'ignore',
  timeout: 20_000,
})
process.exit(0)
