// Proposals and everything on a project's page: stages, updates, change orders, invoices and reviews.
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { DataTable } from 'playwright-bdd'
import { clickable, confirmIn, escapeRegExp, fillField, item, linkTitled, loaded, menuItem } from '../support/ui.ts'
import { Given, Then, When } from './fixtures.ts'

async function openProject(page: Page, title: string) {
  await menuItem(page, 'Projects').click()
  await loaded(page)
  await linkTitled(page, title).click()
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
  await loaded(page)
}

/** One of the tabs on a project's page. Its name can end in a count, like "Updates 4". */
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Project' }).getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}`) })

async function openTab(page: Page, name: string) {
  await tab(page, name).click()
  await expect(tab(page, name)).toHaveAttribute('aria-current', 'page')
  await loaded(page)
}

async function sendProposal(page: Page, fields: string[][]) {
  await menuItem(page, 'Projects').click()
  await clickable(page, 'Send a proposal').click()
  for (const [label, value] of fields) await fillField(page, label, value)
  await page.getByRole('button', { name: 'Send proposal', exact: true }).click()
}

When('I open the project {string}', async function (title: string) {
  await openProject(this.page, title)
})

When('I open the tab {string}', async function (name: string) {
  await openTab(this.page, name)
})

Then('I see the tab {string}', async function (name: string) {
  await expect(tab(this.page, name)).toBeVisible()
})

Then('the tab {string} is open', async function (name: string) {
  await expect(tab(this.page, name)).toHaveAttribute('aria-current', 'page')
})

Then('the tab {string} says {string}', async function (name: string, count: string) {
  await expect(tab(this.page, name).getByLabel(count, { exact: true })).toBeVisible()
})

// ---------- Proposals ----------

When('I send a proposal:', async function (table: DataTable) {
  await sendProposal(this.page, table.raw())
})

Given(
  'I have sent a proposal {string} to {string} at {string}',
  async function (title: string, name: string, email: string) {
    await sendProposal(this.page, [
      ['Name', name],
      ['Email', email],
      ['Title', title],
      ["What's included", 'The work we talked through.'],
      ['Price', '30,000'],
    ])
    await expect(this.page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
  },
)

When('I open the invite link {person} copied in a new browser', async function (name: string) {
  const link = await this.pageOf(name).getByLabel('Invite link').inputValue()
  await (await this.openNewBrowser()).goto(link)
})

When('{person} accepts the proposal {string}', async function (name: string, title: string) {
  await this.as(name, async (page) => {
    await openProject(page, title)
    await page.getByRole('button', { name: 'Accept proposal', exact: true }).click()
    await confirmIn(page, 'Accept proposal')
    await expect(page.getByText('In progress').first()).toBeVisible()
  })
})

// ---------- Stages ----------

const stage = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) })

async function setStage(page: Page, name: string, status: string) {
  const select = page.getByRole('combobox', { name: `Status of ${name}`, exact: true })
  await select.selectOption({ label: status })
  // The list shows the new status once the server has saved it.
  await expect(select.locator('option:checked')).toHaveText(status)
}

When('I add my own stage {string}', async function (name: string) {
  await this.page.getByLabel('Your own stage').fill(name)
  await this.page.getByRole('button', { name: 'Add', exact: true }).click()
})

Then('the stages are, in order:', async function (table: DataTable) {
  await expect(this.page.locator('.stage__name')).toHaveText(table.raw().map(([name]) => name))
})

When('I set the stage {string} to {string}', async function (name: string, status: string) {
  await setStage(this.page, name, status)
})

When(
  '{person} sets the stage {string} of {string} to {string}',
  async function (person: string, name: string, project: string, status: string) {
    await this.as(person, async (page) => {
      await openProject(page, project)
      await setStage(page, name, status)
    })
  },
)

Then('the stage {string} is {string}', async function (name: string, status: string) {
  const row = stage(this.page, name)
  await expect(row).toBeVisible()
  // The builder changes it in a list; the client just sees it.
  const select = row.getByRole('combobox')
  if (await select.count()) await expect(select.locator('option:checked')).toHaveText(status)
  else await expect(row).toContainText(status)
})

Then('I see the stage {string}', async function (name: string) {
  await expect(stage(this.page, name)).toBeVisible()
})

When('I add the stage {string}', async function (name: string) {
  await this.page.getByLabel('New stage', { exact: true }).fill(name)
  await this.page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(stage(this.page, name)).toBeVisible()
})

