// Jobs, quotes and hiring.
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { clickable, confirmIn, fillField, linkTitled, loaded, menuItem } from '../support/ui.ts'
import type { World } from '../support/world.ts'
import { Given, Then, When } from './fixtures.ts'

/** Opens a job: a client from My jobs; a builder from Find work, or from My quotes once it's closed. */
async function openJob(world: World, title: string) {
  const page = world.page
  if (world.me.role === 'client') {
    await menuItem(page, 'My jobs').click()
    await loaded(page)
  } else {
    await menuItem(page, 'Find work').click()
    await page.getByRole('combobox', { name: 'Show jobs for' }).selectOption({ label: 'All trades' })
    await loaded(page)
    if ((await linkTitled(page, title).count()) === 0) {
      await page.getByRole('link', { name: 'My quotes', exact: true }).click()
      await loaded(page)
    }
  }
  await linkTitled(page, title).first().click()
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
  await loaded(page)
}

async function postJob(page: Page, title: string, trade: string, where: string) {
  await menuItem(page, 'My jobs').click()
  await clickable(page, 'Post a job').click()
  await fillField(page, 'Title', title)
  await fillField(page, 'Kind of work', trade)
  await fillField(page, 'Where', where)
  await fillField(page, 'Describe the work', 'Details to follow when we meet.')
  await page.getByRole('button', { name: 'Post job', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
}

async function sendQuote(page: Page, price: string) {
  await fillField(page, 'Your price', price)
  await fillField(page, "What's included", 'Everything in the job description.')
  await page.getByRole('button', { name: 'Send quote', exact: true }).click()
}

/** A quote on a client's job, by the builder's business. */
const quoteFrom = (page: Page, business: string) =>
  page.getByRole('listitem').filter({ has: page.getByText(business, { exact: true }) })

async function hire(page: Page, business: string) {
  await quoteFrom(page, business).getByRole('button', { name: 'Accept and hire', exact: true }).click()
  await confirmIn(page, 'Accept and hire')
  await expect(page).toHaveURL(/\/projects\/\d+/)
}

// ---------- Jobs ----------

When('I open the job {string}', async function (title: string) {
  await openJob(this, title)
})

When('I post a job {string} for {string} in {string}', async function (title: string, trade: string, where: string) {
  await postJob(this.page, title, trade, where)
})

When(
  '{person} posts a job {string} for {string} in {string}',
  async function (name: string, title: string, trade: string, where: string) {
    await this.as(name, (page) => postJob(page, title, trade, where))
  },
)

Then('I see the job {string}', async function (title: string) {
  await expect(linkTitled(this.page, title).first()).toBeVisible()
})

Then("I don't see the job {string}", async function (title: string) {
  await loaded(this.page)
  await expect(linkTitled(this.page, title)).toHaveCount(0)
})

Then('I see the job {string} with {string}', async function (title: string, text: string) {
  await expect(linkTitled(this.page, title)).toContainText(text)
})

Then('I see the job {string} under {string}', async function (title: string, heading: string) {
  const section = this.page.locator('section').filter({ has: this.page.getByRole('heading', { name: heading, exact: true }) })
  await expect(linkTitled(section, title)).toBeVisible()
})

// ---------- Quotes ----------

When('I send a quote of {string}', async function (price: string) {
  await sendQuote(this.page, price)
})

When('{person} sends a quote of {string} for {string}', async function (name: string, price: string, title: string) {
  await this.as(name, async (page) => {
    await openJob(this, title)
    await sendQuote(page, price)
    await expect(page.getByText('Waiting for an answer')).toBeVisible()
  })
})

Then('I see a quote from {string} for {string}', async function (business: string, amount: string) {
  await expect(quoteFrom(this.page, business)).toContainText(amount)
})

Then('the quote from {string} is {string}', async function (business: string, status: string) {
  await expect(quoteFrom(this.page, business)).toContainText(status)
})

Then('I see the quote for {string} at {string} is {string}', async function (title: string, amount: string, status: string) {
  const row = linkTitled(this.page, title)
  await expect(row).toContainText(amount)
  await expect(row).toContainText(status)
})

// ---------- Hiring ----------

When('I hire {string}', async function (business: string) {
  await hire(this.page, business)
})

Given('{person} has hired {string} for {string}', async function (name: string, business: string, title: string) {
  await this.as(name, async (page) => {
    await openJob(this, title)
    await hire(page, business)
  })
})

When('I decline the quote from {string}', async function (business: string) {
  await quoteFrom(this.page, business).getByRole('button', { name: 'Decline', exact: true }).click()
  await confirmIn(this.page, 'Decline quote')
})

When('I message the builder of the quote from {string}', async function (business: string) {
  await quoteFrom(this.page, business).getByRole('button', { name: 'Message', exact: true }).click()
})
