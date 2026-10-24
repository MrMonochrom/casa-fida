// Builders' plans and trades, and how the app fits a phone's screen.
import { expect } from '@playwright/test'
import type { DataTable } from 'playwright-bdd'
import { loaded, menu } from '../support/ui.ts'
import { settle } from '../support/wait.ts'
import { Then, When } from './fixtures.ts'

// ---------- Plans ----------

Then('the plans compare like this:', async function (table: DataTable) {
  for (const [label, free, pro] of table.raw()) {
    const row = this.page.getByRole('row').filter({ has: this.page.getByRole('rowheader', { name: label, exact: true }) })
    await expect(row.getByRole('cell')).toHaveText([free, pro])
  }
})

Then("I see that I'm on Pro for {int} days", async function (days: number) {
  const ends = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  const date = ends.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  await expect(this.page.getByText(`You're on Pro until ${date}.`)).toBeVisible()
})

When('I choose the trades {string}', async function (list: string) {
  for (const trade of list.split(/,\s*/)) {
    await this.page.getByRole('button', { name: trade, exact: true, pressed: false }).click()
  }
})

Then("the trade {string} can't be chosen", async function (trade: string) {
  await expect(this.page.getByRole('button', { name: trade, exact: true })).toBeDisabled()
})

When("{person}'s Pro ended yesterday", async function (name: string) {
  await this.db.execute("UPDATE users SET plan = 'pro', plan_ends_at = NOW() - INTERVAL 1 DAY WHERE email = ?", [
    this.person(name).email,
  ])
})

// ---------- Fitting the screen ----------

Then('the menu shows {string}', async function (labels: string) {
  // Each menu item has a long label and a short one for narrow screens. The one not shown is either
  // hidden or shrunk to a pixel (so screen readers still read it), so this looks for the one with room.
  const shown = () =>
    menu(this.page)
      .getByRole('link')
      .evaluateAll((links) =>
        links.map(
          (link) =>
            [...link.querySelectorAll('.nav__label')].find(
              (label) => label.checkVisibility() && label.getBoundingClientRect().width > 1,
            )?.textContent ?? '',
        ),
      )
  const expected = labels.split(/,\s*/)
  await settle(async () => (await shown()).join('|') === expected.join('|'))
  expect(await shown()).toEqual(expected)
})

Then('nothing is wider than the screen', async function () {
  await loaded(this.page)
  const sizes = await this.page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    screen: window.innerWidth,
    // Menu labels on show that are cut short to fit.
    clipped: [...document.querySelectorAll<HTMLElement>('.nav__label')]
      .filter((label) => label.checkVisibility() && label.getBoundingClientRect().width > 1)
      .filter((label) => label.scrollWidth > label.clientWidth + 1)
      .map((label) => label.textContent),
  }))
  expect(sizes.page, 'the page is wider than the screen').toBeLessThanOrEqual(sizes.screen)
  expect(sizes.clipped, 'menu labels that are cut short').toEqual([])
})
