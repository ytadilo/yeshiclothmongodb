/**
 * Preservation Test 3 — Unit test: ProtectedRoute behavior
 *
 * Property 2: Preservation — Existing Admin Pages and Customer Frontend Unaffected
 * Validates: Requirements 3.8
 *
 * These tests MUST PASS on unfixed code — they establish the preservation
 * baseline that must not be broken by the fix.
 *
 * Test cases:
 *  1. ProtectedRoute redirects to /login when useAuth() returns { user: null, loading: false }
 *  2. ProtectedRoute renders children when useAuth() returns { user: { email: 'hailetadilo@gmail.com' }, loading: false }
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Mock firebase modules — ProtectedRoute uses useAuth which imports firebase
// ---------------------------------------------------------------------------
vi.mock('../firebase', () => ({
  auth: {},
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
const mockUseAuth = vi.fn()

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }) => <>{children}</>,
}))

import ProtectedRoute from '../components/ProtectedRoute'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Preservation: ProtectedRoute behavior', () => {
  it('redirects to /login when user is null and not loading', () => {
    /**
     * Validates: Requirements 3.8
     *
     * When useAuth() returns { user: null, loading: false }, ProtectedRoute
     * must redirect the browser to /login. The children must NOT be rendered.
     */
    mockUseAuth.mockReturnValue({ user: null, loading: false })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div data-testid="protected-content">Admin Content</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/login"
            element={<div data-testid="login-page">Login Page</div>}
          />
        </Routes>
      </MemoryRouter>
    )

    // Should be on the login page
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
    // Protected content must NOT be rendered
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('renders children when user is authenticated and not loading', () => {
    /**
     * Validates: Requirements 3.8
     *
     * When useAuth() returns { user: { email: 'hailetadilo@gmail.com' }, loading: false },
     * ProtectedRoute must render its children without redirecting.
     */
    mockUseAuth.mockReturnValue({
      user: { email: 'hailetadilo@gmail.com', displayName: 'Haile' },
      loading: false,
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div data-testid="protected-content">Admin Content</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/login"
            element={<div data-testid="login-page">Login Page</div>}
          />
        </Routes>
      </MemoryRouter>
    )

    // Children must be rendered
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(screen.getByText('Admin Content')).toBeInTheDocument()
    // Must NOT redirect to login
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
  })

  it('renders loading state when loading is true', () => {
    /**
     * Validates: Requirements 3.8
     *
     * When loading is true (auth state is still being determined),
     * ProtectedRoute renders a loading indicator — neither children
     * nor the login redirect should be shown.
     */
    mockUseAuth.mockReturnValue({ user: null, loading: true })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div data-testid="protected-content">Admin Content</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/login"
            element={<div data-testid="login-page">Login Page</div>}
          />
        </Routes>
      </MemoryRouter>
    )

    // Neither children nor login page — just the loading indicator
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
    // The loading text from ProtectedRoute
    expect(screen.getByText('Verifying Credentials...')).toBeInTheDocument()
  })
})
