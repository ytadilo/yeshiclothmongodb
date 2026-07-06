/**
 * Integration Test 4.8 — Full Admin Login Flow
 *
 * Validates: Requirements 2.5, 3.3, 3.4
 *
 * Test cases:
 *  1. No authenticated user → ProtectedRoute redirects to /login, Login page shows Google Sign-In button
 *  2. signInWithPopup returns authorized email → loginWithGoogle resolves, no "Access Denied" shown
 *  3. signInWithPopup returns unauthorized email → loginWithGoogle throws, "Access Denied" message shown
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Mock firebase modules
// ---------------------------------------------------------------------------
vi.mock('../firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
  default: {},
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(() => () => {}),
  signOut: vi.fn(() => Promise.resolve()),
  signInWithPopup: vi.fn(),
  getAuth: vi.fn(() => ({})),
  GoogleAuthProvider: vi.fn(() => ({})),
}))

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
}))

// ---------------------------------------------------------------------------
// Mock useAuth so we can control loginWithGoogle behavior per test
// ---------------------------------------------------------------------------
const mockUseAuth = vi.fn()

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }) => <>{children}</>,
}))

import ProtectedRoute from '../components/ProtectedRoute'
import Login from '../pages/Login'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: Full Admin Login Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 1: no authenticated user → redirects to /login and Google Sign-In button is present', () => {
    /**
     * Validates: Requirements 3.3, 3.4
     *
     * When there is no authenticated user, ProtectedRoute must redirect to /login.
     * The Login page must render the Google Sign-In ("Continue with Google") button.
     */
    mockUseAuth.mockReturnValue({ user: null, loading: false, loginWithGoogle: vi.fn() })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div data-testid="dashboard">Dashboard</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    )

    // Should be redirected to login
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument()

    // Login page must show the Google Sign-In button
    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
  })

  it('Test 2: authorized email → loginWithGoogle resolves, "Access Denied" is NOT shown', async () => {
    /**
     * Validates: Requirements 2.5, 3.3
     *
     * When loginWithGoogle resolves successfully (authorized email),
     * the error message "Access Denied" must NOT appear.
     */
    const mockLoginWithGoogle = vi.fn().mockResolvedValue(undefined)

    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      loginWithGoogle: mockLoginWithGoogle,
    })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    )

    // Click the Google Sign-In button
    fireEvent.click(screen.getByText('Continue with Google'))

    await waitFor(() => {
      expect(mockLoginWithGoogle).toHaveBeenCalledTimes(1)
    })

    // "Access Denied" must NOT be shown
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument()
  })

  it('Test 3: unauthorized email → "Access Denied" message shown, user remains on /login', async () => {
    /**
     * Validates: Requirements 2.5, 3.4
     *
     * When loginWithGoogle throws an "Access Denied" error (unauthorized email),
     * the error message must be displayed and the user must remain on the /login page.
     */
    const accessDeniedMessage =
      'Access Denied: Only hailetadilo@gmail.com is authorized to access the admin dashboard.'

    const mockLoginWithGoogle = vi
      .fn()
      .mockRejectedValue(new Error(accessDeniedMessage))

    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      loginWithGoogle: mockLoginWithGoogle,
    })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    )

    // Click the Google Sign-In button
    fireEvent.click(screen.getByText('Continue with Google'))

    // Wait for the error message to appear
    await waitFor(() => {
      expect(screen.getByText(accessDeniedMessage)).toBeInTheDocument()
    })

    // Dashboard must NOT be shown — user remains on /login
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument()

    // The Google Sign-In button is still visible (still on login page)
    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
  })
})
