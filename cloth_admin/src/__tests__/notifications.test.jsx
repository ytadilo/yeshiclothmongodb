/**
 * Unit Test 4.2 — Notifications.jsx renders without crashing
 *
 * Validates: Requirements 2.4
 *
 * Test cases:
 *  1. useNotifications returns empty list → page heading "Notifications" is present in the DOM
 *  2. useNotifications returns 2 notifications (1 read, 1 unread) → unread badge shows "1"
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock firebase modules — Notifications imports useNotifications which uses firebase
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
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock useNotifications so we control what the hook returns
// ---------------------------------------------------------------------------
const mockUseNotifications = vi.fn()

vi.mock('../hooks/useNotifications', () => ({
  useNotifications: (...args) => mockUseNotifications(...args),
}))

import Notifications from '../pages/Notifications'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Unit: Notifications.jsx renders without crashing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page heading "Notifications" when hook returns empty list', () => {
    /**
     * Validates: Requirements 2.4
     *
     * When useNotifications returns an empty list with unreadCount 0,
     * the Notifications page must mount and display the "Notifications" heading.
     */
    mockUseNotifications.mockReturnValue({
      notifications: [],
      unreadCount: 0,
      loading: false,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    })

    render(<Notifications adminMongoId="admin-123" />)

    expect(screen.getByRole('heading', { name: /notifications/i })).toBeInTheDocument()
  })

  it('shows unread count of 1 when hook returns 2 notifications (1 read, 1 unread)', () => {
    /**
     * Validates: Requirements 2.4
     *
     * When useNotifications returns 2 notifications where 1 is unread,
     * unreadCount is 1 and the page must reflect that in the subheading text.
     */
    mockUseNotifications.mockReturnValue({
      notifications: [
        {
          id: 'notif-1',
          title: 'Order placed',
          body: 'A new order was placed.',
          timestamp: null,
          is_read: false,
        },
        {
          id: 'notif-2',
          title: 'Payment received',
          body: 'Payment confirmed.',
          timestamp: null,
          is_read: true,
        },
      ],
      unreadCount: 1,
      loading: false,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    })

    render(<Notifications adminMongoId="admin-123" />)

    // The heading must still be present
    expect(screen.getByRole('heading', { name: /notifications/i })).toBeInTheDocument()

    // unreadCount=1 renders the text "1 unread notification"
    expect(screen.getByText(/1 unread notification/i)).toBeInTheDocument()
  })
})
