import express from 'express'
import type { RowDataPacket } from 'mysql2/promise'
import {
  ABOUT_MAX,
  BUSINESS_NAME_MAX,
  HEADLINE_MAX,
  MAX_TRADES,
  PLACE_MAX,
  isTrade,
} from '../../shared/rules.ts'
import type { Trade } from '../../shared/rules.ts'
import { db, inTransaction, ms } from '../db.ts'
import { me, requireRole, requireUser } from '../session.ts'
import { loadUser, ownAccount, shortName, tradesFrom } from '../users.ts'
import { badRequest, fail, idFrom, invalid, longText, text, wholeFrom } from '../validate.ts'

export const builderRoutes = express.Router()

const LICENSE_MAX = 60
const SEARCH_MAX = 100
const RESULTS_MAX = 100

function readProfile(body: Record<string, unknown>) {
  const businessName = text(body.businessName)
  const headline = text(body.headline)
  const about = longText(body.about)
  const serviceArea = text(body.serviceArea)
  const licenseNumber = text(body.licenseNumber)
  const trades = Array.isArray(body.trades) ? [...new Set(body.trades)] : []

  if (!businessName || businessName.length > BUSINESS_NAME_MAX) return invalid((m) => m.builders.enterBusinessName)
  if (headline.length > HEADLINE_MAX) return invalid((m) => m.builders.headlineTooLong)
  if (!about) return invalid((m) => m.builders.enterAbout)
  if (about.length > ABOUT_MAX) return invalid((m) => m.builders.aboutTooLong)
  if (!serviceArea || serviceArea.length > PLACE_MAX) return invalid((m) => m.builders.enterArea)
  if (trades.length === 0 || trades.length > MAX_TRADES || !trades.every(isTrade)) {
    return invalid((m) => m.builders.chooseTrades)
  }
  let yearsInBusiness: number | null = null
  if (body.yearsInBusiness !== null && body.yearsInBusiness !== undefined && body.yearsInBusiness !== '') {
    yearsInBusiness = wholeFrom(body.yearsInBusiness, 0, 150)
    if (yearsInBusiness === null) return invalid((m) => m.builders.yearsWhole)
  }
  if (licenseNumber.length > LICENSE_MAX) return invalid((m) => m.builders.licenseTooLong)

  return {
    businessName,
    headline,
    about,
    serviceArea,
    yearsInBusiness,
    licenseNumber: licenseNumber || null,
    insured: body.insured === true,
    trades: trades as Trade[],
  }
}

