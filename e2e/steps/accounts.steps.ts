// Signing up, logging in and out, confirming an email address, passwords and languages.
// Logging in works the same in any language, so it finds the form's fields by their type.
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { NEW_PASSWORD } from '../support/settings.ts'
import { field } from '../support/ui.ts'
import { Given, Then, When } from './fixtures.ts'

const LOCALES: Record<string, string> = { English: 'en-US', Romanian: 'ro-RO', Russian: 'ru-RU' }

/** The login (or sign-up) form, before or after logging in. */
const authForm = (page: Page) => page.locator('form.auth-card')

Given('I open Casa Fida', async function () {
  const page = await this.openNewBrowser()
  await page.goto('/')
  await expect(authForm(page)).toBeVisible()
})

Given('I open Casa Fida in a browser set to {word}', async function (language: string) {
  const locale = LOCALES[language]
  if (!locale) throw new Error(`Languages: ${Object.keys(LOCALES).join(', ')}`)
  this.browserSettings.locale = locale
  const page = await this.openNewBrowser()
  await page.goto('/')
  await expect(authForm(page)).toBeVisible()
})

Given('I open {string} in a new browser', async function (path: string) {
  const page = await this.openNewBrowser()
  await page.goto(path)
})

When('I log in with {string} and the password {string}', async function (email: string, password: string) {
  const form = authForm(this.page)
  await form.locator('input[type=email]').fill(email)
  await form.locator('input[type=password]').fill(password)
  await form.locator('button[type=submit]').click()
  // From now on this is their browser, if the scenario knows them.
  const person = this.personWithEmail(email)
  if (person && person.password === password) {
    await expect(this.page.locator('header.topbar')).toBeVisible()
    await this.giveBrowserTo(person.firstName)
  }
})

When('I log in from the invite as {person}', async function (name: string) {
  const person = this.person(name)
  const page = this.page
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await field(page, 'Email').fill(person.email)
  await field(page, 'Password').fill(person.password)
  await authForm(page).locator('button[type=submit]').click()
  await expect(page.locator('header.topbar')).toBeVisible()
  await this.giveBrowserTo(name)
})

When(
  'I sign up as a {word} named {string} with the email {string}',
  async function (role: string, name: string, email: string) {
    if (role !== 'client' && role !== 'builder') throw new Error(`Sign up as a client or a builder, not a ${role}.`)
    const page = this.page
    await page.getByRole('button', { name: 'Create an account', exact: true }).click()
    await page.getByText(role === 'client' ? 'I need work done' : "I'm a builder", { exact: true }).click()
    await field(page, 'Your name').fill(name)
    await field(page, 'Email').fill(email)
    await field(page, 'Password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    // Signing up with an email that's taken stays on the form, with an error.
    const signedUp = page.locator('header.topbar').or(page.getByText('Step 2 of 2'))
    const refused = page.getByRole('alert')
    await expect(signedUp.or(refused).first()).toBeVisible()
    if (await refused.count()) return
    const firstName = name.split(' ')[0]
    this.addPerson({ firstName, name, email, password: NEW_PASSWORD, role })
    await this.giveBrowserTo(firstName)
  },
)

When('I ask for a link to reset the password of {string}', async function (email: string) {
  const form = authForm(this.page)
  await form.locator('.auth-card__forgot button').click()
  await form.locator('input[type=email]').fill(email)
  await form.locator('button[type=submit]').click()
  await expect(form.getByRole('status')).toBeVisible()
})

When('I change my password from {string} to {string}', async function (current: string, next: string) {
  await field(this.page, 'Current password').fill(current)
  await field(this.page, 'New password').fill(next)
  await this.page.getByRole('button', { name: 'Change password', exact: true }).click()
})

Given('{person} is also logged in on another computer', async function (name: string) {
  await this.logIn(name, `${name}'s other computer`)
  await this.switchTo(name)
})

Then("{person}'s other computer is logged out", async function (name: string) {
  const page = this.pageOf(`${name}'s other computer`)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Log in', exact: true })).toBeVisible()
})

Then('{person} can log in with the password {string}', async function (name: string, password: string) {
  expect(await this.canLogIn(this.person(name).email, password)).toBe(true)
})

Then("{person} can't log in with the password {string}", async function (name: string, password: string) {
  expect(await this.canLogIn(this.person(name).email, password)).toBe(false)
})

Given("{person} hasn't confirmed his/her email address", async function (name: string) {
  await this.db.execute('UPDATE users SET email_verified_at = NULL WHERE email = ?', [this.person(name).email])
})

// ---------- Languages ----------

When('I switch the language to {string}', async function (language: string) {
  // The menu's picker shows short codes (EN, RO, RU); the one on the login page shows names.
  const picker = this.page.getByRole('combobox', { name: /^(Language|Limba|Язык)$/ }).first()
  await picker.selectOption({ label: language })
})
