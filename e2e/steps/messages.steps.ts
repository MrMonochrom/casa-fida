// Conversations between clients and builders.
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { shownAs } from '../support/people.ts'
import { loaded, menuItem } from '../support/ui.ts'
import { Then, When } from './fixtures.ts'

async function openConversation(page: Page, name: string) {
  await page.getByRole('complementary', { name: 'Conversations' }).getByRole('link').filter({ hasText: name }).click()
  await expect(page.locator('.chat__who')).toContainText(name)
}

async function send(page: Page, text: string) {
  const box = page.getByRole('textbox', { name: 'Message', exact: true })
  await box.fill(text)
  await box.press('Enter')
}

When('I open the conversation with {string}', async function (name: string) {
  await openConversation(this.page, name)
})

Then('I am in the conversation with {string}', async function (name: string) {
  await expect(this.page).toHaveURL(/\/messages\/\d+$/)
  await expect(this.page.locator('.chat__who')).toContainText(name)
})

When('I type {string} and press Enter', async function (text: string) {
  await send(this.page, text)
})

Then('I see the message {string}', async function (text: string) {
  await expect(this.page.locator('.chat__messages').getByText(text)).toBeVisible()
})

When('{person} sends {person} the message {string}', async function (from: string, to: string, text: string) {
  const recipient = this.person(to)
  await this.as(from, async (page) => {
    await menuItem(page, 'Messages').click()
    await loaded(page)
    await openConversation(page, shownAs(recipient))
    await send(page, text)
    await expect(page.locator('.chat__messages').getByText(text)).toBeVisible()
  })
})
