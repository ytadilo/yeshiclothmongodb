/**
 * Integration Test — Task 4.7
 * Sidebar navigation through all pages without error boundaries
 *
 * Tests all 11 admin pages (Dashboard, Orders, Products, Categories, Customers,
 * Payments, Analytics, Inventory, Notifications, Settings, Profile) render
 * without triggering a React error boundary.
 *
 * **Validates: Requirements 2.4, 3.2**
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Mock firebase modules BEFORE any module-under-test imports them
// ---------------------------------------------------------------------------
vi.mock('../firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
  default: {},
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(() => () => {}),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  getAuth: vi.fn(() => ({})),
  GoogleAuthProvider: vi.fn(() => ({})),
}))

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}))

// Mock chart.js to avoid canvas errors in jsdom
vi.mock('react-chartjs-2', () => ({
  Line: () => <canvas data-testid="chart-line" />,
  Bar: () => <canvas data-testid="chart-bar" />,
  Doughnut: () => <canvas data-testid="chart-doughnut" />,
}))

// ---------------------------------------------------------------------------
// Mock the api module
// ---------------------------------------------------------------------------
const mockApiGet = vi.fn()
const mockApiPut = vi.fn()
const mockApiDelete = vi.fn()
vi.mock('../api/axios', () => ({
  default: {
    get: (...args) => mockApiGet(...args),
    put: (...args) => mockApiPut(...args),
    delete: (...args) => mockApiDelete(...args),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

// ---------------------------------------------------------------------------
// Mock useAuth so AuthContext is available
// ---------------------------------------------------------------------------
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { 
      email: 'hailetadilo@gmail.com', 
      displayName: 'Haile', 
      photoURL: null 
    },
    loading: false,
    error: null,
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }) => <>{children}</>,
}))

// ---------------------------------------------------------------------------
// Mock useNotifications hook
// ---------------------------------------------------------------------------
vi.mock('../hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    loading: false,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Import all page components
// ---------------------------------------------------------------------------
import Dashboard from '../pages/Dashboard'
import Orders from '../pages/Orders'
import Products from '../pages/Products'
import Categories from '../pages/Categories'
import Customers from '../pages/Customers'
import Payments from '../pages/Payments'
import Analytics from '../pages/Analytics'
import Inventory from '../pages/Inventory'
import Notifications from '../pages/Notifications'
import Settings from '../pages/Settings'
import Profile from '../pages/Profile'

// ---------------------------------------------------------------------------
// Error boundary — captures React errors so they don't escape the test runner
// ---------------------------------------------------------------------------
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return <div data-testid="error-boundary">Error caught: {this.state.error.message}</div>
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// Helper to render a page component wrapped in all required context
// ---------------------------------------------------------------------------
const renderPage = (PageComponent, props = {}) => {
  return render(
    <ErrorBoundary>
      <MemoryRouter>
        <PageComponent {...props} />
      </MemoryRouter>
    </ErrorBoundary>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: Sidebar navigation through all pages without error boundaries', () => {
  let originalConsoleError

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock all API endpoints to return empty/default data
    mockApiGet.mockImplementation((url) => {
      if (url === '/api/orders') return Promise.resolve({ data: [] })
      if (url === '/api/posts') return Promise.resolve({ data: [] })
      if (url === '/api/admin/users') return Promise.resolve({ data: { users: [], total: 0 } })
      if (url.includes('/api/admin/users?limit=')) return Promise.resolve({ data: { users: [], total: 0 } })
      if (url === '/api/settings/social') return Promise.resolve({ data: { social: {} } })
      if (url === '/api/settings/content') return Promise.resolve({ data: { content: {} } })
      if (url === '/api/auth/me') return Promise.resolve({ data: { user: { id: 'admin123', email: 'hailetadilo@gmail.com' } } })
      return Promise.resolve({ data: {} })
    })

    mockApiPut.mockResolvedValue({ data: { success: true } })
    mockApiDelete.mockResolvedValue({ data: { success: true } })

    // Suppress React's error boundary console noise for expected errors
    originalConsoleError = console.error
    console.error = (...args) => {
      const msg = args[0]?.toString?.() ?? ''
      if (
        msg.includes('The above error occurred') ||
        msg.includes('ErrorBoundary') ||
        msg.includes('React will try to recreate')
      ) return
      originalConsoleError(...args)
    }
  })

  afterEach(() => {
    console.error = originalConsoleError
  })

  it('Dashboard page renders without error boundary', async () => {
    const { queryByTestId } = renderPage(Dashboard)
    
    await waitFor(() => {
      expect(queryByTestId('error-boundary')).not.toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('Orders page renders without error boundary', async () => {
    const { queryByTestId } = renderPage(Orders)
    
    await waitFor(() => {
      expect(queryByTestId('error-boundary')).not.toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('Products page renders without error boundary', async () => {
    const { queryByTestId } = renderPage(Products)
    
    await waitFor(() => {
      expect(queryByTestId('error-boundary')).not.toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('Categories page renders without error boundary', async () => {
    const { queryByTestId } = renderPage(Categories)
    
    await waitFor(() => {
      expect(queryByTestId('error-boundary')).not.toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('Customers page renders without error boundary', async () => {
    const { queryByTestId } = renderPage(Customers)
    
    await waitFor(() => {
      expect(queryByTestId('error-boundary')).not.toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('Payments page renders without error boundary', async () => {
    const { queryByTestId } = renderPage(Payments)
    
    await waitFor(() => {
      expect(queryByTestId('error-boundary')).not.toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('Analytics page renders without error boundary', async () => {
    const { queryByTestId } = renderPage(Analytics)
    
    await waitFor(() => {
      expect(queryByTestId('error-boundary')).not.toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('Inventory page renders without error boundary', async () => {
    const { queryByTestId } = renderPage(Inventory)
    
    await waitFor(() => {
      expect(queryByTestId('error-boundary')).not.toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('Notifications page renders without error boundary', async () => {
    // Notifications needs adminMongoId prop
    const { queryByTestId } = renderPage(Notifications, { adminMongoId: 'admin123' })
    
    await waitFor(() => {
      expect(queryByTestId('error-boundary')).not.toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('Settings page renders without error boundary', async () => {
    const { queryByTestId } = renderPage(Settings)
    
    await waitFor(() => {
      expect(queryByTestId('error-boundary')).not.toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('Profile page renders without error boundary', async () => {
    const { queryByTestId } = renderPage(Profile)
    
    await waitFor(() => {
      expect(queryByTestId('error-boundary')).not.toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('All pages render sequentially without error boundaries (comprehensive)', async () => {
    /**
     * **Validates: Requirements 2.4, 3.2**
     * 
     * This test renders all 11 admin pages in sequence and asserts that
     * none of them trigger a React error boundary. This simulates the user
     * navigating through the sidebar links one by one.
     */
    const pages = [
      { Component: Dashboard, name: 'Dashboard', props: {} },
      { Component: Orders, name: 'Orders', props: {} },
      { Component: Products, name: 'Products', props: {} },
      { Component: Categories, name: 'Categories', props: {} },
      { Component: Customers, name: 'Customers', props: {} },
      { Component: Payments, name: 'Payments', props: {} },
      { Component: Analytics, name: 'Analytics', props: {} },
      { Component: Inventory, name: 'Inventory', props: {} },
      { Component: Notifications, name: 'Notifications', props: { adminMongoId: 'admin123' } },
      { Component: Settings, name: 'Settings', props: {} },
      { Component: Profile, name: 'Profile', props: {} },
    ]

    for (const page of pages) {
      const { queryByTestId, unmount } = renderPage(page.Component, page.props)
      
      await waitFor(() => {
        expect(queryByTestId('error-boundary')).not.toBeInTheDocument()
      }, { timeout: 2000 })

      // Clean up before rendering next page
      unmount()
    }
  })
})
