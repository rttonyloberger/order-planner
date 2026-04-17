import React, { useState, useEffect, useCallback } from 'react'
import { SUPP_COLORS, SG_PRODUCTS, RT_PRODUCTS, daysUntil, arrivalColor, fmtDate, fmtMoney } from '../constants'
import { CARRIERS, detectCarrier, registerTracking, getTracking, isDirectOnly, getDirectUrl } from '../tracking'
import PODocsCell from './PODocsCell'

function safeStr(val) {
  if (val == null) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object') {
    // Handle location objects like {city, country, state}
    if (val.city || val.country) return [val.city, val.state, val.country].filter(Boolean).join(', ')
    return JSON.stringify(val)
  }
  return String(val)
}


// Format ISO date/datetime to simple American format: 4/11/2026
function fmtTrackDate(val) {
  if (!val) return ''
  try {
    const s = typeof val === 'string' ? val : JSON.stringify(val)
    // Handle ISO strings like "2026-04-11T16:00:00Z" or "2026-04-11"
    const match = s.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (!match) return s.replace(/T.*/,'')
    const [, year, month, day] = match
    return `${parseInt(month)}/${parseInt(day)}/${year}`
  } catch(e) {
    return ''
  }
}

export default function ReceivingTab({ pos, upsertPO, deletePO, showModal, closeModal }) {
  const [trackingInfo, setTrackingInfo] = useState({})
  const [loadingIds, setLoadingIds] = useState(new Set())
  const [lastRefresh, setLastRefresh] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  const bbPos = pos
    .filter(p => p.dest === 'BB' && p.status !== 'Complete')
    .sort((a, b) => {
      if (!a.eta && !b.eta) return 0
      if (!a.eta) return 1
      if (!b.eta) return -1
      return new Date(a.eta) - new Date(b.eta)
    })

  const loadOne = useCallback(async (po) => {
    if (!po.tracking_number) return
    setLoadingIds(prev => new Set([...prev, po.id]))
    try {
      const info = await getTracking(po.tracking_number)
      setTrackingInfo(prev => ({ ...prev, [po.id]: info || { noData: true } }))
    } catch (e) {
      console.error('Tracking error for', po.id, e)
      setTrackingInfo(prev => ({ ...prev, [po.id]: { noData: true } }))
    }
    setLoadingIds(prev => { const n = new Set(prev); n.delete(po.id); return n })
  }, [])

  useEffect(() => {
    const withTracking = bbPos.filter(p => p.tracking_number)
    withTracking.forEach(po => { if (!trackingInfo[po.id]) loadOne(po) })
    if (withTracking.length) setLastRefresh(new Date())
  }, [bbPos.map(p => p.id).join(',')])

  const handleRefreshAll = async () => {
    setRefreshing(true)
    for (const po of bbPos.filter(p => p.tracking_number)) await loadOne(po)
    setLastRefresh(new Date())
    setRefreshing(false)
  }

  const update = (po, field, val) => upsertPO({ ...po, [field]: val || null })

  const handleAddTracking = async (po, trackingNumber) => {
    if (!trackingNumber) return
    const auto = detectCarrier(trackingNumber)
    await upsertPO({ ...po, tracking_number: trackingNumber, carrier_slug: auto?.code || '0' })
    await registerTracking(trackingNumber)
    setTimeout(() => loadOne({ ...po, tracking_number: trackingNumber }), 3000)
  }

  const handleMarkComplete = (po) => {
    showModal({
      title: 'Mark as Complete?',
      body: `PO #${po.id} from ${po.supplier} has been delivered. Mark it complete and remove it from the receiving list?`,
      confirmLabel: 'Yes, mark complete',
      onConfirm: () => { deletePO(po.id); closeModal() }
    })
  }

  const arriving30 = bbPos.filter(p => { const d = daysUntil(p.eta); return d !== null && d >= 0 && d <= 30 }).length
  const overdue = bbPos.filter(p => { const d = daysUntil(p.eta); return d !== null && d < 0 }).length
  const inTransit = Object.values(trackingInfo).filter(t => t?.statusCode === 'InTransit').length
  const delivered = Object.values(trackingInfo).filter(t => t?.statusCode === 'Delivered').length
  const totalVal = bbPos.reduce((s, p) => s + (p.po_value || 0), 0)

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#18a0cc,#22b6e1)', borderRadius: 10, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#000', fontSize: 16, fontWeight: 700, margin: 0 }}>Big Bend Receiving</h2>
          <p style={{ color: '#000', fontSize: 11, margin: '2px 0 0' }}>All open inbound BB shipments — RT and SG combined, sorted by arrival</p>
          {lastRefresh && <p style={{ color: '#000', fontSize: 10, margin: '4px 0 0' }}>Last refreshed: {lastRefresh.toLocaleTimeString()}</p>}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { num: bbPos.length, lbl: 'Open POs' },
            { num: inTransit, lbl: 'In Transit' },
            { num: delivered, lbl: 'Delivered' },
            { num: arriving30, lbl: 'Arriving ≤30d' },
            { num: overdue, lbl: 'Overdue' },
          ].map(s => (
            <div key={s.lbl} style={{ background: s.lbl === 'Delivered' ? 'rgba(39,80,10,.2)' : 'rgba(255,255,255,.35)', borderRadius: 8, padding: '8px 14px', textAlign: 'center', minWidth: 72 }}>
              <div style={{ color: '#000', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{s.num}</div>
              <div style={{ color: '#000', fontSize: 10, marginTop: 3 }}>{s.lbl}</div>
            </div>
          ))}
          <button onClick={handleRefreshAll} disabled={refreshing} style={{ padding: '8px 14px', background: 'rgba(255,255,255,.35)', color: '#000', border: '1px solid rgba(0,0,0,.2)', borderRadius: 6, fontSize: 11, cursor: refreshing ? 'default' : 'pointer', fontWeight: 500 }}>
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
                  {['Supplier','PO #','Entity','Product','PO Status','Order Date','ETA','PO Value','Carrier','Tracking #','Last Update','Current Location','Tracking Status','Docs','FCL/LCL','Est. Receive Date'].map(h => (
                    <th key={h} style={thS}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bbPos.map(p => {
                  const sc = SUPP_COLORS[p.supplier] || { bg: '#f5f5f5', fc: '#333', b: '#ccc' }
                  const days = daysUntil(p.eta)
                  const ac = arrivalColor(days)
                  const info = trackingInfo[p.id]
                  const isLoading = loadingIds.has(p.id)
                  const isExpanded = expandedId === p.id
                  const hasInfo = info && !info.noData
                  const isDelivered = hasInfo && info.statusCode === 'Delivered'
                  const opts = p.entity === 'SG' ? SG_PRODUCTS : RT_PRODUCTS

                  // Days away cell — show Delivered if delivered
                  const dTxt = days === null ? 'TBD' : days < 0 ? `${Math.abs(days)}d overdue` : `${days} days`
                  const dStyle = isDelivered ? { bg: '#EAF3DE', fc: '#27500A', border: '#639922' } : ac

                  return (
                    <React.Fragment key={p.id}>
                      {/* Delivered banner row */}
                      {isDelivered && (
                        <tr>
                          <td colSpan={15} style={{ background: '#EAF3DE', padding: '6px 16px', borderBottom: '1px solid #97C459' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ color: '#27500A', fontWeight: 600, fontSize: 12 }}>
                                ✅ PO #{safeStr(p.id)} · {safeStr(p.supplier)} — Delivered{info.lastTime ? ` on ${fmtTrackDate(info.lastTime)}` : ''}
                              </span>
                              <button
                                onClick={() => handleMarkComplete(p)}
                                style={{ padding: '4px 12px', background: '#27500A', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                              >
                                Mark Complete & Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}

                      <tr style={{ background: isDelivered ? '#F5FAF0' : sc.bg + '18', borderBottom: '1px solid #f0f0f0', opacity: isDelivered ? 0.85 : 1 }}>
                        <td style={{ ...tdS, fontWeight: 700, background: isDelivered ? '#EAF3DE' : sc.bg, color: isDelivered ? '#27500A' : sc.fc, borderLeft: `3px solid ${isDelivered ? '#639922' : sc.b}`, textAlign: 'left', minWidth: 140 }}>{safeStr(p.supplier)}</td>
                        <td style={{ ...tdS, fontFamily: 'monospace', fontSize: 11, color: '#666' }}>#{safeStr(p.id)}</td>
                        <td style={tdS}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: p.entity === 'RT' ? '#E6F1FB' : '#EAF3DE', color: p.entity === 'RT' ? '#0C447C' : '#27500A' }}>{safeStr(p.entity)}</span></td>
                        <td style={{ ...tdS, minWidth: 120 }}>
                          <select style={selS} value={p.product_type || ''} onChange={e => update(p, 'product_type', e.target.value)}>
                            <option value=''>--</option>
                            {opts.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </td>
                        <td style={tdS}><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 600, background: p.status === 'Committed' ? '#E6F1FB' : '#FAEEDA', color: p.status === 'Committed' ? '#0C447C' : '#633806' }}>{safeStr(p.status)}</span></td>
                        <td style={{ ...tdS, fontSize: 11, color: '#666' }}>{fmtDate(p.order_date)}</td>
                        <td style={tdS}>
                          <input type="date" defaultValue={p.eta || ''} onBlur={e => update(p, 'eta', e.target.value)} style={{ fontSize: 11, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: 110 }} />
                        </td>
                        <td style={{ ...tdS, fontSize: 11 }}>{fmtMoney(p.po_value)}</td>
                        <td style={{ ...tdS, minWidth: 140, fontSize: 10 }}>
                          {hasInfo && info.resolvedCarrier
                            ? <span style={{ background: '#E6F1FB', color: '#0C447C', padding: '2px 7px', borderRadius: 8, fontWeight: 600 }}>{safeStr(info.resolvedCarrier)}</span>
                            : (() => { const det = detectCarrier(p.tracking_number); return det ? <span style={{ background: '#f0f0f0', color: '#555', padding: '2px 7px', borderRadius: 8 }}>{safeStr(det.name)}</span> : <span style={{ color: '#ccc' }}>—</span> })()
                          }
                        </td>
                        <td style={{ ...tdS, minWidth: 170 }}>
                          <TrackingInput po={p} onSubmit={handleAddTracking} onRemove={() => { update(p, 'tracking_number', null); setTrackingInfo(prev => { const n = {...prev}; delete n[p.id]; return n }) }} />
                        </td>
                        <td style={{ ...tdS, minWidth: 120, fontSize: 10 }}>
                          {isLoading ? <span style={{ color: '#888', fontStyle: 'italic' }}>Checking…</span>
                            : hasInfo && info.lastTime ? <span style={{ color: '#444' }}>{fmtTrackDate(info.lastTime)}</span>
                            : p.tracking_number ? <button onClick={() => loadOne(p)} style={recheckStyle}>Re-check</button>
                            : <span style={{ color: '#ccc' }}>—</span>}
                        </td>
                        <td style={{ ...tdS, minWidth: 170, fontSize: 10 }}>
                          {isLoading ? <span style={{ color: '#aaa' }}>…</span>
                            : hasInfo && info.lastLocation
                              ? <div><div style={{ fontWeight: 500, color: '#333' }}>📍 {safeStr(info.lastLocation)}</div>{info.lastEvent && <div style={{ color: '#777', marginTop: 2, fontSize: 9 }}>{safeStr(info.lastEvent)}</div>}</div>
                              : <span style={{ color: '#ccc' }}>—</span>}
                        </td>
                        <td style={{ ...tdS, minWidth: 140 }}>
                          {isLoading ? <span style={{ fontSize: 10, color: '#888', fontStyle: 'italic' }}>Fetching…</span>
                            : hasInfo
                              ? <div>
                                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: info.statusStyle?.bg || '#f5f5f5', color: info.statusStyle?.color || '#888' }}>
                                    {safeStr(info.statusIcon)} {safeStr(info.statusLabel)}
                                  </span>
                                  {info.totalEvents > 0 && (
                                    <button onClick={() => setExpandedId(isExpanded ? null : p.id)} style={{ display: 'block', fontSize: 9, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', marginTop: 3 }}>
                                      {isExpanded ? 'Hide history' : `${info.totalEvents} updates`}
                                    </button>
                                  )}
                                </div>
                              : p.tracking_number
                                ? (isDirectOnly(p.tracking_number)
                                    ? <a href={getDirectUrl(p.tracking_number)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, padding: '3px 8px', background: '#0C447C', color: '#fff', borderRadius: 5, textDecoration: 'none', fontWeight: 600, display: 'inline-block' }}>Track on {detectCarrier(p.tracking_number)?.name} →</a>
                                    : <div>
                                        <span style={{ fontSize: 10, color: '#888', fontStyle: 'italic' }}>No status yet</span>
                                        <button onClick={() => loadOne(p)} style={recheckStyle}>Re-check</button>
                                        {getDirectUrl(p.tracking_number) && <a href={getDirectUrl(p.tracking_number)} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: 9, color: '#0C447C', marginTop: 3, textDecoration: 'underline' }}>Track on {detectCarrier(p.tracking_number)?.name} →</a>}
                                      </div>)
                                : <span style={{ color: '#ccc' }}>—</span>}
                        </td>
                        {/* Docs */}
                        <td style={{ ...tdS, minWidth: 190, verticalAlign: 'top', padding: '8px' }}>
                          <PODocsCell poId={p.id} />
                        </td>
                        <td style={{ ...tdS, minWidth: 120 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                            <select style={{ fontSize: 10, padding: '2px 4px', border: '1px solid #ddd', borderRadius: 4 }} value={p.ship_mode || ''} onChange={e => update(p, 'ship_mode', e.target.value)}>
                              <option value=''>--</option><option value='FCL'>FCL</option><option value='LCL'>LCL</option>
                            </select>
                            {p.ship_mode === 'FCL' && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#E6F1FB', color: '#0C447C' }}>FCL</span>}
                            {p.ship_mode === 'LCL' && <>
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#EEEDFE', color: '#3C3489' }}>LCL</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <input type="text" inputMode="numeric" placeholder="#" defaultValue={p.box_count || ''} onBlur={e => { const v = parseInt(e.target.value); update(p, 'box_count', !isNaN(v) ? v : null) }} style={{ fontSize: 10, padding: '2px 5px', border: '1px solid #ddd', borderRadius: 4, width: 40 }} />
                                <span style={{ fontSize: 10, color: '#555', whiteSpace: 'nowrap' }}>boxes</span>
                              </div>
                            </>}
                          </div>
                        </td>
                        <td style={{ ...tdS, fontWeight: 700, minWidth: 100, background: dStyle.bg, color: dStyle.fc, border: `1px solid ${dStyle.border}` }}>
                          {isDelivered ? 'Delivered' : (
                            <div>
                              <div style={{ fontWeight: 700 }}>{dTxt}</div>
                              {hasInfo && info.eta && typeof info.eta === 'string' && info.eta.match(/\d{4}/) && (
                                <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2, color: '#27500A' }}>
                                  📅 {fmtTrackDate(info.eta)}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Expanded event history */}
                      {isExpanded && hasInfo && info.events?.length > 0 && (
                        <tr>
                          <td colSpan={16} style={{ padding: '12px 20px', background: '#f8f8f6', borderBottom: '2px solid #ddd' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#1F3864', marginBottom: 8 }}>
                              Shipment History — #{safeStr(p.id)} · {safeStr(p.tracking_number)}
                              {info.resolvedCarrier && <span style={{ fontWeight: 400, color: '#666', marginLeft: 8 }}>via {safeStr(info.resolvedCarrier)}</span>}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                              {info.events.map((ev, i) => (
                                <div key={i} style={{ background: i === 0 ? '#E6F1FB' : '#fff', border: '1px solid #e0e0e0', borderRadius: 6, padding: '8px 12px' }}>
                                  <div style={{ fontSize: 10, fontWeight: 600, color: i === 0 ? '#0C447C' : '#333', marginBottom: 2 }}>{safeStr(ev.time) || '—'}</div>
                                  {ev.location && <div style={{ fontSize: 10, color: '#555' }}>📍 {safeStr(ev.location)}</div>}
                                  {ev.message && <div style={{ fontSize: 10, color: '#777', marginTop: 2 }}>{safeStr(ev.message)}</div>}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
                <tr style={{ background: '#f5f5f5', borderTop: '2px solid #ddd' }}>
                  <td colSpan={15} style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, textAlign: 'right' }}>
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

function TrackingInput({ po, onSubmit, onRemove }) {
  const [val, setVal] = useState(po.tracking_number || '')
  const [detected, setDetected] = useState(null)

  useEffect(() => { setVal(po.tracking_number || '') }, [po.tracking_number])

  const handleChange = (v) => { setVal(v); setDetected(detectCarrier(v)) }
  const handleBlur = () => { if (val.trim() && val.trim() !== po.tracking_number) onSubmit(po, val.trim()) }

  return (
    <div>
      <input type="text" value={val} onChange={e => handleChange(e.target.value)} onBlur={handleBlur} placeholder="Enter tracking #"
        style={{ fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: '100%', fontFamily: 'monospace' }} />
      {detected && !po.tracking_number && (
        <div style={{ fontSize: 9, color: '#27500A', background: '#EAF3DE', padding: '2px 5px', borderRadius: 3, marginTop: 2 }}>✓ {detected.name}</div>
      )}
      {po.tracking_number && (
        <button onClick={onRemove} style={{ fontSize: 9, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', marginTop: 2 }}>remove</button>
      )}
    </div>
  )
}

const thS = { background: '#f5f5f3', fontSize: 10, fontWeight: 500, color: '#666', padding: '7px 8px', textAlign: 'center', borderRight: '1px solid #eee', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap', letterSpacing: '.04em', textTransform: 'uppercase' }
const tdS = { padding: '7px 8px', borderRight: '1px solid #eee', fontSize: 12, textAlign: 'center', verticalAlign: 'middle' }
const selS = { fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 5, background: '#fff', cursor: 'pointer', width: '100%' }
const recheckStyle = { display: 'block', fontSize: 9, color: '#0C447C', background: 'none', border: '1px solid #0C447C', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', marginTop: 3 }
