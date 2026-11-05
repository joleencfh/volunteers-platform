import { expect, test } from '@playwright/test'

// Representative routes: an English page, an Italian (legal) page, a nested one, and a 404.
const routes = ['/', '/privacy', '/apply/pending', '/does-not-exist']

for (const route of routes) {
  test(`security headers are set on ${route}`, async ({ request }) => {
    const response = await request.get(route)
    const headers = response.headers()

    const csp = headers['content-security-policy']
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")

    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy']).toContain('camera=()')
    expect(headers['strict-transport-security']).toContain('max-age=')
  })
}

test('the production CSP allows no eval', async ({ request }) => {
  test.skip(!process.env.CI, 'the dev server needs eval; this runs against the production build')
  const csp = (await request.get('/')).headers()['content-security-policy']
  expect(csp).not.toContain('unsafe-eval')
})
