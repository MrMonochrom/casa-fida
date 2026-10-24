// Ties the feature files to Playwright. Every scenario starts with the sample data from db/seed.sql
// loaded fresh and no emails sent, and gets its own World (see e2e/support/world.ts).
import * as allure from 'allure-js-commons'
import { createBdd, defineParameterType, test as base } from 'playwright-bdd'
import { connect, reloadSampleData } from '../support/database.ts'
import type { Database } from '../support/database.ts'
import { clearEmails } from '../support/mail.ts'
import { World } from '../support/world.ts'

export const test = base.extend<{ world: World }, { db: Database }>({
  db: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads which fixtures this needs from the pattern.
    async ({}, provide) => {
      const db = await connect()
      await provide(db)
      await db.end()
    },
    { scope: 'worker' },
  ],
  // Named `provide` rather than Playwright's usual `use`, which the linter takes for a React hook.
  world: async ({ browser, db, baseURL, locale }, provide, testInfo) => {
    // In the Allure report, each scenario sits under its feature, and a Scenario Outline's
    // examples under the outline. The title path is: file, feature, (outline,) scenario.
    const [, feature, ...outline] = testInfo.titlePath.slice(0, -1)
    await allure.feature(feature)
    await allure.suite(feature)
    if (outline.length) {
      await allure.story(outline.join(' › '))
      await allure.subSuite(outline.join(' › '))
    }
    await reloadSampleData(db)
    clearEmails()
    const world = new World(browser, { baseURL, locale }, db)
    await provide(world)
    await world.close()
  },
})

export const { Given, When, Then } = createBdd(test, { worldFixture: 'world' })

/** Someone's first name, like Emma or Marcus. */
defineParameterType({ name: 'person', regexp: /[A-Z][a-z]+/ })
