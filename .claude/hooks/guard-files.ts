// PreToolUse hook for Edit|Write|MultiEdit: blocks edits that break repository rules.
// Exit code 2 blocks the tool call and feeds stderr back to Claude. See guard-rules.ts.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { checkPath } from './guard-rules'

async function readInput(): Promise<{ tool_input?: { file_path?: string } }> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

const input = await readInput()
const filePath = input.tool_input?.file_path
if (!filePath) process.exit(0)

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const relative = path.relative(root, path.resolve(root, filePath)).split(path.sep).join('/')
if (relative.startsWith('..')) process.exit(0) // outside the project: not our rules

function isCommitted(relPath: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `HEAD:${relPath}`], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const message = checkPath(relative, isCommitted, process.env)
if (message) {
  console.error(message)
  process.exit(2)
}
