// Finding things on the page the way a person does: by their label, name or the words on them.
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

type Scope = Page | Locator

export const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A form field by its label. Labels can end in a note like "(optional)", which steps leave out. */
export const field = (scope: Scope, label: string) =>
  scope.getByLabel(new RegExp(`^${escapeRegExp(label)}(\\s+\\(.*\\))?$`))

/** Types into a field, or picks the option with that text if it's a list. */
export async function fillField(scope: Scope, label: string, value: string) {
  const input = field(scope, label)
  if ((await input.evaluate((element) => element.tagName)) === 'SELECT') await input.selectOption({ label: value })
  else await input.fill(value)
}

/** A button or link on screen with exactly this name. */
export const clickable = (scope: Scope, name: string) =>
  scope
    .getByRole('button', { name, exact: true })
    .or(scope.getByRole('link', { name, exact: true }))
    .filter({ visible: true })
    .first()

/** Waits for the page to finish loading what it shows. */
export async function loaded(page: Page) {
  await expect(page.locator('.state:not(.state--error)')).toHaveCount(0)
}

/** The menu at the top of every page. */
export const menu = (page: Page) => page.locator('header.topbar nav')

export const menuItem = (page: Page, label: string) => menu(page).getByRole('link', { name: label })

/** The page itself. Locators inside filter({ has }) have to start from it. */
const pageOf = (scope: Scope): Page => ('page' in scope && typeof scope.page === 'function' ? scope.page() : (scope as Page))

/** A link (a card or a row in a list) whose title is exactly this. */
export const linkTitled = (scope: Scope, title: string) =>
  scope.getByRole('link').filter({ has: pageOf(scope).getByText(title, { exact: true }) })

/** An item in a list (a quote, an update, a change order) that mentions this. */
export const item = (scope: Scope, text: string) => scope.getByRole('listitem').filter({ hasText: text })

/** The dialog that's open, if any. */
export const dialog = (page: Page) => page.getByRole('dialog')

/** Presses a button in the open dialog, then waits for it to close (or show why it can't). */
export async function confirmIn(page: Page, button: string) {
  await dialog(page).getByRole('button', { name: button, exact: true }).click()
  const closed = page.locator('body:not(:has([role="dialog"]))')
  await closed.or(dialog(page).getByRole('alert')).first().waitFor()
}
