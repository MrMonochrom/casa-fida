// Puts a builder on a plan by hand: for testing, and until paying for Pro is set up.
//   npm run plan -- marcus.reid@example.com pro 30   Pro for 30 days
//   npm run plan -- marcus.reid@example.com pro      Pro with no end date
//   npm run plan -- marcus.reid@example.com free     back to the free plan
import type { ResultSetHeader } from 'mysql2/promise'
import { db } from '../db.ts'

const [email = '', plan, days] = process.argv.slice(2)
const usage = 'Usage: npm run plan -- <builder email> free|pro [days]'

if (!email.includes('@') || (plan !== 'free' && plan !== 'pro') || (days !== undefined && !/^\d+$/.test(days))) {
  console.error(usage)
  process.exit(1)
}

const ends = plan === 'pro' && days ? 'NOW() + INTERVAL ? DAY' : 'NULL'
const [result] = await db.execute<ResultSetHeader>(
  `UPDATE users SET plan = ?, plan_ends_at = ${ends} WHERE email = ? AND role = 'builder'`,
  plan === 'pro' && days ? [plan, Number(days), email.toLowerCase()] : [plan, email.toLowerCase()],
)
console.log(
  result.affectedRows
    ? `${email} is now on ${plan}${plan === 'pro' ? (days ? ` for ${days} days` : ', with no end date') : ''}.`
    : `No builder account uses ${email}.`,
)
await db.end()
