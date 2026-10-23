import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hashPassword, hashToken, newSessionToken, verifyPassword } from './auth.ts'

describe('hashPassword', () => {
  it('produces "scrypt$<salt>$<hash>" in hex', async () => {
    expect(await hashPassword('secret-password')).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/)
  })

  it('uses a new random salt every time', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password'), hashPassword('same-password')])
    expect(a).not.toBe(b)
  })

  it('never contains the password itself', async () => {
    expect(await hashPassword('visible-password')).not.toContain('visible-password')
  })
})

describe('verifyPassword', () => {
  it('accepts the right password', async () => {
    const stored = await hashPassword('right-password')
    expect(await verifyPassword('right-password', stored)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('right-password')
    expect(await verifyPassword('wrong-password', stored)).toBe(false)
    expect(await verifyPassword('', stored)).toBe(false)
  })

  it('rejects everything when there is no stored hash (accounts that cannot log in)', async () => {
    expect(await verifyPassword('anything', null)).toBe(false)
    expect(await verifyPassword('anything', undefined)).toBe(false)
  })

  it.each(['', 'plain-text', 'bcrypt$abc$def', 'scrypt$$', 'scrypt$abcd$'])('rejects a malformed hash (%j)', async (stored) => {
    expect(await verifyPassword('anything', stored)).toBe(false)
  })
})

describe('session tokens', () => {
  it('are long, URL-safe and unique', () => {
    const tokens = new Set(Array.from({ length: 50 }, newSessionToken))
    expect(tokens.size).toBe(50)
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('are stored as their SHA-256 hash', () => {
    expect(hashToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'))
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken('abc')).not.toBe(hashToken('abd'))
  })
})
