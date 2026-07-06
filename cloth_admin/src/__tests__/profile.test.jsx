/**
 * Unit Test 4.4 — Profile.jsx renders without crashing
 *
 * Validates: Requirements 2.4, 2.5
 *
 * Test cases:
 *  1. useAuth() returns user with email 'hailetadilo@gmail.com' → email and "Logout" button are present
 *  2. Click "Logout" button → logout mock was called once
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Mock firebase modules — Profile imports useAuth which imports firebase
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
// Mock useAuth so we can control what it returns per test
// ---------------------------------------------------------------------------
const mockLogout = vi.fn()

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'hailetadilo@gmail.com', displayName: 'Haile', photoURL: null },
    logout: mockLogout,
  }),
  AuthProvider: ({ children }) => <>{children}</>,
}))

import Profile from '../pages/Profile'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Unit: Profile.jsx renders without crashing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders email and Logout button for authenticated user', () => {
    /**
     * Validates: Requirements 2.4, 2.5
     *
     * When useAuth() returns a user with email 'hailetadilo@gmail.com',
     * the Profile page must render the email address and the "Logout" button.
     */
    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>
    )

    // The user's email must appear in the rendered output (appears twice: avatar area + field section)
    const emailElements = screen.getAllByText('hailetadilo@gmail.com')
    expect(emailElements.length).toBeGreaterThanOrEqual(1)

    // The Logout button must be present
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument()
  })

  it('calls logout once when the Logout button is clicked', () => {
    /**
     * Validates: Requirements 2.5
     *
     * When the user clicks the "Logout" button, the logout function
     * returned by useAuth() must be called exactly once.
     */
    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>
    )

    const logoutButton = screen.getByRole('button', { name: /logout/i })
    fireEvent.click(logoutButton)

    expect(mockLogout).toHaveBeenCalledTimes(1)
  })
})
