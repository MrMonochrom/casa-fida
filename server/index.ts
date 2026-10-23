import { app } from './app.ts'
import { emailIsSetUp } from './mailer.ts'

// 3002, so Be in touch's API (3001) can run at the same time.
const PORT = Number(process.env.PORT || 3002)
// Only this computer by default. In a container, set HOST=0.0.0.0.
const HOST = process.env.HOST || '127.0.0.1'

if (process.env.NODE_ENV === 'production') {
  const missing = [
    !process.env.APP_URL && 'APP_URL (links in emails point to localhost)',
    !emailIsSetUp() && 'SMTP_URL (emails are printed to the log instead of sent)',
    !process.env.DB_PASSWORD && 'DB_PASSWORD (connecting to MySQL without a password)',
  ].filter(Boolean)
  for (const setting of missing) console.warn(`Warning: ${setting} isn't set.`)
}

app.listen(PORT, HOST, () => {
  console.log(`API listening on http://${HOST}:${PORT}`)
})
