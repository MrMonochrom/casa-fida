// Steps any feature can use: browsers, finding things on the page, clicking and filling in forms.
import { expect } from '@playwright/test'
import type { DataTable } from 'playwright-bdd'
import { clickable, confirmIn, dialog, field, fillField, loaded, menuItem } from '../support/ui.ts'
import { Given, Then, When } from './fixtures.ts'

// ---------- Browsers ----------

Given('I am logged in as {person}', async function (name: string) {
  await this.logIn(name)
})

When("I switch to {person}'s browser", async function (name: string) {
  await this.switchTo(name)
})

Given('I use a phone', async function () {
  Object.assign(this.browserSettings, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
})

// ---------- Getting around ----------

When('I open {string} in the menu', async function (label: string) {
  await menuItem(this.page, label).click()
  await loaded(this.page)
})

When('I go to {string}', async function (path: string) {
  await this.page.goto(path)
})

When('I reload the page', async function () {
  await this.page.reload()
})

// ---------- Doing things ----------

When('I click {string}', async function (name: string) {
  await clickable(this.page, name).click()
})

When('I confirm with {string}', async function (button: string) {
  await confirmIn(this.page, button)
})

When('I choose {string}', async function (text: string) {
  await this.page.getByText(text, { exact: true }).click()
})

When('I fill in {string} with {string}', async function (label: string, value: string) {
  await fillField(this.page, label, value)
})

When('I fill in the form:', async function (table: DataTable) {
  for (const [label, value] of table.raw()) await fillField(this.page, label, value)
})

When('I choose {string} for {string}', async function (option: string, label: string) {
  await field(this.page, label).selectOption({ label: option })
})

When('I tick {string}', async function (label: string) {
  await this.page.getByRole('checkbox', { name: label, exact: true }).check()
})

When('I untick {string}', async function (label: string) {
  await this.page.getByRole('checkbox', { name: label, exact: true }).uncheck()
})

// ---------- What's on the page ----------

Then('I see {string}', async function (text: string) {
  await expect(this.page.getByText(text).filter({ visible: true }).first()).toBeVisible()
})

Then("I don't see {string}", async function (text: string) {
  await loaded(this.page)
  await expect(this.page.getByText(text).filter({ visible: true })).toHaveCount(0)
})

Then('I see the heading {string}', async function (text: string) {
  await expect(this.page.getByRole('heading', { name: text, exact: true })).toBeVisible()
})

Then('I see the error {string}', async function (text: string) {
  await expect(this.page.getByRole('alert').filter({ hasText: text }).first()).toBeVisible()
})

Then('I see the button {string}', async function (name: string) {
  await expect(this.page.getByRole('button', { name, exact: true })).toBeVisible()
})

Then("I don't see the button {string}", async function (name: string) {
  await loaded(this.page)
  await expect(this.page.getByRole('button', { name, exact: true })).toHaveCount(0)
})

Then('I see the link {string}', async function (name: string) {
  await expect(this.page.getByRole('link', { name, exact: true })).toBeVisible()
})

Then('I see the dialog {string}', async function (title: string) {
  await expect(dialog(this.page).filter({ has: this.page.getByRole('heading', { name: title, exact: true }) })).toBeVisible()
})

Then('the field {string} shows {string}', async function (label: string, value: string) {
  await expect(field(this.page, label)).toHaveValue(value)
})

Then("the field {string} can't be changed", async function (label: string) {
  await expect(field(this.page, label)).toBeDisabled()
})

Then('the field {string} is in {string}', async function (label: string, currency: string) {
  // The sign in front of an amount box: "$", "€" or "MDL".
  await expect(field(this.page, label).locator('xpath=..').locator('.money-input__sign')).toHaveText(currency)
})

// ---------- The menu ----------

Then('the menu says {string} has {string}', async function (label: string, count: string) {
  await expect(menuItem(this.page, label).getByLabel(count, { exact: true })).toBeVisible()
})

Then('the menu says {string} has no count', async function (label: string) {
  await expect(menuItem(this.page, label)).toBeVisible()
  await expect(menuItem(this.page, label).locator('.count')).toHaveCount(0)
})
