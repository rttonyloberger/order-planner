import React, { useState, useEffect } from 'react'
import { SUPP_COLORS, SG_PRODUCTS, RT_PRODUCTS, daysUntil, arrivalColor, fmtDate, fmtMoney } from '../constants'
import { OCEAN_CARRIERS, TRACKING_STATUSES, createTracking, getTracking, refreshAllTracking } from '../tracking'

export default function ReceivingTab({ pos, upsertPO, showModal, closeModal }) {
  const [trackingInfo, setTrackingInfo] = useState({})
  const [lastRefresh, setLastRefresh] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const bbPos = pos.filter(p => p.dest === 'BB' && p.status !== 'Complete')
    .sort((a, b) => {
      if (!a.eta && !b.eta) return 0
      if (!a.eta) return 1
      if (!b.eta) return -1
      return new Date(a.eta) - new Date(b.eta)
    })

  // Auto-refresh tracking on mount
  useEffect(() => {
    loadAllTracking()
  }, [bbPos.length])

  const loadAllTracking = async () => {
    const withTracking = bbPos.filter(p => p.tracking_number && p.carrier_slug && p.carrier_slug !== 'other')
    for (const po of withTracking) {
      const info = await getTracking(po.tracking_number, po.carrier_slug)
      if (info) setTrackingInfo(prev => ({ ...prev, [po.id]: info }))
    }
    setLastRefresh(new Date())
  }

  const handleRefreshAll = async () => {
    setRefreshing(true)
    await loadAllTracking()
    setRefreshing(false)
  }

  const arriving30 = bbPos.filter(p => { const d = daysUntil(p.eta); return d !== null && d >= 0 && d <= 30 }).length
  const overdue = bbPos.filter(p => { const d = daysUntil(p.eta); return d !== null && d < 0 }).length
  const totalVal = bbPos.reduce((s, p) => s + (p.po_value || 0), 0)
  const tracked = bbPos.filter(p => p.tracking_number).length

  const update = (po, field, val) => upsertPO({ ...po, [field]: val || null })

  const handleTrackingSubmit = async (po, trackingNumber, carrierSlug) => {
    await upsertPO({ ...po, tracking_number: trackingNumber, carrier_slug: carrierSlug })
    await createTracking(trackingNumber, carrierSlug)
    const info = await getTracking(trackingNumber, carrierSlug)
    if (info) {
      setTrackingInfo(prev => ({ ...prev, [po.id]: info }))
      if (info.expectedDelivery && !po.eta) {
        await upsertPO({ ...po, tracking_number: trackingNumber, carrier_slug: carrierSlug, eta: info.expectedDelivery.split('T')[0] })
      }
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#5C2E00,#7B3F00)', borderRadius: 10, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0 }}>Big Bend Receiving</h2>
          <p style={{ color: '#FFCC99', fontSize: 11, margin: '2px 0 0' }}>All open inbound BB shipments — RT and SG combined, sorted by arrival</p>
          {lastRefresh && (
            <p style={{ color: '#FFCC9988', fontSize: 10, margin: '4px 0 0' }}>
              Tracking last refreshed: {lastRefresh.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { num: bbPos.length, lbl: 'Open POs' },
              { num: arriving30, lbl: 'Arriving ≤30d' },
              { num: overdue, lbl: 'Overdue' },
              { num: tracked, lbl: 'Tracked' },
            ].map(s => (
              <div key={s.lbl} style={{ background: 'rgba(255,255,255,.15)', borderRadius: 8, padding: '8px 14px', textAlign: 'center', minWidth: 75 }}>
                <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{s.num}</div>
                <div style={{ color: '#FFCC99', fontSize: 10, marginTop: 3 }}>{s.lbl}</div>
              </div>
            ))}
          </div>
          <button
            onClick={handleRefreshAll}
            disabled={refreshing}
            style={{ padding: '8px 14px', background: refreshing ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.2)', color: '#fff', border: '1px solid rgba(255,255,255,.3)', borderRadius: 6, fontSize: 11, cursor: refreshing ? 'default' : 'pointer', fontWeight: 500 }}
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh Tracking'}
          </button>
        </div>
      </div>

      {bbPos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>No open BB shipments</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: 8 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                {['Supplier','PO #','Entity','Product','Status','Order Date','ETA','PO Value','Carrier','Tracking #','Live Status','FCL / LCL','Days Away'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bbPos.map(p => {
                const sc = SUPP_COLORS[p.supplier] || { bg: '#f5f5f5', fc: '#333', b: '#ccc' }
                const days = daysUntil(p.eta)
                const ac = arrivalColor(days)
                const dTxt = days === null ? 'TBD' : days < 0 ? `${Math.abs(days)}d overdue` : `${days} days`
                const opts = p.entity === 'SG' ? SG_PRODUCTS : RT_PRODUCTS
                const liveInfo = trackingInfo[p.id]
                const statusStyle = liveInfo ? (TRACKING_STATUSES[liveInfo.status] || TRACKING_STATUSES.pending) : null

                return (
                  <tr key={p.id} style={{ background: sc.bg + '18', borderBottom: '1px solid #f0f0f0' }}>
                    {/* Supplier */}
                    <td style={{ ...tdStyle, fontWeight: 700, background: sc.bg, color: sc.fc, borderLeft: `3px solid ${sc.b}`, textAlign: 'left', minWidth: 140 }}>{p.supplier}</td>
                    {/* PO # */}
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, color: '#666' }}>#{p.id}</td>
                    {/* Entity */}
                    <td style={tdStyle}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: p.entity === 'RT' ? '#E6F1FB' : '#EAF3DE', color: p.entity === 'RT' ? '#0C447C' : '#27500A' }}>{p.entity}</span>
                    </td>
                    {/* Product */}
                    <td style={{ ...tdStyle, minWidth: 120 }}>
                      <select style={selStyle} value={p.product_type || ''} onChange={e => update(p, 'product_type', e.target.value)}>
                        <option value=''>-- Select --</option>
                        {opts.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    {/* Status badge */}
                    <td style={tdStyle}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 600, background: p.status === 'Committed' ? '#E6F1FB' : '#FAEEDA', color: p.status === 'Committed' ? '#0C447C' : '#633806' }}>{p.status}</span>
                    </td>
                    {/* Order Date */}
                    <td style={{ ...tdStyle, fontSize: 11, color: '#666' }}>{fmtDate(p.order_date)}</td>
                    {/* ETA */}
                    <td style={tdStyle}>
                      <input type="date" defaultValue={p.eta || ''} onBlur={e => update(p, 'eta', e.target.value)} style={{ fontSize: 11, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: 110, cursor: 'pointer' }} />
                      {liveInfo?.expectedDelivery && (
                        <div style={{ fontSize: 9, color: '#27500A', marginTop: 2 }}>AfterShip: {new Date(liveInfo.expectedDelivery).toLocaleDateString()}</div>
                      )}
                    </td>
                    {/* PO Value */}
                    <td style={{ ...tdStyle, fontSize: 11 }}>{fmtMoney(p.po_value)}</td>
                    {/* Carrier dropdown */}
                    <td style={{ ...tdStyle, minWidth: 130 }}>
                      <select
                        style={selStyle}
                        value={p.carrier_slug || ''}
                        onChange={e => update(p, 'carrier_slug', e.target.value)}
                      >
                        <option value=''>Select carrier…</option>
                        {OCEAN_CARRIERS.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                      </select>
                    </td>
                    {/* Tracking number */}
                    <td style={{ ...tdStyle, minWidth: 150 }}>
                      <input
                        type="text"
                        defaultValue={p.tracking_number || ''}
                        placeholder="Enter tracking #"
                        style={{ fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: '100%', fontFamily: 'monospace' }}
                        onBlur={e => {
                          if (e.target.value && p.carrier_slug) {
                            handleTrackingSubmit(p, e.target.value, p.carrier_slug)
                          } else if (e.target.value) {
                            update(p, 'tracking_number', e.target.value)
                          }
                        }}
                      />
                    </td>
                    {/* Live status */}
                    <td style={{ ...tdStyle, minWidth: 140 }}>
                      {liveInfo && statusStyle ? (
                        <div>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: statusStyle.bg, color: statusStyle.color }}>
                            {liveInfo.statusLabel}
                          </span>
                          {liveInfo.lastLocation && (
                            <div style={{ fontSize: 9, color: '#666', marginTop: 3 }}>📍 {liveInfo.lastLocation}</div>
                          )}
                          {liveInfo.checkpoints?.length > 0 && (
                            <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>
                              Last: {new Date(liveInfo.checkpoints[0].time).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      ) : p.tracking_number ? (
                        <span style={{ fontSize: 10, color: '#888', fontStyle: 'italic' }}>
                          {process.env.REACT_APP_AFTERSHIP_API_KEY ? 'Fetching…' : 'API key needed'}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: '#ccc' }}>—</span>
                      )}
                    </td>
                    {/* FCL/LCL */}
                    <td style={{ ...tdStyle, minWidth: 120 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <select style={smallSelStyle} value={p.ship_mode || ''} onChange={e => update(p, 'ship_mode', e.target.value)}>
                          <option value=''>--</option>
                          <option value='FCL'>FCL</option>
                          <option value='LCL'>LCL</option>
                        </select>
                        {p.ship_mode === 'FCL' && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#E6F1FB', color: '#0C447C' }}>FCL</span>}
                        {p.ship_mode === 'LCL' && <>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#EEEDFE', color: '#3C3489' }}>LCL</span>
                          <input type="number" placeholder="# boxes" defaultValue={p.box_count || ''} onBlur={e => update(p, 'box_count', e.target.value ? +e.target.value : null)} style={{ fontSize: 10, padding: '2px 5px', border: '1px solid #ddd', borderRadius: 4, width: 65 }} />
                        </>}
                      </div>
                    </td>
                    {/* Days Away */}
                    <td style={{ ...tdStyle, fontWeight: 700, minWidth: 80, background: ac.bg, color: ac.fc, border: `1px solid ${ac.border}` }}>{dTxt}</td>
                  </tr>
                )
              })}
              <tr style={{ background: '#f5f5f5', borderTop: '2px solid #ddd' }}>
                <td colSpan={12} style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, textAlign: 'right' }}>
                  {bbPos.length} open BB shipments{totalVal ? `   |   Total inbound value: ${fmtMoney(totalVal)}` : ''}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const thStyle = { background: '#f5f5f3', fontSize: 10, fontWeight: 500, color: '#666', padding: '7px 8px', textAlign: 'center', borderRight: '1px solid #eee', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap', letterSpacing: '.04em', textTransform: 'uppercase' }
const tdStyle = { padding: '7px 8px', borderRight: '1px solid #eee', fontSize: 12, textAlign: 'center', verticalAlign: 'middle' }
const selStyle = { fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 5, background: '#fff', cursor: 'pointer', width: '100%', minWidth: 110 }
const smallSelStyle = { fontSize: 10, padding: '2px 4px', border: '1px solid #ddd', borderRadius: 4, background: '#fff', cursor: 'pointer' }
