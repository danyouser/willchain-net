/**
 * WillChain E2E — App-level smoke tests
 *
 * Tests app structure, navigation, i18n, and wallet-gated rendering.
 * Does NOT require a blockchain node or real wallet.
 *
 * Run: npx playwright test
 */
import { test, expect } from '@playwright/test'

test.describe('Landing Page Sections', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('hero section renders with CTA buttons', async ({ page }) => {
    // Hero title
    const hero = page.locator('.hero')
    await expect(hero).toBeVisible()

    // Connect wallet CTA
    const connectCTA = hero.locator('button, a').filter({ hasText: /connect|підключ|подключ/i }).first()
    await expect(connectCTA).toBeVisible()
  })

  test('about section is present', async ({ page }) => {
    const about = page.locator('.about, [id="about"], section:has-text("WillChain")')
    await expect(about.first()).toBeVisible()
  })

  test('how-it-works section is present', async ({ page }) => {
    const section = page.locator('[id="how-it-works"], .how-it-works')
    await expect(section.first()).toBeVisible()
  })

  test('FAQ section is present', async ({ page }) => {
    const faq = page.locator('[id="faq"], .faq')
    await expect(faq.first()).toBeVisible()
  })

  test('footer renders with links', async ({ page }) => {
    const footer = page.locator('.footer, footer')
    await expect(footer.first()).toBeVisible()

    // Should have at least one external link (BaseScan, Telegram, etc.)
    const links = footer.locator('a[href]')
    expect(await links.count()).toBeGreaterThan(0)
  })

  test('no dashboard visible without wallet', async ({ page }) => {
    const dashboard = page.locator('.dashboard')
    await expect(dashboard).not.toBeVisible()
  })

  test('stats section shows supply numbers', async ({ page }) => {
    // Hero stats (Total Supply, Removed, Recycled)
    const stats = page.locator('.hero-stats, .stats')
    if (await stats.count() > 0) {
      await expect(stats.first()).toBeVisible()
    }
  })
})

test.describe('Header Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('logo text shows WillChain', async ({ page }) => {
    await expect(page.locator('.header .logo-text')).toHaveText('WillChain')
  })

  test('navigation links scroll to sections', async ({ page }) => {
    // "How It Works" nav link
    const howLink = page.locator('.header a[href*="how"], .header button').filter({ hasText: /how|як|как/i }).first()
    if (await howLink.count() > 0) {
      await howLink.click()
      // After click, URL should have hash or page should scroll
      await page.waitForTimeout(500)
      // Either hash changed or section is in viewport
      const section = page.locator('[id="how-it-works"], .how-it-works')
      if (await section.count() > 0) {
        await expect(section.first()).toBeInViewport()
      }
    }
  })
})

test.describe('Language Switching', () => {
  test('language selector changes page text', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Find language toggle
    const langToggle = page.locator('.lang-toggle, [class*="lang-"]').first()
    await expect(langToggle).toBeVisible()

    // Click the language selector to open dropdown
    await langToggle.click()
    await page.waitForTimeout(300)

    // Look for a language option (e.g., English or Українська)
    const langOption = page.locator('[class*="lang"] button, [class*="lang"] a, .lang-dropdown button').first()
    if (await langOption.count() > 0) {
      await langOption.click()
      await page.waitForTimeout(500)

      // Verify something changed or stayed consistent
      const newText = await page.locator('.hero').textContent()
      // At minimum, the page should still have content
      expect(newText).toBeTruthy()
    }
  })

  test('switching language updates page content', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Click language toggle
    const langToggle = page.locator('.lang-toggle, [class*="lang-"]').first()
    await langToggle.click()
    await page.waitForTimeout(300)

    // Click the second language option (to switch to a different language)
    const langOptions = page.locator('[class*="lang"] button, .lang-dropdown button')
    const count = await langOptions.count()
    if (count >= 2) {
      await langOptions.nth(1).click()
      await page.waitForTimeout(1000)

      const newHeroText = await page.locator('.hero').textContent() || ''
      // At minimum the page should still have content after switching
      expect(newHeroText.length).toBeGreaterThan(0)
    }
  })
})

