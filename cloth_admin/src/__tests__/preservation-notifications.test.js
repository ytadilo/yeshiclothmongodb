/**
 * Preservation Test 2 — PBT: useNotifications hook returns correct shape
 * for arbitrary Firestore snapshots
 *
 * Property 2: Preservation — Existing Admin Pages and Customer Frontend Unaffected
 * Validates: Requirements 3.2, 3.8
 *
 * These tests MUST PASS on unfixed code — they establish the preservation
 * baseline that must not be broken by the fix.
 *
 * We generate arbitrary Firestore notification snapshot shapes:
 *   - arbitrary is_read boolean
 *   - any timestamp value (Firestore Timestamp-like, number, null, undefined)
 *   - optional title / body fields
 * Mock Firestore onSnapshot to emit these arbitrary snapshots.
 * Assert useNotifications returns { notifications: Array, unreadCount: number }
 * Assert unreadCount === count of items where is_read === false
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import * as fc from 'fast-check'

// ---------------------------------------------------------------------------
// Firestore snapshot callback registry — must be set up BEFORE module load
// ---------------------------------------------------------------------------
let _snapshotCallback = null

vi.mock('../firebase', () => ({
  auth: {},
  googleProvider: {},
  db: { _isMockFirestore: true },
  default: {},
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(() => () => {}),
  signOut: vi.fn(),
  getAuth: vi.fn(() => ({})),
}))

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn((db, name) => ({ _collection: name })),
  query: vi.fn((...args) => ({ _query: args })),
  where: vi.fn((...args) => ({ _where: args })),
  orderBy: vi.fn((...args) => ({ _orderBy: args })),
  limit: vi.fn((n) => ({ _limit: n })),
  onSnapshot: vi.fn((q, successCb, errorCb) => {
    // Store the callback so tests can drive it
    _snapshotCallback = successCb
    // Return an unsubscribe function
    return () => { _snapshotCallback = null }
  }),
  doc: vi.fn((db, col, id) => ({ id })),
  updateDoc: vi.fn(() => Promise.resolve()),
}))

vi.mock('../api/axios', () => ({
  default: {
    get: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

import { useNotifications } from '../hooks/useNotifications'

// ---------------------------------------------------------------------------
// Helper — build a fake Firestore snapshot from a list of notification docs
// ---------------------------------------------------------------------------
function buildSnapshot(docs) {
  return {
    forEach(cb) {
      docs.forEach(({ id, data }) => {
        cb({ id, data: () => data })
      })
    },
  }
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Optional string field */
const optStr = fc.option(fc.string({ maxLength: 80 }), { nil: undefined })

/** Generates a single notification document */
const notificationDocArb = fc.record({
  id: fc.string({ minLength: 8, maxLength: 20 }),
  data: fc.record(
    {
      is_read: fc.boolean(),
      // timestamp can be a Firestore-like object, a number, a string, null, or undefined
      timestamp: fc.oneof(
        fc.constant(null),
        fc.constant(undefined),
        fc.integer({ min: 0, max: 2000000000 }),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }).map(d => d.toISOString()),
        // Firestore Timestamp-like object with .toDate()
        fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }).map(d => ({
          toDate: () => d,
          seconds: Math.floor(d.getTime() / 1000),
        }))
      ),
      title: optStr,
      body: optStr,
      message: optStr,
      user_id: fc.string({ minLength: 8, maxLength: 20 }),
    },
    { requiredKeys: ['is_read', 'user_id'] }
  ),
})

