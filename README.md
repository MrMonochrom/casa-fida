# Casa Fida

Builders and their clients, on the same page. Clients find builders and post jobs; builders send quotes or proposals. Once someone is hired, both sides follow the project in one place: its stages, photo updates from the site, changes to the price, invoices and messages.

The front end is React + TypeScript (Vite). A Node.js/Express API server keeps everything in MySQL.

## Quick start

You need **Node.js 24 or newer** and a **Mac with Apple silicon**: the database script downloads MySQL for that platform. On anything else, load `db/schema.sql` and `db/seed.sql` into your own MySQL 8 and see [Running in production](#running-in-production) for the connection settings.

```sh
npm install
npm run db:start   # first run downloads MySQL (about 165 MB) and loads the sample data
npm run dev        # starts the web app and the API server together
```

Open http://localhost:5174 and log in with a [test account](#test-accounts), or sign up.

MySQL doesn't start by itself after a reboot, so run `npm run db:start` before `npm run dev`.

If your database was made before currencies or email confirmation were added, bring it up to date by running each file in [db/migrations](db/migrations) you haven't run yet, in order, once:

```sh
npm run db:shell < db/migrations/001-currencies.sql           # existing jobs and projects stay in US dollars
npm run db:shell < db/migrations/002-email-verification.sql   # existing accounts count as confirmed
npm run db:shell < db/migrations/003-password-reset-and-notifications.sql
npm run db:shell < db/migrations/004-builder-plans.sql
npm run db:shell < db/migrations/005-emailed-invite-links.sql
npm run db:shell < db/migrations/006-trade-order.sql
```

Without `SMTP_URL`, emails (like the link that confirms a new account's email address) are printed in the terminal running `npm run dev`.

## Test accounts

[db/seed.sql](db/seed.sql) creates these accounts. All of them use the password **`CasaFida123`**.

| Who | Email | Good for trying |
|---|---|---|
| Emma Clarke, client | emma.clarke@example.com | A rear extension in progress with Marcus: a change order to approve, an invoice due and an unread message. Two quotes waiting on her bathroom job. |
| David Nguyen, client | david.nguyen@example.com | A kitchen proposal from Priya to accept or decline, and a quote on his deck job. |
| Olivia Brooks, client | olivia.brooks@example.com | Finished projects and the reviews she left. |
| Noah Patel, client | noah.patel@example.com | A new client with two open jobs and no quotes yet. |
| Marcus Reid, Reid & Sons Construction | marcus.reid@example.com | Running the extension project: stages, updates, change orders and invoices. |
| Priya Shah, Shah Kitchen & Bath | priya.shah@example.com | A proposal waiting for David, and a quote on Emma's bathroom job. On the Pro plan. |
| Grace Kim, Kim Renovation Co. | grace.kim@example.com | Finding work: Noah's jobs are in her trades. |
| Tom Becker, Lena Ortiz, Sam Whitfield | tom.becker@, lena.ortiz@, sam.whitfield@example.com | Builders with finished projects and reviews. |

To see both sides at once, log in as Emma in one window and Marcus in a private window: whatever one does shows up on the other's screen straight away.

## What it does

### For clients

- **Find a builder:** search by name or area and filter by trade. Profiles show reviews, years in business, license and insurance, and finished projects. Message any builder from their profile.
- **Post a job:** what you need, the kind of work, where, a budget range and when to start. Builders in that trade see it and send quotes. Up to 5 jobs a day; builders get emails about them once you've confirmed your email address.
- **Compare quotes and hire:** each quote shows the price, how long it takes, what's included and the builder's rating. Accepting one starts the project, declines the others and closes the job.
- **Accept a proposal:** a builder you've already talked to can send you the work and price directly. It goes straight into your account once you've confirmed your email address; otherwise the email has a link to sign up (or log in) and see it. Until you accept, the builder sees only the name and email they typed, not your own details or phone number.
- **Follow the project:** progress through its stages, photo updates, change orders to approve or decline before they count, and every invoice with what's been paid.
- **Review the builder** once the project is completed. Reviews appear on their profile with your first name and last initial.

### For builders

- **Business profile:** set up right after signing up. It's what clients see in search and on quotes.
- **Find work:** open jobs in your trades (or any trade), and quotes you can change or withdraw until the client answers.
- **Send a proposal** for work you've agreed on outside the app, with its stages.
- **Run the project:** tick off stages, post updates with photos (shrunk in the browser before uploading), send change orders and invoices, mark invoices paid when the money arrives, and mark the project completed.
- **Free or Pro plan:** on Free, an email once a day lists new jobs in your trades; up to 30 new quotes a day and 6 trades. Pro emails each new job the moment it's posted, and allows 100 new quotes a day and 12 trades. Every builder can try Pro free for 14 days from Account. When Pro ends, the first 6 trades a builder chose keep counting (in search, job lists and emails) and the rest don't, until they choose which to keep. Paying for Pro comes once online payments are set up; until then, `npm run plan` puts a builder on a plan by hand.

### For both

- **Home** lists what's waiting for you, like a proposal to answer or an invoice to pay, and links straight to it.
- **Messages** between a client and a builder, with read receipts.
- **Live updates:** new messages, quotes and project changes appear without reloading, and the menu shows counts of what's waiting.
- Works on phones and desktops, in light or dark mode.
- **Prices in US dollars, euros, Moldovan lei, Romanian lei or Russian rubles.** A client picks the currency when posting a job, and a builder when sending a proposal. Quotes, the project, change orders and invoices then use it. The currency can't change once builders have quoted or the client has accepted.
- **In English, Romanian or Russian.** The app starts in the browser's language and can be switched from the menu at the top of every page. Error messages and proposal emails come from the server in the same language.
- **Confirmed email addresses.** Signing up emails a link to confirm the address; a banner asks until it's done. Opening the invite in a proposal email confirms it too, so clients who join that way get emails straight away. Builders need it to send quotes and proposals, and proposals only go straight into accounts that have it.
- **Forgot your password?** The login page emails a link (it works for an hour) to choose a new one, which logs out every other browser.
- **Email notifications** in each person's language: new quotes, accepted quotes, answers to proposals, change orders and their answers, invoices, overdue invoices (checked every hour), finished projects, and new messages while you're away (once until you've read them, without the message itself). Each kind can be turned off under Account; only confirmed addresses get them.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the web app (port 5174) and the API server (port 3002) together |
| `npm run build` | Type-checks the app and server, then builds the web app into `dist/` |
| `npm start` | Runs the server in production mode, serving the built app and the API on port 3002 |
| `npm run lint` | Checks the code with oxlint |
| `npm test` | Runs all tests once (see [Tests](#tests)) |
| `npm run test:watch` | Re-runs tests as you change files |
| `npm run test:coverage` | Runs all tests and reports how much of the code they cover |
| `npm run db:start` / `db:stop` / `db:status` | Starts, stops or checks the local MySQL (port 3307) |
| `npm run db:users` | Prints every account, with builders' businesses and trades |
| `npm run db:shell` | Opens a MySQL prompt on the `casa_fida` database |
| `npm run db:reset` | Deletes all data and reloads the sample data (asks first) |
| `npm run plan -- <email> pro [days]` | Puts a builder on Pro (for that many days, or with no end), or `free` to go back |

## How it fits together

```
Browser ──▶ Vite dev server (:5174) ──/api──▶ API server (:3002) ──▶ MySQL (:3307)
```

The Vite dev server serves the React app and forwards every `/api` request to the API server, so the browser only talks to one address and the login cookie just works. In production, the API server serves the built app itself.

Live updates use server-sent events (`GET /api/events`). The app keeps one connection open and reloads whatever an event is about. Open chats and the menu counts also check now and then, in case events can't get through.

### Project structure

```
src/                       React app
  Root.tsx                 Picks the screen: invite link, log in / sign up, builder setup, or the app
  App.tsx                  The menu, and which page each address shows
  router.ts                Addresses for every page (links from emails open the right one)
  api.ts                   Calls to the API server
  serverEvents.ts          Live updates
  useResource.ts           Loading data for a page, and reloading it after changes
  format.ts                Dates, budgets and status labels, in the current language
  i18n/                    Every word the app shows: en.ts, ro.ts, ru.ts, and switching between them
  screens/                 One file per page: Home, FindBuilders, BuilderPage, MyJobs, JobForm,
                           ClientJob, FindWork, BuilderJob, Projects, ProposalForm, Messages, Account…
    project/               The project page: ProjectPage, Stages, Updates, Money
  components/              Shared pieces: dialogs, form fields, cards, ratings…
  test/                    Test setup, sample data and the mocked API
server/                    API server (TypeScript, run directly by Node)
  app.ts                   Routes, error handling, and serving the built app in production
  i18n/                    Every error message and email the server sends, in each language
  routes/                  account, builders, jobs (and quotes), projects, work (stages, updates,
                           photos), billing (change orders, invoices), messages, live
shared/                    Used by both the app and the server: limits, trades, languages, currencies and money formatting
db/                        schema.sql, seed.sql, migrations/ for older databases, and mysql.sh to run MySQL
                           without installing it
```

Tests sit next to the code they check: `ClientJob.test.tsx` tests `ClientJob.tsx`, and `billing.api.test.ts` tests `billing.ts`.

## Tests

```sh
npm test                 # all 540 tests
npx vitest run --project web
npx vitest run server/routes/billing.api.test.ts
```

| Group | What it checks | Files |
|---|---|---|
| **web** | Every page in a simulated browser: signing up and the builder profile, invite links, posting jobs, quoting and hiring, proposals, stages, photo updates, change orders, invoices, reviews, messages and live updates. The API is replaced with a mock. | `src/**/*.test.ts(x)` |
| **server** | Logic that needs no database: passwords, sessions, rate limits, live events and money. | `server/**/*.test.ts`, `shared/**/*.test.ts` |
| **api** | Every endpoint against a real MySQL: validation messages, who may see and change what, prices and invoice totals, photo limits, messaging privacy and live events. | `server/**/*.api.test.ts` |

The **api** tests need MySQL running (`npm run db:start`). They never touch your data: each run creates a separate `casa_fida_test` database and deletes it afterwards.

On GitHub, every pull request (and every change to `main`) runs lint, the type check and build, and all the tests against a fresh MySQL: see [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Running in production

Build the app with `npm run build`, copy [.env.example](.env.example) to `.env` and fill it in, then start the server with `node --env-file=.env server/index.ts`. It serves the app and the API from one port, with security headers and secure cookies, so put it behind a proxy that handles HTTPS (like Caddy).

| Setting | What it's for | Default |
|---|---|---|
| `NODE_ENV` | `production` serves the built app and turns on security headers | development |
| `APP_URL` | The address in links in emails | `http://localhost:5174` |
| `PORT`, `HOST` | Where the server listens | `3002`, `127.0.0.1` |
| `TRUST_PROXY` | How many proxies sit in front, so login limits see real addresses (`true` counts as 1) | off |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | The MySQL database | `127.0.0.1`, `3307`, `root`, empty, `casa_fida` |
| `SMTP_URL`, `MAIL_FROM` | Sending email. Without `SMTP_URL`, emails are only printed in the server's log. | not set |

## Limitations and next steps

| Not done yet | Today |
|---|---|
| Paying in the app | Clients pay the way they agree with their builder, who marks each invoice paid. Builders can't pay for Pro yet: there's the free trial, and `npm run plan`. |
| Email digests | Each notification is its own email; there's no daily summary. |
| Files such as plans and contracts | Only photos, on project updates. |
| Running several server processes | Live updates and login limits are kept in one process's memory. |
| Photo storage | Photos are stored in MySQL. A hosted app would keep them in file storage instead. |

## Tech stack

React 19, TypeScript 6, Vite 8, Express 5, mysql2, MySQL 8.4 and oxlint. Tests use Vitest, Testing Library (with jsdom) and supertest.
