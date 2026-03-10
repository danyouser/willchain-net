/**
 * WillChain E2E — Smoke Tests
 *
 * Tests that the app loads, renders correctly, and core UI elements are present.
 * Does NOT require a local blockchain node.
 *
 * Run: npx playwright test e2e/happy-path.spec.ts
 */
import { test, expect } from '@playwright/test'

test.describe('WillChain Smoke Tests', () => {
  test('homepage loads with header and logo', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.header')).toBeVisible()
    await expect(page.locator('.header .logo-text')).toHaveText('WillChain')
  })

  test('connect wallet button is visible', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const connectBtn = page.locator('[data-testid="rk-connect-button"], button:has-text("Connect Wallet"), button:has-text("Connect")')
    await expect(connectBtn.first()).toBeVisible()
  })

  test('language switcher is present', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const langBtn = page.locator('.lang-toggle, [class*="lang"]').first()
    await expect(langBtn).toBeVisible()
  })

  test('hero section is visible', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const hero = page.locator('.hero, [class*="hero"], main').first()
    await expect(hero).toBeVisible()
  })

  test('no critical console errors on page load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Filter out network-related errors (RPC, etc.)
    const criticalErrors = errors.filter(e =>
      !e.includes('Failed to fetch') &&
      !e.includes('ERR_CONNECTION_REFUSED') &&
      !e.includes('net::') &&
      !e.includes('favicon')
    )

    expect(criticalErrors).toHaveLength(0)
  })

  test('responsive: mobile viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.header')).toBeVisible()
    const connectBtn = page.locator('[data-testid="rk-connect-button"], button:has-text("Connect")')
    await expect(connectBtn.first()).toBeVisible()
  })

  test('accessibility: all images have alt text', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const images = page.locator('img')
    const count = await images.count()

    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute('alt')
      expect(alt, `Image ${i} missing alt text`).toBeTruthy()
    }
  })
})
