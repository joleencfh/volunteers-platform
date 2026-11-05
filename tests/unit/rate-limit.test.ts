import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '@/lib/rate-limit'

function setup(options: { limit?: number; windowMs?: number; maxKeys?: number } = {}) {
  let time = 1_000
  const limiter = createRateLimiter({
    limit: 3,
    windowMs: 60_000,
    ...options,
    now: () => time,
  })
  return { limiter, advance: (ms: number) => (time += ms) }
}

describe('createRateLimiter', () => {
  it('allows requests up to the limit and reports what is left', () => {
    const { limiter } = setup()
    expect(limiter.check('a')).toEqual({ allowed: true, remaining: 2, retryAfterMs: 0 })
    expect(limiter.check('a').remaining).toBe(1)
    expect(limiter.check('a').remaining).toBe(0)
  })

  it('blocks the request over the limit and says when to retry', () => {
    const { limiter, advance } = setup()
    for (let i = 0; i < 3; i++) limiter.check('a')
    advance(10_000)
    expect(limiter.check('a')).toEqual({ allowed: false, remaining: 0, retryAfterMs: 50_000 })
  })

  it('counts each key separately', () => {
    const { limiter } = setup({ limit: 1 })
    expect(limiter.check('a').allowed).toBe(true)
    expect(limiter.check('b').allowed).toBe(true)
    expect(limiter.check('a').allowed).toBe(false)
  })

  it('slides: old requests fall out of the window one at a time', () => {
    const { limiter, advance } = setup()
    limiter.check('a')
    advance(30_000)
    limiter.check('a')
    limiter.check('a')
    expect(limiter.check('a').allowed).toBe(false)
    advance(30_001) // the first request is now outside the window, the other two are not
    expect(limiter.check('a').allowed).toBe(true)
    expect(limiter.check('a').allowed).toBe(false)
  })

  it('does not count blocked requests', () => {
    const { limiter, advance } = setup({ limit: 1 })
    limiter.check('a')
    for (let i = 0; i < 5; i++) limiter.check('a')
    advance(60_000)
    expect(limiter.check('a').allowed).toBe(true)
  })

  it('bounds the number of tracked keys', () => {
    const { limiter } = setup({ limit: 1, maxKeys: 2 })
    limiter.check('a')
    limiter.check('b')
    limiter.check('c') // evicts the oldest key, a
    expect(limiter.check('a').allowed).toBe(true)
    expect(limiter.check('c').allowed).toBe(false)
  })

  it('reset forgets all keys', () => {
    const { limiter } = setup({ limit: 1 })
    limiter.check('a')
    limiter.reset()
    expect(limiter.check('a').allowed).toBe(true)
  })
})