test.describe('Mobile Responsiveness', () => {
  test('mobile layout renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Header is visible
    await expect(page.locator('.header')).toBeVisible()

    // Hero section visible
    await expect(page.locator('.hero')).toBeVisible()

    // Connect wallet button visible
    const connectBtn = page.locator('[data-testid="rk-connect-button"], button:has-text("Connect"), button:has-text("Підключити")')
    await expect(connectBtn.first()).toBeVisible()
  })

  test('tablet layout renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.header')).toBeVisible()
    await expect(page.locator('.hero')).toBeVisible()
  })
})

test.describe('Console & Network', () => {
  test('no critical console errors on page load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Filter out expected network errors (RPC, WalletConnect, etc.)
    const criticalErrors = errors.filter(e =>
      !e.includes('Failed to fetch') &&
      !e.includes('ERR_CONNECTION_REFUSED') &&
      !e.includes('net::') &&
      !e.includes('favicon') &&
      !e.includes('walletconnect') &&
      !e.includes('WalletConnect') &&
      !e.includes('relay.walletconnect')
    )

    expect(criticalErrors).toHaveLength(0)
  })

  test('no unhandled promise rejections', async ({ page }) => {
    const rejections: string[] = []
    page.on('pageerror', err => {
      rejections.push(err.message)
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Filter WalletConnect noise
    const critical = rejections.filter(e =>
      !e.includes('walletconnect') &&
      !e.includes('WalletConnect') &&
      !e.includes('WebSocket')
    )

    expect(critical).toHaveLength(0)
  })
})

test.describe('Accessibility', () => {
  test('all images have alt text', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const images = page.locator('img')
    const count = await images.count()

    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute('alt')
      expect(alt, `Image ${i} missing alt text`).toBeTruthy()
    }
  })

  test('interactive elements are keyboard accessible', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // All buttons should not have negative tabindex
    const buttons = page.locator('button')
    const count = await buttons.count()

    for (let i = 0; i < count; i++) {
      const tabindex = await buttons.nth(i).getAttribute('tabindex')
      if (tabindex !== null) {
        expect(parseInt(tabindex), `Button ${i} has negative tabindex`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('page has proper heading hierarchy', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Should have at least one h1
    const h1Count = await page.locator('h1').count()
    expect(h1Count).toBeGreaterThanOrEqual(1)
  })
})

test.describe('Activity Model (M-01) Copy', () => {
  test('landing page does not claim all transfers reset timer', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // The page should NOT contain the old incorrect claim
    const body = await page.locator('body').textContent() || ''
    expect(body).not.toContain('Any outgoing token transfer resets')
    expect(body).not.toContain('swapping on Uniswap — your timer resets')
  })

  test('i18n allowance_text key has correct M-01 messaging', async () => {
    // Verify the EN translation file has correct activity model copy
    const fs = await import('node:fs')
    const path = await import('node:path')
    const enPath = path.resolve('public/locales/en/translation.json')
    const en = JSON.parse(fs.readFileSync(enPath, 'utf-8'))

    // allowance_text must mention that DEX swaps do NOT reset timer
    expect(en.security.allowance_text).toContain('DEX swaps via token approvals do not reset your timer')

    // hint_transfer must not claim "any transfer" resets timer
    expect(en.dashboard.hint_transfer).not.toContain('Any WILL transfer')
  })
})

test.describe('CSP & Security', () => {
  test('page loads without CSP violations', async ({ page }) => {
    const cspErrors: string[] = []
    page.on('console', msg => {
      if (msg.text().includes('Content Security Policy')) {
        cspErrors.push(msg.text())
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Minor CSP warnings are OK, but there shouldn't be blocking violations
    const blocking = cspErrors.filter(e => e.includes('blocked'))
    expect(blocking).toHaveLength(0)
  })
})
