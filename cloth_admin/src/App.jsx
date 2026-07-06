import React, { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AdminLayout from './components/Layout/AdminLayout'
import Login from './pages/Login'

// Lazy-load all admin pages for faster initial load
const Dashboard    = lazy(() => import('./pages/Dashboard'))
const Orders       = lazy(() => import('./pages/Orders'))
const OrderDetail  = lazy(() => import('./pages/OrderDetail'))
const Products     = lazy(() => import('./pages/Products'))
const ProductForm  = lazy(() => import('./pages/ProductForm'))
const Categories   = lazy(() => import('./pages/Categories'))
const Customers    = lazy(() => import('./pages/Customers'))
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'))
const Payments     = lazy(() => import('./pages/Payments'))
const Analytics    = lazy(() => import('./pages/Analytics'))
const Inventory    = lazy(() => import('./pages/Inventory'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Settings     = lazy(() => import('./pages/Settings'))
const Profile      = lazy(() => import('./pages/Profile'))

const PageLoader = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: '300px',
    gap: '12px',
    color: 'var(--text-tertiary)'
  }}>
    <div className="spinner" />
    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Loading...</span>
  </div>
)

function App() {
  return (
    <Routes>
      {/* Public route */}
      <Route path="/login" element={<Login />} />

      {/* Protected admin routes */}
      <Route path="/*" element={
        <ProtectedRoute>
          <AdminLayout>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route index element={<Dashboard />} />
                <Route path="orders" element={<Orders />} />
                <Route path="orders/:id" element={<OrderDetail />} />
                <Route path="products" element={<Products />} />
                <Route path="products/new" element={<ProductForm />} />
                <Route path="products/:id/edit" element={<ProductForm />} />
                <Route path="categories" element={<Categories />} />
                <Route path="customers" element={<Customers />} />
                <Route path="customers/:id" element={<CustomerDetail />} />
                <Route path="payments" element={<Payments />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="settings" element={<Settings />} />
                <Route path="profile" element={<Profile />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AdminLayout>
        </ProtectedRoute>
      } />
    </Routes>
  )
}

export default App
