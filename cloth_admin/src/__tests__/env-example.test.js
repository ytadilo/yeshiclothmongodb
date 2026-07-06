/**
 * Unit Test 4.6 — cloth_admin/.env.example contains all required keys
 *
 * Validates: Requirements 2.7
 *
 * Reads cloth_admin/.env.example as text and asserts that every required
 * environment variable key is present. This ensures the file is kept in sync
 * with the application's actual configuration requirements, so developers and
 * CI pipelines know which variables must be set before running the admin app.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { resolve, dirname } from 'path'

// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Path: cloth_admin/src/__tests__/ → up 2 levels = cloth_admin/
const CLOTH_ADMIN_ROOT = resolve(__dirname, '../..')
const ENV_EXAMPLE_PATH = resolve(CLOTH_ADMIN_ROOT, '.env.example')

let envContent = null

try {
  envContent = readFileSync(ENV_EXAMPLE_PATH, 'utf-8')
} catch (_e) {
  // envContent stays null — tests will fail with a clear message
}

const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_API_URL',
]

describe('cloth_admin/.env.example required keys', () => {
  it('file exists and is readable', () => {
    /**
     * Validates: Requirements 2.7
     *
     * The .env.example file must exist at cloth_admin/.env.example.
     * Without it, new developers and CI pipelines have no reference for required vars.
     */
    expect(envContent).not.toBeNull()
    expect(typeof envContent).toBe('string')
    expect(envContent.length).toBeGreaterThan(0)
  })

  it.each(REQUIRED_KEYS)('contains key: %s', (key) => {
    /**
     * Validates: Requirements 2.7
     *
     * Each required key must appear in the file so that anyone copying
     * .env.example knows exactly which variables to configure.
     */
    expect(envContent).not.toBeNull()
    expect(envContent).toContain(key)
  })

  it('contains all seven required keys', () => {
    /**
     * Validates: Requirements 2.7
     *
     * Composite check — all seven keys must be present together.
     * A single missing key would break the Firebase or API configuration.
     */
    expect(envContent).not.toBeNull()
    for (const key of REQUIRED_KEYS) {
      expect(envContent, `Missing key: ${key}`).toContain(key)
    }
  })
})
