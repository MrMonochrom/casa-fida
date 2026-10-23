import type { RowDataPacket } from 'mysql2/promise'
import type { Role, Trade } from '../shared/rules.ts'
import { db, ms } from './db.ts'

export interface UserRow extends RowDataPacket {
  id: number
  email: string
  password_hash: string | null
  name: string
  role: Role
  phone: string | null
  email_verified_at: string | null
  created_at: string
}

export interface BuilderProfile {
  businessName: string
  headline: string
  about: string
  serviceArea: string
  yearsInBusiness: number | null
  licenseNumber: string | null
  insured: boolean
  trades: Trade[]
}

export async function loadUser(id: number): Promise<UserRow | null> {
  const [rows] = await db.execute<UserRow[]>('SELECT * FROM users WHERE id = ?', [id])
  return rows[0] ?? null
}

/** Splits a GROUP_CONCAT(... SEPARATOR ',') of trade keys. Trade keys never contain commas. */
export function tradesFrom(value: string | null): Trade[] {
  return value ? (value.split(',') as Trade[]) : []
}

/** A builder's business profile, or null if they haven't set one up yet. */
export async function builderProfileOf(userId: number): Promise<BuilderProfile | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT b.*, (SELECT GROUP_CONCAT(trade ORDER BY trade) FROM builder_trades WHERE user_id = b.user_id) AS trades
     FROM builder_profiles b WHERE b.user_id = ?`,
    [userId],
  )
  const row = rows[0]
  if (!row) return null
  return {
    businessName: row.business_name,
    headline: row.headline,
    about: row.about,
    serviceArea: row.service_area,
    yearsInBusiness: row.years_in_business,
    licenseNumber: row.license_number,
    insured: Boolean(row.insured),
    trades: tradesFrom(row.trades),
  }
}

/** Everything the logged-in person may see about their own account (never the password hash). */
export async function ownAccount(user: UserRow) {
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT ${ms('created_at')} AS created FROM users WHERE id = ?`, [
    user.id,
  ])
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    phone: user.phone,
    emailVerified: user.email_verified_at !== null,
    memberSince: Number(rows[0].created),
    builderProfile: user.role === 'builder' ? await builderProfileOf(user.id) : null,
  }
}

/** First name and the initial of the last one: "Emma C." Shown to people you haven't worked with. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
}