// Creates or replaces your business profile. You appear in search once you have one.
builderRoutes.put('/me/builder-profile', requireRole('builder'), async (req, res) => {
  const input = readProfile(req.body ?? {})
  if ('error' in input) return badRequest(res, input.error)
  const userId = me(res).id

  await inTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO builder_profiles
         (user_id, business_name, headline, about, service_area, years_in_business, license_number, insured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) AS new
       ON DUPLICATE KEY UPDATE business_name = new.business_name, headline = new.headline, about = new.about,
         service_area = new.service_area, years_in_business = new.years_in_business,
         license_number = new.license_number, insured = new.insured`,
      [
        userId,
        input.businessName,
        input.headline,
        input.about,
        input.serviceArea,
        input.yearsInBusiness,
        input.licenseNumber,
        input.insured,
      ],
    )
    await conn.execute('DELETE FROM builder_trades WHERE user_id = ?', [userId])
    for (const trade of input.trades) {
      await conn.execute('INSERT INTO builder_trades (user_id, trade) VALUES (?, ?)', [userId, trade])
    }
  })
  res.json({ user: await ownAccount((await loadUser(userId))!) })
})

interface CardRow extends RowDataPacket {
  id: number
  name: string
  member_since: number
  business_name: string
  headline: string
  about: string
  service_area: string
  years_in_business: number | null
  license_number: string | null
  insured: number
  trades: string | null
  rating: number | null
  review_count: number
  completed_projects: number
}

const CARD_SELECT = `
  SELECT u.id, u.name, ${ms('u.created_at')} AS member_since,
         b.business_name, b.headline, b.about, b.service_area, b.years_in_business, b.license_number, b.insured,
         (SELECT GROUP_CONCAT(t.trade ORDER BY t.trade) FROM builder_trades t WHERE t.user_id = u.id) AS trades,
         (SELECT AVG(r.rating) FROM reviews r WHERE r.builder_id = u.id) AS rating,
         (SELECT COUNT(*) FROM reviews r WHERE r.builder_id = u.id) AS review_count,
         (SELECT COUNT(*) FROM projects p WHERE p.builder_id = u.id AND p.status = 'completed') AS completed_projects
  FROM builder_profiles b JOIN users u ON u.id = b.user_id`

/** What a builder's search result shows. */
function toCard(row: CardRow) {
  return {
    id: row.id,
    name: row.name,
    businessName: row.business_name,
    headline: row.headline,
    serviceArea: row.service_area,
    trades: tradesFrom(row.trades),
    yearsInBusiness: row.years_in_business,
    licensed: row.license_number !== null,
    insured: Boolean(row.insured),
    rating: row.rating === null ? null : Math.round(Number(row.rating) * 10) / 10,
    reviewCount: Number(row.review_count),
    completedProjects: Number(row.completed_projects),
    memberSince: Number(row.member_since),
  }
}

/** Escapes % and _ so a search for "50%" means those characters, not a pattern. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

// Builders with a business profile. ?trade=<key> keeps those offering a trade; ?q= searches
// names, headlines and service areas. Best rated first.
builderRoutes.get('/builders', requireUser, async (req, res) => {
  const trade = text(req.query.trade)
  const q = text(req.query.q).slice(0, SEARCH_MAX)
  if (trade && !isTrade(trade)) return badRequest(res, (m) => m.builders.unknownTrade)

  const where: string[] = []
  const params: string[] = []
  if (trade) {
    where.push('EXISTS (SELECT 1 FROM builder_trades t WHERE t.user_id = u.id AND t.trade = ?)')
    params.push(trade)
  }
  if (q) {
    where.push('(b.business_name LIKE ? OR b.headline LIKE ? OR b.service_area LIKE ? OR u.name LIKE ?)')
    params.push(...Array(4).fill(likePattern(q)))
  }
  const [rows] = await db.execute<CardRow[]>(
    `${CARD_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY rating IS NULL, rating DESC, review_count DESC, completed_projects DESC, b.business_name
     LIMIT ${RESULTS_MAX}`,
    params,
  )
  res.json({ builders: rows.map(toCard) })
})

interface ReviewRow extends RowDataPacket {
  id: number
  rating: number
  body: string
  client_name: string
  project_title: string
  created_at: number
}

/** A builder's reviews, newest first. Clients are shown as "Emma C.". */
export async function reviewsOf(builderId: number) {
  const [rows] = await db.execute<ReviewRow[]>(
    `SELECT r.id, r.rating, r.body, u.name AS client_name, p.title AS project_title, ${ms('r.created_at')} AS created_at
     FROM reviews r JOIN users u ON u.id = r.client_id JOIN projects p ON p.id = r.project_id
     WHERE r.builder_id = ? ORDER BY r.created_at DESC, r.id DESC`,
    [builderId],
  )
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    author: shortName(r.client_name),
    projectTitle: r.project_title,
    createdAt: Number(r.created_at),
  }))
}

// A builder's public profile, with their reviews.
builderRoutes.get('/builders/:id', requireUser, async (req, res) => {
  const id = idFrom(req.params.id)
  const [rows] = id ? await db.execute<CardRow[]>(`${CARD_SELECT} WHERE u.id = ?`, [id]) : [[]]
  const row = rows[0]
  if (!row) return fail(res, 404, (m) => m.builders.noProfile)
  res.json({
    builder: { ...toCard(row), about: row.about, licenseNumber: row.license_number, reviews: await reviewsOf(row.id) },
  })
})
