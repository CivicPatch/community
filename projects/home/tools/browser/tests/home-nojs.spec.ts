// The homepage must work with zero JavaScript: the feed (prerendered from
// feeds.json via lit-ssr), onboarding, and links are real HTML. JavaScript is an
// optional enhancement that upgrades absolute dates to friendly relative times.

import { test, expect } from '@playwright/test'

const DATE = /^\d{4}-\d{2}-\d{2}$/

test.describe('homepage with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false })

  test('feed, onboarding, and links render as static HTML', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Feeds', { exact: true })).toBeVisible()
    // feed entries are prerendered into the DOM (inside collapsed <details>, so they
    // exist but aren't "visible" — assert their presence by count)
    expect(await page.locator('.entry-title').count()).toBeGreaterThan(100)
    await expect(page.getByRole('heading', { name: 'Onboarding' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Member Directory' })).toBeVisible()
  })

  test('times stay absolute dates (the no-JS fallback)', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('time[data-relative]').first()).toHaveText(DATE)
  })
})

test.describe('homepage with JavaScript enabled', () => {
  test('times are progressively enhanced to friendly relative format', async ({ page }) => {
    await page.goto('/')
    // same element that showed an absolute date with no JS is now relative
    await expect(page.locator('time[data-relative]').first()).not.toHaveText(DATE)
  })
})
