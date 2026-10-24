// Finding builders and their profiles.
import { expect } from '@playwright/test'
import type { DataTable } from 'playwright-bdd'
import { linkTitled, loaded } from '../support/ui.ts'
import { Then, When } from './fixtures.ts'

When('I search for {string}', async function (text: string) {
  await this.page.getByRole('searchbox', { name: 'Search builders' }).fill(text)
})

Then('the builders are listed in this order:', async function (table: DataTable) {
  // Searching waits for a pause in typing, so this waits for the list to match.
  const names = table.raw().map(([name]) => name)
  await expect(this.page.getByRole('main').getByRole('heading', { level: 3 })).toHaveText(names)
})

When('I open the builder {string}', async function (business: string) {
  await linkTitled(this.page, business).click()
  await loaded(this.page)
})

Then('I see a review by {string} saying {string}', async function (by: string, text: string) {
  const review = this.page.getByRole('listitem').filter({ hasText: by }).filter({ hasText: text })
  await expect(review).toBeVisible()
})
