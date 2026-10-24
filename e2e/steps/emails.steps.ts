// Emails the app sends, and opening the links in them.
import { expectNoEmail, linkIn, waitForEmail, waitForEmails } from '../support/mail.ts'
import { Then, When } from './fixtures.ts'

Then('{person} gets an email {string}', async function (name: string, subject: string) {
  await waitForEmail(this.person(name).email, subject)
})

Then('{string} gets an email {string}', async function (address: string, subject: string) {
  await waitForEmail(address, subject)
})

Then('{string} gets {int} emails {string}', async function (address: string, count: number, subject: string) {
  await waitForEmails(address, subject, count)
})

Then('{person} gets no email {string}', async function (name: string, subject: string) {
  await expectNoEmail(this.person(name).email, subject)
})

Then('{string} gets no email {string}', async function (address: string, subject: string) {
  await expectNoEmail(address, subject)
})

When('I open the link in the email {string} to {string}', async function (subject: string, address: string) {
  await this.page.goto(linkIn(await waitForEmail(address, subject)))
})

When(
  'I open the link in the email {string} to {string} in a new browser',
  async function (subject: string, address: string) {
    const link = linkIn(await waitForEmail(address, subject))
    await (await this.openNewBrowser()).goto(link)
  },
)

When("I open the link in {person}'s email {string}", async function (name: string, subject: string) {
  await this.page.goto(linkIn(await waitForEmail(this.person(name).email, subject)))
})

When("I open the link in {person}'s email {string} in a new browser", async function (name: string, subject: string) {
  const link = linkIn(await waitForEmail(this.person(name).email, subject))
  await (await this.openNewBrowser()).goto(link)
})
