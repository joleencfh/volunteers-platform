// Client components ('use client') must not import server-only modules: the `server-only`
// package itself, the service-role Supabase client, email code and the audit helper. Next.js also
// fails the build for some of these; this catches them at lint time with a clear message.

const SERVER_ONLY = [
  /^server-only$/,
  /^@\/lib\/supabase\/admin(\/|$)/,
  /^@\/lib\/email(\/|$)/,
  /^@\/lib\/audit(\/|$)/,
  /^(\.{1,2}\/)+lib\/(supabase\/admin|email|audit)(\/|$)/,
]

function hasUseClient(program) {
  for (const statement of program.body) {
    if (statement.type !== 'ExpressionStatement' || statement.directive === undefined) break
    if (statement.directive === 'use client') return true
  }
  return false
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow importing server-only modules in client components' },
    schema: [],
    messages: {
      serverOnly:
        "Client components cannot import '{{source}}': it is server-only. Call it from a server component or a server action.",
    },
  },
  create(context) {
    let isClient = false
    return {
      Program(node) {
        isClient = hasUseClient(node)
      },
      ImportDeclaration(node) {
        if (!isClient) return
        const source = String(node.source.value)
        if (SERVER_ONLY.some((pattern) => pattern.test(source))) {
          context.report({ node, messageId: 'serverOnly', data: { source } })
        }
      },
    }
  },
}

const plugin = { rules: { 'no-server-only-in-client': rule } }

export default plugin
