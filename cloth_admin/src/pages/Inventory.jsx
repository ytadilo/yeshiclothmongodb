import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

export default function Inventory() {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/api/posts')
        const d = res.data
        setProducts(Array.isArray(d) ? d : (Array.isArray(d?.posts) ? d.posts : []))
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const getCategory = (p) => {
    const cats = Array.isArray(p.categories) ? p.categories : [p.category].filter(Boolean)
    return cats.join(', ') || '—'
  }

  const getPrice = (p) => {
    const price = Number(p.post_price_etb || p.postPriceEtb || p.price_etb || p.priceEtb || 0)
    return price > 0 ? `${price.toLocaleString()} ETB` : '—'
  }

  const getStockStatus = (p) => {
    const inStock = p.in_stock ?? p.inStock ?? p.stock_status ?? p.stockStatus
    if (inStock === false || inStock === 0 || inStock === 'out_of_stock' || inStock === 'Out of Stock') {
      return <span className="badge badge-danger">Out of Stock</span>
    }
    return <span className="badge badge-success">In Stock</span>
  }

  if (loading) return <div className="empty-state"><div className="spinner" /></div>

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Inventory</h1>
        <p>Overview of all products and their current stock status.</p>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {products.length === 0 ? (
          <div className="empty-state" style={{ padding: '48px' }}>
            <svg style={{ width: '48px', height: '48px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p>No products found.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Category</th>
                  <th>Price (ETB)</th>
                  <th>Stock Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const id = p._id || p.id
                  const name = p.title || p.name || 'Untitled'
                  return (
                    <tr key={id}>
                      <td style={{ fontWeight: 600 }}>{name}</td>
                      <td>{getCategory(p)}</td>
                      <td>{getPrice(p)}</td>
                      <td>{getStockStatus(p)}</td>
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '0.8125rem', padding: '5px 12px' }}
                          onClick={() => navigate(`/products/${id}/edit`)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
