# Casa Fida

Builders and their clients, on the same page. Clients find builders and post jobs; builders send quotes or proposals. Once someone is hired, both sides follow the project in one place: its stages, photo updates from the site, changes to the price, invoices and messages.

The front end is React + TypeScript (Vite). A Node.js/Express API server keeps everything in MySQL.

## Quick start

You need **Node.js 24 or newer**, and either a **Mac with Apple silicon** or **Docker** (Docker Desktop, or Docker Engine on Linux). On a Mac with Apple silicon, the database script downloads MySQL and runs it from your home folder; everywhere else (Linux, Intel Macs, Windows with WSL) it runs MySQL in Docker. Set `CASA_FIDA_MYSQL=docker` to use Docker on an Apple silicon Mac too.

```sh
npm install
npm run db:start   # the first run downloads MySQL and loads the sample data
npm run dev        # starts the web app and the API server together
```

Open http://localhost:5174 and log in with a [test account](#test-accounts), or sign up.

The downloaded MySQL doesn't start by itself after a reboot, so run `npm run db:start` before `npm run dev`. (In Docker, it starts with Docker.)

`npm run db:start` also brings an older database up to date: it runs each file in [db/migrations](db/migrations) the database hasn't had yet, in order, and records it in the `schema_migrations` table so it never runs twice. `npm run db:migrate` does just that. Databases from before migrations were recorded are recognized by the columns each migration added. To change the tables, add the next numbered file there (`.sql`, or `.ts` for changes SQL can't make), make the same change in [db/schema.sql](db/schema.sql), and add the file to the list at its end.

