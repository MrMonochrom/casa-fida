// What a scenario keeps track of: one browser per person (so Emma and Marcus can each have Casa
// Fida open at once), whose browser the steps act in, and the people it knows.
import { expect } from '@playwright/test'
import type { Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test'
import type { Database } from './database.ts'
import { SAMPLE_PEOPLE } from './people.ts'
import type { Person } from './people.ts'

interface Seat {
  context: BrowserContext
  page: Page
}

export class World {
  private readonly seats = new Map<string, Seat>()
  private readonly people = new Map<string, Person>()
  private current: string | null = null
  private visitors = 0
  /** Settings for browsers opened from now on, like a phone's screen or the browser's language. */
  readonly browserSettings: BrowserContextOptions
  private readonly browser: Browser
  readonly db: Database

  constructor(browser: Browser, settings: BrowserContextOptions, db: Database) {
    this.browser = browser
    this.browserSettings = { ...settings }
    this.db = db
    for (const person of SAMPLE_PEOPLE) this.people.set(person.firstName, person)
  }

  person(firstName: string): Person {
    const person = this.people.get(firstName)
    if (!person) throw new Error(`No one called ${firstName} in this scenario. Sample people: ${[...this.people.keys()].join(', ')}`)
    return person
  }

  personWithEmail(email: string): Person | undefined {
    return [...this.people.values()].find((person) => person.email === email.trim().toLowerCase())
  }

  addPerson(person: Person) {
    this.people.set(person.firstName, person)
  }

  /** The page in the browser the steps are acting in. */
  get page(): Page {
    const seat = this.current && this.seats.get(this.current)
    if (!seat) throw new Error('No browser is open yet. Start with a step like "Given I am logged in as Emma".')
    return seat.page
  }

  /** Whose browser the steps are acting in, if it's someone's. */
  get me(): Person {
    if (!this.current || !this.people.has(this.current)) throw new Error('This step needs someone to be logged in.')
    return this.people.get(this.current)!
  }

  /** The page in someone's browser, without switching to it. */
  pageOf(name: string): Page {
    const seat = this.seats.get(name)
    if (!seat) throw new Error(`${name} has no browser open.`)
    return seat.page
  }

  /** Switches to a browser, opening it first if it isn't open yet. */
  async openBrowser(name: string): Promise<Page> {
    let seat = this.seats.get(name)
    if (!seat) {
      const context = await this.browser.newContext(this.browserSettings)
      seat = { context, page: await context.newPage() }
      this.seats.set(name, seat)
    }
    this.current = name
    return seat.page
  }

  /** A browser no one has logged in on yet, like one opening a link from an email. */
  openNewBrowser(): Promise<Page> {
    return this.openBrowser(`visitor ${++this.visitors}`)
  }

  /** The browser just used to sign up or log in is that person's from now on. */
  async giveBrowserTo(firstName: string) {
    if (!this.current || this.current === firstName) return
    const seat = this.seats.get(this.current)!
    this.seats.delete(this.current)
    await this.seats.get(firstName)?.context.close()
    this.seats.set(firstName, seat)
    this.current = firstName
  }

  /** Logs someone in (quickly, through the API) in their own browser, and opens Home. */
  async logIn(firstName: string, browserName = firstName): Promise<Page> {
    const person = this.person(firstName)
    const page = await this.openBrowser(browserName)
    const response = await page.request.post('/api/login', { data: { email: person.email, password: person.password } })
    expect(response.status(), `logging in as ${person.email}`).toBe(200)
    await page.goto('/')
    await expect(page.locator('header.topbar')).toBeVisible()
    return page
  }

  /** Switches to someone's browser, logging them in if they don't have one open yet. */
  async switchTo(firstName: string): Promise<Page> {
    if (this.seats.has(firstName)) return this.openBrowser(firstName)
    return this.logIn(firstName)
  }

  /** Does something in someone else's browser, then comes back to this one. */
  async as<T>(firstName: string, work: (page: Page) => Promise<T>): Promise<T> {
    const back = this.current
    const page = await this.switchTo(firstName)
    try {
      return await work(page)
    } finally {
      this.current = back
    }
  }

  /** Whether these details log in, tried from a separate, fresh browser. */
  async canLogIn(email: string, password: string): Promise<boolean> {
    const context = await this.browser.newContext(this.browserSettings)
    try {
      const response = await context.request.post('/api/login', { data: { email, password } })
      return response.ok()
    } finally {
      await context.close()
    }
  }

  async close() {
    for (const seat of this.seats.values()) await seat.context.close()
  }
}