/** Array of 0–30 notification documents */
const notificationDocsArb = fc.array(notificationDocArb, { minLength: 0, maxLength: 30 })

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Preservation: useNotifications returns correct shape for arbitrary Firestore snapshots', () => {
  const TEST_ADMIN_ID = 'admin-mongo-id-123'

  beforeEach(() => {
    vi.clearAllMocks()
    _snapshotCallback = null
  })

  it('PBT — always returns { notifications: Array, unreadCount: number } and unreadCount equals count of is_read===false items', () => {
    /**
     * **Validates: Requirements 3.2, 3.8**
     *
     * For any arbitrary Firestore snapshot shape, useNotifications must:
     *  1. Return an object with notifications (Array) and unreadCount (number)
     *  2. unreadCount must equal the exact count of documents where is_read === false
     *
     * This validates the preservation property: the hook's core logic is
     * correct across all possible Firestore data shapes, ensuring it will
     * not regress after the fix is applied.
     */
    fc.assert(
      fc.property(notificationDocsArb, (docs) => {
        // Reset snapshot callback for each run
        _snapshotCallback = null

        const { result, unmount } = renderHook(
          () => useNotifications(TEST_ADMIN_ID)
        )

        // Drive the onSnapshot callback with our generated docs
        act(() => {
          if (_snapshotCallback) {
            _snapshotCallback(buildSnapshot(docs))
          }
        })

        const { notifications, unreadCount } = result.current

        // 1. Shape assertion
        expect(Array.isArray(notifications)).toBe(true)
        expect(typeof unreadCount).toBe('number')

        // 2. Count assertion — unreadCount must match items where is_read === false
        const expectedUnread = docs.filter(d => d.data.is_read === false).length
        expect(unreadCount).toBe(expectedUnread)

        // 3. Length assertion — notifications array length must match docs count
        expect(notifications.length).toBe(docs.length)

        unmount()
      }),
      { numRuns: 100, seed: 7 }
    )
  })

  it('PBT — notifications array items include the document id field', () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * Each item in the returned notifications array must include the Firestore
     * document id (merged via spread: { id: doc.id, ...data }).
     */
    fc.assert(
      fc.property(
        fc.array(notificationDocArb, { minLength: 1, maxLength: 10 }),
        (docs) => {
          _snapshotCallback = null

          const { result, unmount } = renderHook(
            () => useNotifications(TEST_ADMIN_ID)
          )

          act(() => {
            if (_snapshotCallback) {
              _snapshotCallback(buildSnapshot(docs))
            }
          })

          const { notifications } = result.current
          docs.forEach((doc, i) => {
            expect(notifications[i]).toHaveProperty('id', doc.id)
          })

          unmount()
        }
      ),
      { numRuns: 50, seed: 13 }
    )
  })

  it('returns empty notifications and 0 unreadCount when adminMongoId is falsy', () => {
    /**
     * **Validates: Requirements 3.8**
     *
     * When no adminMongoId is provided, the hook must return an empty array
     * and unreadCount of 0 (no Firestore subscription is set up).
     */
    const { result } = renderHook(() => useNotifications(null))

    expect(result.current.notifications).toEqual([])
    expect(result.current.unreadCount).toBe(0)
  })

  it('unreadCount is 0 when all notifications are read', () => {
    /**
     * Deterministic baseline: all is_read=true → unreadCount = 0
     * Validates: Requirements 3.2
     */
    _snapshotCallback = null
    const { result, unmount } = renderHook(() => useNotifications(TEST_ADMIN_ID))

    const allReadDocs = [
      { id: 'n1', data: { is_read: true, user_id: TEST_ADMIN_ID, title: 'Hello' } },
      { id: 'n2', data: { is_read: true, user_id: TEST_ADMIN_ID, title: 'World' } },
    ]

    act(() => {
      if (_snapshotCallback) _snapshotCallback(buildSnapshot(allReadDocs))
    })

    expect(result.current.unreadCount).toBe(0)
    expect(result.current.notifications.length).toBe(2)
    unmount()
  })

  it('unreadCount equals total when all notifications are unread', () => {
    /**
     * Deterministic baseline: all is_read=false → unreadCount = total docs
     * Validates: Requirements 3.2
     */
    _snapshotCallback = null
    const { result, unmount } = renderHook(() => useNotifications(TEST_ADMIN_ID))

    const allUnreadDocs = [
      { id: 'n1', data: { is_read: false, user_id: TEST_ADMIN_ID } },
      { id: 'n2', data: { is_read: false, user_id: TEST_ADMIN_ID } },
      { id: 'n3', data: { is_read: false, user_id: TEST_ADMIN_ID } },
    ]

    act(() => {
      if (_snapshotCallback) _snapshotCallback(buildSnapshot(allUnreadDocs))
    })

    expect(result.current.unreadCount).toBe(3)
    expect(result.current.notifications.length).toBe(3)
    unmount()
  })
})
