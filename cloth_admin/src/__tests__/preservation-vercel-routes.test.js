/**
 * Preservation Test 4 — Unit test: vercel.json customer routes preserved
 *
 * Property 2: Preservation — Existing Admin Pages and Customer Frontend Unaffected
 * Validates: Requirements 3.6
 *
 * These tests MUST PASS on unfixed code — they establish the preservation
 * baseline that must not be broken by the fix.
 *
 * Reads cloth_frontend/frontend/vercel.json and asserts that the three critical
 * customer-serving routes are still present:
 *  1. /api/:path*  — customer API proxy
 *  2. /auth/login  — customer auth login route
 *  3. /my-orders   — customer orders route
 *
 * These rewrites must survive the fix (task 3.8 removes admin-only entries
 * but must leave all customer entries byte-identical).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { resolve, dirname } from 'path'

// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Path: cloth_admin/src/__tests__/ → up 3 levels = myclothefullstack (workspace root)
const WORKSPACE_ROOT = resolve(__dirname, '../../..')
const VERCEL_JSON_PATH = resolve(
  WORKSPACE_ROOT,
  'cloth_frontend',
  'frontend',
  'vercel.json'
)

let config = null

try {
  const raw = readFileSync(VERCEL_JSON_PATH, 'utf-8')
  config = JSON.parse(raw)
} catch (_e) {
  // config stays null — tests will fail with clear "expected null not to be null"
}

describe('Preservation: cloth_frontend/frontend/vercel.json customer routes', () => {
  it('vercel.json file exists and is valid JSON', () => {
    /**
     * Validates: Requirements 3.6
     *
     * The customer frontend vercel.json must exist and be parseable.
     * If this file is missing or invalid, no customer routes work.
     */
    expect(config).not.toBeNull()
    expect(typeof config).toBe('object')
  })

  it('contains /api/:path* rewrite — customer API proxy is preserved', () => {
    /**
     * Validates: Requirements 3.6
     *
     * The /api/:path* rewrite proxies all customer API calls to the backend.
     * This must not be removed when admin entries are cleaned up.
     */
    expect(config).not.toBeNull()
    const rewrites = config.rewrites ?? []
    const apiRewrite = rewrites.find(r => r.source === '/api/:path*')
    expect(apiRewrite).toBeDefined()
    expect(apiRewrite.destination).toContain('myclothefullstackhaile.onrender.com')
  })

  it('contains /auth/login rewrite — customer auth route is preserved', () => {
    /**
     * Validates: Requirements 3.6
     *
     * The /auth/login rewrite serves the customer login page.
     * This must be present after the fix removes only admin routing entries.
     */
    expect(config).not.toBeNull()
    const rewrites = config.rewrites ?? []
    const authLoginRewrite = rewrites.find(r => r.source === '/auth/login')
    expect(authLoginRewrite).toBeDefined()
  })

  it('contains /my-orders rewrite — customer orders route is preserved', () => {
    /**
     * Validates: Requirements 3.6
     *
     * The /my-orders rewrite serves the customer orders page.
     * This must be present after the fix removes only admin routing entries.
     */
    expect(config).not.toBeNull()
    const rewrites = config.rewrites ?? []
    const myOrdersRewrite = rewrites.find(r => r.source === '/my-orders')
    expect(myOrdersRewrite).toBeDefined()
  })

  it('contains /cart rewrite — core customer shopping route is preserved', () => {
    /**
     * Validates: Requirements 3.6
     *
     * Additional customer route check — the cart page rewrite must remain.
     */
    expect(config).not.toBeNull()
    const rewrites = config.rewrites ?? []
    const cartRewrite = rewrites.find(r => r.source === '/cart')
    expect(cartRewrite).toBeDefined()
  })

  it('contains /profile rewrite — customer profile route is preserved', () => {
    /**
     * Validates: Requirements 3.6
     */
    expect(config).not.toBeNull()
    const rewrites = config.rewrites ?? []
    const profileRewrite = rewrites.find(r => r.source === '/profile')
    expect(profileRewrite).toBeDefined()
  })

  it('rewrites array has more than 10 entries — not accidentally truncated', () => {
    /**
     * Validates: Requirements 3.6
     *
     * The vercel.json has many customer rewrites. After the fix removes
     * the 1 admin rewrite (/admin/:path*), there should still be well over
     * 10 rewrites remaining. This guards against accidentally wiping the file.
     */
    expect(config).not.toBeNull()
    const rewrites = config.rewrites ?? []
    expect(rewrites.length).toBeGreaterThan(10)
  })
})
