/**
 * Unit Test 4.5 — cloth_admin/vercel.json structure is correct
 *
 * Validates: Requirements 2.7
 *
 * Reads cloth_admin/vercel.json and asserts that the rewrites array contains
 * exactly one entry — the SPA catch-all rule that enables React Router
 * client-side routing on hard refresh and direct URL access in Vercel.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { resolve, dirname } from 'path'

// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Path: cloth_admin/src/__tests__/ → up 3 levels = myclothefullstack (workspace root)
const WORKSPACE_ROOT = resolve(__dirname, '../../..')
const VERCEL_JSON_PATH = resolve(WORKSPACE_ROOT, 'cloth_admin', 'vercel.json')

let config = null

try {
  const raw = readFileSync(VERCEL_JSON_PATH, 'utf-8')
  config = JSON.parse(raw)
} catch (_e) {
  // config stays null — tests will fail with a clear message
}

describe('cloth_admin/vercel.json structure', () => {
  it('file exists and is valid JSON', () => {
    /**
     * Validates: Requirements 2.7
     *
     * The vercel.json must exist at cloth_admin/vercel.json and be parseable.
     * Without this file Vercel returns 404 for all non-root paths after a hard refresh.
     */
    expect(config).not.toBeNull()
    expect(typeof config).toBe('object')
  })

  it('rewrites array contains exactly one entry', () => {
    /**
     * Validates: Requirements 2.7
     *
     * The file should have a single catch-all rewrite rule and nothing else.
     * Extra entries could accidentally proxy or redirect admin traffic.
     */
    expect(config).not.toBeNull()
    expect(Array.isArray(config.rewrites)).toBe(true)
    expect(config.rewrites).toHaveLength(1)
  })

  it('rewrite source is "/(.*)"', () => {
    /**
     * Validates: Requirements 2.7
     *
     * The source pattern must be /(.*) to catch every path including nested routes.
     */
    expect(config).not.toBeNull()
    expect(config.rewrites[0].source).toBe('/(.*)')
  })

  it('rewrite destination is "/index.html"', () => {
    /**
     * Validates: Requirements 2.7
     *
     * All paths must resolve to index.html so React Router handles routing client-side.
     */
    expect(config).not.toBeNull()
    expect(config.rewrites[0].destination).toBe('/index.html')
  })

  it('rewrites entry matches exactly { source: "/(.*)", destination: "/index.html" }', () => {
    /**
     * Validates: Requirements 2.7
     *
     * Full structural check — the single entry must be exactly the SPA catch-all rule
     * with no extra fields.
     */
    expect(config).not.toBeNull()
    expect(config.rewrites[0]).toEqual({
      source: '/(.*)',
      destination: '/index.html',
    })
  })
})