Without `SMTP_URL`, emails (like the link that confirms a new account's email address) are printed in the terminal running `npm run dev`. Without `S3_BUCKET`, photos are kept in `~/.casa-fida/files`.

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
| `npm run test:e2e` | Runs the browser tests: every scenario in `e2e/features`, in Chromium (see [Browser tests](#browser-tests)) |
| `npm run test:e2e:chrome` | Runs the same scenarios in the full Google Chrome for Testing browser |
| `npm run test:e2e:report` | Opens Playwright's report of the last browser test run, with a recording of each failed scenario |
| `npm run test:e2e:allure` | Makes the Allure report of the last browser test run and opens it |
| `npm run test:deploy` | Checks the Docker setup end to end on this computer (see [Checking it all works](#checking-it-all-works)) |
| `npm run db:start` / `db:stop` / `db:status` | Starts (and brings up to date), stops or checks the local MySQL (port 3307) |
| `npm run db:migrate` | Runs the [migrations](db/migrations) the database hasn't had yet |
| `npm run db:users` | Prints every account, with builders' businesses and trades |
| `npm run db:shell` | Opens a MySQL prompt on the `casa_fida` database |
| `npm run db:reset` | Deletes all data and photos and reloads the sample data (asks first) |
| `npm run plan -- <email> pro [days]` | Puts a builder on Pro (for that many days, or with no end), or `free` to go back |

## How it fits together

```
Browser ──▶ Vite dev server (:5174) ──/api──▶ API server (:3002) ──▶ MySQL (:3307)
                                                     └──────────────▶ photos: ~/.casa-fida/files, or a bucket
```

The Vite dev server serves the React app and forwards every `/api` request to the API server, so the browser only talks to one address and the login cookie just works. In production, the API server serves the built app itself, behind Caddy:

```
Browser ──HTTPS──▶ Caddy (:443) ──▶ app (:3002) ──▶ MySQL
                                        └─────────▶ bucket (R2, B2, Spaces…): photos, and nightly backups of MySQL
```

Photos are kept in file storage ([server/storage.ts](server/storage.ts)): a bucket on an S3-compatible service when `S3_BUCKET` is set, otherwise a folder. The bucket stays private; the app gets each photo from the API server, which checks that it's one of the two people on the project.

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
  storage.ts               Where photos are kept: a bucket, or a folder
  migrate.ts               Brings the database up to date (npm run db:migrate)
  errorTracking.ts         Sends errors to Sentry, when it's set up
  i18n/                    Every error message and email the server sends, in each language
  routes/                  account, builders, jobs (and quotes), projects, work (stages, updates,
                           photos), billing (change orders, invoices), messages, live
shared/                    Used by both the app and the server: limits, trades, languages, currencies and money formatting
db/                        schema.sql, seed.sql, migrations/ for older databases, and mysql.sh to run MySQL
                           without installing it
Dockerfile                 The app in one image
docker-compose.yml         The app, MySQL, Caddy and nightly backups, on one server
deploy/                    Caddy's settings, the backup service, and the end-to-end check of all of it
e2e/                       Browser tests
  features/                The scenarios, in Gherkin: one file per part of the app
  steps/                   What each line of a scenario does in the browser
  support/                 The test server and its database, reading emails, finding things on the page
```

Tests sit next to the code they check: `ClientJob.test.tsx` tests `ClientJob.tsx`, and `billing.api.test.ts` tests `billing.ts`.

## Tests

```sh
npm test                 # all 587 tests
npx vitest run --project web
npx vitest run server/routes/billing.api.test.ts
```

| Group | What it checks | Files |
|---|---|---|
| **web** | Every page in a simulated browser: signing up and the builder profile, invite links, posting jobs, quoting and hiring, proposals, stages, photo updates, change orders, invoices, reviews, messages and live updates. The API is replaced with a mock. | `src/**/*.test.ts(x)` |
| **server** | Logic that needs no database: passwords, sessions, rate limits, live events and money. | `server/**/*.test.ts`, `shared/**/*.test.ts` |
| **api** | Every endpoint against a real MySQL: validation messages, who may see and change what, prices and invoice totals, photo limits, messaging privacy and live events. | `server/**/*.api.test.ts` |

The **api** tests need MySQL running (`npm run db:start`). They never touch your data: each run creates a separate `casa_fida_test` database and deletes it afterwards.

On GitHub, every pull request (and every change to `main`) runs lint, the type check and build, and all the tests against a fresh MySQL, with the browser tests alongside in a second job: see [.github/workflows/ci.yml](.github/workflows/ci.yml). The browser tests' reports can be downloaded from the run's page.

### Browser tests

The scenarios in [e2e/features](e2e/features) use the whole app the way people do, in a real browser: signing up and confirming an email address, passwords, finding builders, posting jobs, quoting and hiring, proposals and invites, stages, photo updates, change orders, invoices, reviews, messages, live updates, plans, currencies, the three languages and phone screens. They're written in Gherkin, the language of Cucumber, and run by Playwright through [playwright-bdd](https://vitalets.github.io/playwright-bdd/):

```gherkin
Scenario: Approving a change order
  Given I am logged in as Emma
  When I open the project "Rear extension & open-plan kitchen"
  And I open the tab "Changes & invoices"
  And I click "Approve" on the change order "Add a skylight over the kitchen"
  And I confirm with "Approve change"
  Then the "Total price" is "$154,550"
  And Marcus gets an email "Change approved: Add a skylight over the kitchen"
```

```sh
npx playwright install chromium            # once, to download the browser
npm run test:e2e                           # all 130 scenarios, about 2 minutes
npm run test:e2e:chrome                    # the same, in the full Chrome for Testing browser
npm run test:e2e -- --grep "change order"  # the scenarios whose name matches
npm run test:e2e -- --headed               # watch them happen
npm run test:e2e:allure                    # the last run's Allure report
npm run test:e2e:report                    # the last run's Playwright report
```

The **Allure report** groups the scenarios by feature and shows each step with what it did in the browser. A failed scenario has its screenshot and a recording (trace) to step through. Each report adds its run to a history kept on your computer, so later reports show trends and scenarios that pass only sometimes. The report is a single file, `e2e/allure-report/index.html`; on GitHub it comes with the other reports from each run.

They need MySQL running (`npm run db:start`), and start their own copy of the app on other ports (web 5184, API 3102), so `npm run dev` can keep running. That copy has its own database, `casa_fida_e2e`, with the [test accounts](#test-accounts) loaded fresh before every scenario, and writes each email it sends to `e2e/.mail`, so scenarios can open the links in them.

Scenarios call the test accounts by their first name. A scenario can follow two people, each in their own browser ("When I switch to Marcus's browser"), which is how live updates are checked.

To add a scenario, write it with lines the other scenarios already use (their steps are in [e2e/steps](e2e/steps)), or add a step there: `npm run test:e2e` lists any line that has no step yet. Each run also writes a Cucumber report to `e2e/report/cucumber.html`.

## Running in production

Everything runs on one Linux server with Docker, from [docker-compose.yml](docker-compose.yml): the app, its MySQL database, [Caddy](https://caddyserver.com) in front for HTTPS (it gets and renews the certificate by itself), and a backup of the database every night. Nothing that matters lives only on the server: photos are in a bucket on an S3-compatible file storage service, and so are the backups, so a new server can take over from a lost one.

### A new server

You need:

- **A Linux server** with ports 80 and 443 open. 2 GB of memory is enough (building the image needs most of it). Install Docker with `curl -fsSL https://get.docker.com | sh`.
- **A domain name** (or subdomain) whose DNS points at the server.
- **A bucket** and an access key that can read, write and delete in it, on [Cloudflare R2](https://developers.cloudflare.com/r2/), [Backblaze B2](https://www.backblaze.com/cloud-storage) or [DigitalOcean Spaces](https://www.digitalocean.com/products/spaces) (or Amazon S3). Keep it private.
- Optionally, an SMTP service for email and a [Sentry](https://sentry.io) project for errors.

Then, on the server:

```sh
git clone https://github.com/MrMonochrom/buildbridge.git casa-fida && cd casa-fida
cp .env.example .env    # fill it in: the domain, two passwords, the bucket, email, Sentry
docker compose up -d
```

(While the repository is private, the server needs a [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) to clone it: then use `git@github.com:MrMonochrom/buildbridge.git`.)

The first start builds the image (a few minutes), makes the database's tables, gets the HTTPS certificate and makes the first backup. The app is then on `https://<DOMAIN>`. Each time the app starts, it brings the database up to date ([migrations](db/migrations)).

To update to the newest code later, run `deploy/update.sh`: it backs up the database, pulls, rebuilds and swaps the new version in. `docker compose logs -f app` shows the app's log, and its warnings about anything not set up.

### Backups

The backup service dumps the database every night at `BACKUP_TIME` (03:00 UTC by default) into the bucket under `backups/`, as `casa_fida-<date and time>.sql.gz`, and removes the ones more than `BACKUP_KEEP_DAYS` (30) days old. It makes one straight away when it starts if the newest is more than a day old. Photos aren't in the backups: they're in the bucket already.

```sh
docker compose run --rm backup now               # a backup straight away
docker compose run --rm backup list              # the backups there are
docker compose run --rm backup check             # loads the newest into a scratch database and compares it with the real one
docker compose run --rm backup restore <name>    # replaces the database with that backup (or "latest"); asks first
```

`check` is the restore test: it shows each table's rows in the backup next to the live database's. Run it after setting up a server, and now and then.

**When a server is lost**, set up a new one as above with the same `.env` (the same bucket), then:

```sh
docker compose up -d
docker compose stop app
docker compose run --rm backup restore latest
docker compose start app
```

`restore` backs up whatever is in the database first, so nothing is lost by restoring the wrong one.

### Error tracking and uptime

With `SENTRY_DSN` set, errors in the server (failed requests, emails that didn't send, the hourly checks) and in people's browsers go to Sentry, which groups them and emails you about new ones. They carry no cookies, headers, request bodies, query strings (links from emails have tokens there) or local variables. `SENTRY_ENVIRONMENT` tells staging's errors apart from production's, and each one says which commit was running.

Two monitors to set up once the app is running, both in Sentry (or Better Stack, UptimeRobot, Healthchecks.io…):

- **Uptime**: an uptime monitor on `https://<DOMAIN>/api/health`, every minute. It answers `200 {"ok":true}` while the app can reach its database, and `503` when it can't.
- **Backups**: a cron monitor that expects a check-in every day. Put its check-in URL (Sentry shows it in the monitor's instructions for cURL) in `BACKUP_PING_URL`, and you hear about it when a backup doesn't happen.

### Staging

A staging copy is a second server set up the same way, with its own subdomain (like `staging.casafida.example.com`), its own bucket (backups and photos never mix with production's), `SENTRY_ENVIRONMENT=staging`, and its own passwords. To try it with the [test accounts](#test-accounts), load the sample data once:

```sh
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" casa_fida' < db/seed.sql
```

Leave `SMTP_URL` empty on staging unless you mean it to email people: the emails are then only in its log (`docker compose logs app`).

### Checking it all works

`npm run test:deploy` ([deploy/smoke-test.sh](deploy/smoke-test.sh)) runs the whole of docker-compose.yml on your computer, with a local S3-compatible server standing in for the bucket and Caddy on https://localhost:8443, and checks that:

1. everything starts from nothing with one command, and answers over HTTPS;
2. a photo goes to the bucket (not MySQL) and loads from it;
3. live updates get through Caddy;
4. backups go to the bucket, old ones are removed, and the restore check passes;
5. after the server "dies" (the app, MySQL and their volumes are deleted), a new one gets the backup restored and the same photo still loads.

It needs Docker, and takes a few minutes. It uses its own Docker project and port, so it touches nothing else.

### Without Docker

Build the app with `npm run build`, bring the database up to date with `npm run db:migrate` (an empty database gets its tables), then start the server with `node --env-file=.env server/index.ts`. It serves the app and the API from one port, with security headers and secure cookies, so put it behind a proxy that handles HTTPS (like Caddy). The settings, which docker-compose.yml fills in from `.env`:

| Setting | What it's for | Default |
|---|---|---|
| `NODE_ENV` | `production` serves the built app and turns on security headers | development |
| `APP_URL` | The address in links in emails | `http://localhost:5174` |
| `PORT`, `HOST` | Where the server listens | `3002`, `127.0.0.1` |
| `TRUST_PROXY` | How many proxies sit in front, so login limits see real addresses (`true` counts as 1) | off |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | The MySQL database | `127.0.0.1`, `3307`, `root`, empty, `casa_fida` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | The bucket photos are kept in (see [.env.example](.env.example) for each service's endpoint) | not set |
| `STORAGE_DIR` | Without `S3_BUCKET`, the folder photos are kept in | `~/.casa-fida/files` |
| `SMTP_URL`, `MAIL_FROM` | Sending email. Without `SMTP_URL`, emails are only printed in the server's log. | not set |
| `MAIL_DIR` | Without `SMTP_URL`, also writes each email to this folder as a file (the browser tests read them there) | not set |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | Sending errors to Sentry, and which copy of the app they're from | not set, `NODE_ENV` |
| `APP_VERSION` | Which version is running, for error reports (the Docker image is given its commit) | not set |

## Limitations and next steps

| Not done yet | Today |
|---|---|
| Paying in the app | Clients pay the way they agree with their builder, who marks each invoice paid. Builders can't pay for Pro yet: there's the free trial, and `npm run plan`. |
| Email digests | Each notification is its own email; there's no daily summary. |
| Files such as plans and contracts | Only photos, on project updates. |
| Running several server processes | Live updates and login limits are kept in one process's memory. |
| Readable browser errors | The built app's code is minified, so browser errors in Sentry point into minified code. Uploading source maps to Sentry while building would fix that. |

## Tech stack

React 19, TypeScript 6, Vite 8, Express 5, mysql2, MySQL 8.4 and oxlint. Tests use Vitest, Testing Library (with jsdom) and supertest. The browser tests use Playwright and playwright-bdd, with scenarios in Gherkin as in Cucumber, and Allure 3 for their report.