When('I rename the stage {string} to {string}', async function (name: string, newName: string) {
  await this.page.getByRole('button', { name: `Rename ${name}`, exact: true }).click()
  await this.page.getByLabel('Stage name', { exact: true }).fill(newName)
  await this.page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(stage(this.page, newName)).toBeVisible()
})

// ---------- Updates ----------

When('I add the photo {string}', async function (file: string) {
  await this.page.locator('input[type=file]').setInputFiles(fileURLToPath(new URL(`../fixtures/${file}`, import.meta.url)))
  await expect(this.page.getByRole('img', { name: /^New photo \d+$/ })).toHaveCount(1)
})

Then('I see the update {string} with {int} photo(s)', async function (text: string, count: number) {
  const update = item(this.page, text)
  await expect(update).toBeVisible()
  await expect(update.getByRole('img', { name: /^Photo \d+ of \d+$/ })).toHaveCount(count)
})

When('I open the photo in the update {string}', async function (text: string) {
  await item(this.page, text).getByRole('img').first().click()
})

When('{person} posts the update {string} on {string}', async function (name: string, text: string, project: string) {
  await this.as(name, async (page) => {
    await openProject(page, project)
    await openTab(page, 'Updates')
    await fillField(page, 'Post an update', text)
    await page.getByRole('button', { name: 'Post update', exact: true }).click()
    await expect(item(page, text)).toBeVisible()
  })
})

When('I delete the update {string}', async function (text: string) {
  await item(this.page, text).getByRole('button', { name: 'Delete this update', exact: true }).click()
  await confirmIn(this.page, 'Delete update')
})

// ---------- Change orders and invoices ----------

const changeOrder = (page: Page, title: string) =>
  page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title, exact: true }) })

const invoice = (page: Page, title: string) =>
  page.getByRole('row').filter({ has: page.getByRole('cell', { name: title, exact: true }) })

When('I click {string} on the change order {string}', async function (button: string, title: string) {
  await changeOrder(this.page, title).getByRole('button', { name: button, exact: true }).click()
})

Then('the change order {string} is {string}', async function (title: string, status: string) {
  await expect(changeOrder(this.page, title)).toContainText(status)
})

Then('the change order {string} shows {string}', async function (title: string, text: string) {
  await expect(changeOrder(this.page, title)).toContainText(text)
})

Then('the {string} is {string}', async function (label: string, amount: string) {
  const tile = this.page.locator('.money-tile').filter({ has: this.page.getByText(label, { exact: true }) })
  await expect(tile).toContainText(amount)
})

When('I click {string} on the invoice {string}', async function (button: string, title: string) {
  await invoice(this.page, title).getByRole('button', { name: button, exact: true }).click()
})

Then('the invoice {string} for {string} is {string}', async function (title: string, amount: string, status: string) {
  const row = invoice(this.page, title)
  await expect(row).toContainText(amount)
  await expect(row).toContainText(status)
})

Given('the invoice {string} was due yesterday', async function (title: string) {
  await this.db.execute('UPDATE invoices SET due_date = CURDATE() - INTERVAL 1 DAY WHERE title = ?', [title])
})

When(
  '{person} sends an invoice for {string} of {string} on {string}',
  async function (name: string, title: string, amount: string, project: string) {
    await this.as(name, async (page) => {
      await openProject(page, project)
      await openTab(page, 'Changes & invoices')
      await page.getByRole('button', { name: 'New invoice', exact: true }).click()
      await fillField(page, "What it's for", title)
      await fillField(page, 'Amount', amount)
      await page.getByRole('button', { name: 'Send invoice', exact: true }).click()
      await expect(invoice(page, title)).toBeVisible()
    })
  },
)

// ---------- Reviews ----------

When('I give it {int} stars', async function (stars: number) {
  // The stars are radio buttons hidden behind ★ symbols.
  await this.page.getByRole('radio', { name: stars === 1 ? '1 star' : `${stars} stars`, exact: true }).check({ force: true })
})

// ---------- Home ----------

/** Home's list of what's waiting for you. */
const waiting = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Waiting for you', exact: true }) })

Then('I see the to-do {string} about {string}', async function (todo: string, about: string) {
  await expect(waiting(this.page).getByRole('link').filter({ hasText: todo }).filter({ hasText: about })).toBeVisible()
})

When('I click the to-do {string}', async function (todo: string) {
  await waiting(this.page).getByRole('link').filter({ hasText: todo }).click()
})

When('I use the shortcut {string}', async function (title: string) {
  await this.page.locator('.action-card').filter({ hasText: title }).click()
})
