import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keyLength: number) => Promise<Buffer>
const KEY_LENGTH = 64

/** Hashes a password as "scrypt$<salt hex>$<hash hex>" for the users.password_hash column. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

// Checked against when the email doesn't exist, so a wrong email takes as long as a wrong password.
const dummyHash = await hashPassword(randomBytes(16).toString('hex'))

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const [scheme, saltHex, hashHex] = (stored ?? dummyHash).split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(actual, expected) && stored != null
}

/** A random session token for the cookie. Only its hash is stored in the database. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
