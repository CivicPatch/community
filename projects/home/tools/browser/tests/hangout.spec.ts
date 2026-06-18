// The hangout is a JS app (WebRTC + real-time). This guards the bug that started the
// whole browser harness: the grid collapsing to zero-size cells on a mobile (iOS
// Safari) viewport. We join, then assert the grid and its cells render at a real size.
// Playwright pierces the open shadow DOM, so plain CSS locators reach inside <chat-room>.

import { test, expect, devices } from '@playwright/test'

test.use({ ...devices['iPhone 13'] })

test('grid renders with sized cells at a mobile viewport after joining', async ({ page }) => {
  await page.goto('/hangout/')

  // pre-join gate
  await page.locator('#cr-join-name').fill('Test')
  await page.locator('.cr-avatar-opt').first().click()
  await page.locator('.cr-btn-primary').click()

  // the grid renders, with a non-trivial number of cells at a tappable size
  await expect(page.locator('.cr-grid')).toBeVisible()
  const cells = page.locator('.cr-cell')
  expect(await cells.count()).toBeGreaterThan(0)

  const box = await cells.first().boundingBox()
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(20) // not collapsed to ~0
})
