import React, { useState, useEffect } from 'react'
import { SUPP_COLORS, SG_PRODUCTS, RT_PRODUCTS, daysUntil, arrivalColor, fmtDate, fmtMoney } from '../constants'
import { CARRIERS, TRACKING_STATUSES, detectCarrier, registerTracking, getTracking } from '../tracking'

export default function ReceivingTab({ pos, upsertPO, showModal, closeModal }) {
  const [trackingInfo, setTrackingInfo] = useState({})
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)

  const bbPos = pos
    .filter(p => p.dest === 'BB' && p.status !== 'Complete')
    .sort((a, b) => {
      if (!a.eta && !b.eta) return 0
      if (!a.eta) return 1
      if (!b.eta) return -1
      return new Date(a.eta) - new Date(b.eta)
    })

  useEffect(() => { loadAll() }, [bbPos.length])

  const loadAll = async () => {
    const withTracking = bbPos.filter(p => p.tracking_number)
    for (const po of withTracking) {
      const info = await getTracking(po.tracking_number, po.carrier_slug)
      if (info) setTrackingInfo(prev => ({ ...prev, [po.id]: info }))
    }
    setLastRefresh(new Date())
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadAll()
    setRefreshing(false)
  }

  const update = (po, field, val) => upsertPO({ ...po, [field]: val || null })

  const handleTrackingSubmit = async (po, trackingNumber, carrierCode) => {
    const finalCarrier = carrierCode || '0'
    await upsertPO({ ...po, tracking_number: trackingNumber, carrier_slug: finalCarrier })
    await registerTracking(trackingNumber, finalCarrier)
    const info = await getTracking(trackingNumber, finalCarrier)
    if (info) {
      setTrackingInfo(prev => ({ ...prev, [po.id]: info }))
      if (info.eta && !po.eta) {
        await upsertPO({ ...po, tracking_number: trackingNumber, carrier_slug: finalCarrier, eta: info.eta })
      }
    }
  }

  const arriving30 = bbPos.filter(p => { const d = daysUntil(p.eta); return d !== null && d >= 0 && d <= 30 }).length
  const overdue = bbPos.filter(p => { const d = daysUntil(p.eta); return d !== null && d < 0 }).length
  const tracked = bbPos.filter(p => p.tracking_number).length
  const totalVal = bbPos.reduce((s, p) => s + (p.po_value || 0), 0)

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#5C2E00,#7B3F00)', borderRadius: 10, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0 }}>Big Bend Receiving</h2>
          <p style={{ color: '#FFCC99', fontSize: 11, margin: '2px 0 0' }}>All open inbound BB shipments — RT and SG combined, sorted by arrival</p>
          {lastRefresh && <p style={{ color: '#FFCC9977', fontSize: 10, margin: '3px 0 0' }}>Last refreshed: {lastRefresh.toLocaleTimeString()}</p>}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {[{ num: bbPos.length, lbl: 'Open POs' }, { num: arriving30, lbl: 'Arriving ≤30d' }, { num: overdue, lbl: 'Overdue' }, { num: tracked, lbl: 'Tracked' }].map(s => (
            <div key={s.lbl} style={{ background: 'rgba(255,255,255,.15)', borderRadius: 8, padding: '8px 14px', textAlign: 'center', minWidth: 72 }}>
              <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{s.num}</div>
              <div style={{ color: '#FFCC99', fontSize: 10, marginTop: 3 }}>{s.lbl}</div>
            </div>
          ))}
          <button onClick={handleRefresh} disabled={refreshing} style={{ padding: '8px 14px', background: 'rgba(255,255,255,.2)', color: '#fff', border: '1px solid rgba(255,255,255,.3)', borderRadius: 6, fontSize: 11, cursor: refreshing ? 'default' : 'pointer', fontWeight: 500 }}>
            {refreshing ? 'Refreshing…' : '↻ Refresh Tracking'}
          </button>
        </div>
      </div>

      {bbPos.length === 0
        ? <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>No open BB shipments</div>
        : (
          <div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: 8 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {['Supplier','PO #','Entity','Product','Status','Order Date','ETA','PO Value','Carrier','Tracking #','Live Status','FCL / LCL','Days Away'].map(h => (
                    <th key={h} style={thS}>{h}</th>
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
                  const carrierName = CARRIERS.find(c => c.code === p.carrier_slug)?.name || ''

                  return (
                    <tr key={p.id} style={{ background: sc.bg + '18', borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ ...tdS, fontWeight: 700, background: sc.bg, color: sc.fc, borderLeft: `3px solid ${sc.b}`, textAlign: 'left', minWidth: 140 }}>{p.supplier}</td>
                      <td style={{ ...tdS, fontFamily: 'monospace', fontSize: 11, color: '#666' }}>#{p.id}</td>
                      <td style={tdS}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: p.entity === 'RT' ? '#E6F1FB' : '#EAF3DE', color: p.entity === 'RT' ? '#0C447C' : '#27500A' }}>{p.entity}</span></td>
                      <td style={{ ...tdS, minWidth: 120 }}>
                        <select style={selS} value={p.product_type || ''} onChange={e => update(p, 'product_type', e.target.value)}>
                          <option value=''>-- Select --</option>
                          {opts.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td style={tdS}><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 600, background: p.status === 'Committed' ? '#E6F1FB' : '#FAEEDA', color: p.status === 'Committed' ? '#0C447C' : '#633806' }}>{p.status}</span></td>
                      <td style={{ ...tdS, fontSize: 11, color: '#666' }}>{fmtDate(p.order_date)}</td>
                      <td style={tdS}>
                        <input type="date" defaultValue={p.eta || ''} onBlur={e => update(p, 'eta', e.target.value)} style={{ fontSize: 11, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: 110, cursor: 'pointer' }} />
                        {liveInfo?.eta && <div style={{ fontSize: 9, color: '#27500A', marginTop: 2 }}>17TRACK: {liveInfo.eta}</div>}
                      </td>
                      <td style={{ ...tdS, fontSize: 11 }}>{fmtMoney(p.po_value)}</td>

                      {/* Carrier dropdown */}
                      <td style={{ ...tdS, minWidth: 140 }}>
                        <CarrierCell po={p} onUpdate={(carrierCode) => update(p, 'carrier_slug', carrierCode)} onSubmit={handleTrackingSubmit} />
                      </td>

                      {/* Tracking number */}
                      <td style={{ ...tdS, minWidth: 160 }}>
                        <TrackingNumberCell po={p} onSubmit={handleTrackingSubmit} onUpdate={update} />
                      </td>

                      {/* Live status */}
                      <td style={{ ...tdS, minWidth: 150 }}>
                        {liveInfo ? (
                          <div>
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: liveInfo.statusStyle.bg, color: liveInfo.statusStyle.color }}>{liveInfo.statusLabel}</span>
                            {liveInfo.lastLocation && <div style={{ fontSize: 9, color: '#555', marginTop: 3 }}>📍 {liveInfo.lastLocation}</div>}
                            {liveInfo.lastTime && <div style={{ fontSize: 9, color: '#888' }}>{liveInfo.lastTime}</div>}
                          </div>
                        ) : p.tracking_number ? (
                          <span style={{ fontSize: 10, color: '#888', fontStyle: 'italic' }}>
                            {process.env.REACT_APP_17TRACK_API_KEY ? 'Fetching…' : 'API key needed'}
                          </span>
                        ) : <span style={{ color: '#ccc', fontSize: 11 }}>—</span>}
                      </td>

                      {/* FCL/LCL */}
                      <td style={{ ...tdS, minWidth: 120 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                          <select style={{ fontSize: 10, padding: '2px 4px', border: '1px solid #ddd', borderRadius: 4 }} value={p.ship_mode || ''} onChange={e => update(p, 'ship_mode', e.target.value)}>
                            <option value=''>--</option><option value='FCL'>FCL</option><option value='LCL'>LCL</option>
                          </select>
                          {p.ship_mode === 'FCL' && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#E6F1FB', color: '#0C447C' }}>FCL</span>}
                          {p.ship_mode === 'LCL' && <>
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#EEEDFE', color: '#3C3489' }}>LCL</span>
                            <input type="number" placeholder="# boxes" defaultValue={p.box_count || ''} onBlur={e => update(p, 'box_count', e.target.value ? +e.target.value : null)} style={{ fontSize: 10, padding: '2px 5px', border: '1px solid #ddd', borderRadius: 4, width: 65 }} />
                          </>}
                        </div>
                      </td>

                      <td style={{ ...tdS, fontWeight: 700, minWidth: 80, background: ac.bg, color: ac.fc, border: `1px solid ${ac.border}` }}>{dTxt}</td>
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

function CarrierCell({ po, onUpdate, onSubmit }) {
  return (
    <select
      style={{ fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 5, width: '100%', cursor: 'pointer' }}
      value={po.carrier_slug || ''}
      onChange={e => onUpdate(e.target.value)}
    >
      <option value=''>Select carrier…</option>
      {CARRIERS.filter(c => c.code !== '0').map(c => <option key={c.code + c.name} value={c.code}>{c.name}</option>)}
    </select>
  )
}

function TrackingNumberCell({ po, onSubmit, onUpdate }) {
  const [val, setVal] = useState(po.tracking_number || '')
  const [autoDetected, setAutoDetected] = useState(null)

  const handleChange = (v) => {
    setVal(v)
    const detected = detectCarrier(v)
    setAutoDetected(detected || null)
  }

  const handleBlur = () => {
    if (val && val !== po.tracking_number) {
      const carrierCode = autoDetected?.code || po.carrier_slug || '0'
      onSubmit(po, val, carrierCode)
    }
  }

  return (
    <div>
      <input
        type="text"
        value={val}
        onChange={e => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder="Enter tracking #"
        style={{ fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: '100%', fontFamily: 'monospace' }}
      />
      {autoDetected && (
        <div style={{ fontSize: 9, color: '#27500A', background: '#EAF3DE', padding: '2px 5px', borderRadius: 3, marginTop: 2 }}>
          ✓ Auto-detected: {autoDetected.name}
        </div>
      )}
      {po.tracking_number && (
        <button onClick={() => onUpdate(po, 'tracking_number', null)} style={{ fontSize: 9, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', marginTop: 2 }}>remove</button>
      )}
    </div>
  )
}

const thS = { background: '#f5f5f3', fontSize: 10, fontWeight: 500, color: '#666', padding: '7px 8px', textAlign: 'center', borderRight: '1px solid #eee', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap', letterSpacing: '.04em', textTransform: 'uppercase' }
const tdS = { padding: '7px 8px', borderRight: '1px solid #eee', fontSize: 12, textAlign: 'center', verticalAlign: 'middle' }
const selS = { fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 5, background: '#fff', cursor: 'pointer', width: '100%' }
