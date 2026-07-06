/**
 * Unit Test 4.1 — Inventory.jsx renders without crashing
 *
 * Validates: Requirements 2.4
 *
 * Test cases:
 *  1. api.get('/api/posts') returns [] → page header "Inventory" is present in the DOM
 *  2. api.get('/api/posts') returns one product → table row for "Test Shirt" is rendered
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Mock firebase modules — Inventory imports api/axios which imports firebase
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
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

// ---------------------------------------------------------------------------
// Mock useAuth to return a signed-in user
// ---------------------------------------------------------------------------
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'hailetadilo@gmail.com', displayName: 'Haile' },
    loading: false,
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }) => <>{children}</>,
}))

import Inventory from '../pages/Inventory'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Unit: Inventory.jsx renders without crashing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page header "Inventory" when api returns empty array', async () => {
    /**
     * Validates: Requirements 2.4
     *
     * When the API returns an empty product list, the Inventory page must
     * still mount and display the "Inventory" heading.
     */
    mockApiGet.mockResolvedValueOnce({ data: [] })

    render(
      <MemoryRouter>
        <Inventory />
      </MemoryRouter>
    )

    // Wait for the loading spinner to disappear and content to render
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /inventory/i })).toBeInTheDocument()
    })

    // Should have called the products endpoint
    expect(mockApiGet).toHaveBeenCalledWith('/api/posts')
  })

  it('renders table row for "Test Shirt" when api returns one product', async () => {
    /**
     * Validates: Requirements 2.4
     *
     * When the API returns a single product, the Inventory table must render
     * a row containing the product title.
     */
    mockApiGet.mockResolvedValueOnce({
      data: [{ _id: '1', title: 'Test Shirt', category: 'Shirt', post_price_etb: 100 }],
    })

    render(
      <MemoryRouter>
        <Inventory />
      </MemoryRouter>
    )

    // Wait for the product row to appear
    await waitFor(() => {
      expect(screen.getByText('Test Shirt')).toBeInTheDocument()
    })

    // Should also have called the products endpoint
    expect(mockApiGet).toHaveBeenCalledWith('/api/posts')
  })
})
