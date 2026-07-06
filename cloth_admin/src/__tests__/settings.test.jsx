/**
 * Unit Test 4.3 — Settings.jsx renders without crashing
 *
 * Validates: Requirements 2.4
 *
 * Test cases:
 *  1. api.get('/api/settings/social') and api.get('/api/settings/content') both
 *     return {} (empty objects) → both form sections "Social Links" and
 *     "Site Content" are present in the DOM, and both save buttons render.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock firebase modules — Settings imports api/axios which imports firebase
// ---------------------------------------------------------------------------
vi.mock('../firebase', () => ({
  auth: { currentUser: null },
  googleProvider: {},
  db: {},
  default: {},
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(() => () => {}),
  signOut: vi.fn(),
  getAuth: vi.fn(() => ({})),
  GoogleAuthProvider: vi.fn(() => ({})),
}))

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
}))

// ---------------------------------------------------------------------------
// Mock the api axios instance so we control what api.get returns
// ---------------------------------------------------------------------------
const mockApiGet = vi.fn()

vi.mock('../api/axios', () => ({
  default: {
    get: (...args) => mockApiGet(...args),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

import Settings from '../pages/Settings'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Unit: Settings.jsx renders without crashing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders both form sections and save buttons when api returns empty objects', async () => {
    /**
     * Validates: Requirements 2.4
     *
     * When both settings endpoints return empty objects, Settings must mount
     * and render the "Social Links" and "Site Content" sections along with
     * their respective save buttons.
     */
    mockApiGet.mockImplementation((url) => {
      if (url === '/api/settings/social') return Promise.resolve({ data: {} })
      if (url === '/api/settings/content') return Promise.resolve({ data: {} })
      return Promise.resolve({ data: {} })
    })

    // Settings.jsx doesn't use navigation, so no MemoryRouter needed
    render(<Settings />)

    // Wait for the loading spinner to disappear and both sections to render
    await waitFor(() => {
      expect(screen.getByText('Social Links')).toBeInTheDocument()
    })

    // Both form section headings must be present
    expect(screen.getByText('Social Links')).toBeInTheDocument()
    expect(screen.getByText('Site Content')).toBeInTheDocument()

    // Both save buttons must be rendered
    expect(screen.getByRole('button', { name: /save social links/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save site content/i })).toBeInTheDocument()

    // Verify both API endpoints were called on mount
    expect(mockApiGet).toHaveBeenCalledWith('/api/settings/social')
    expect(mockApiGet).toHaveBeenCalledWith('/api/settings/content')
  })
})
