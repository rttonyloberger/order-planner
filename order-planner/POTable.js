import React, { useState, useEffect } from 'react'
import { SUPP_COLORS, SG_PRODUCTS, RT_PRODUCTS, daysUntil, arrivalColor, fmtDate, fmtMoney } from '../constants'
import { OCEAN_CARRIERS, TRACKING_STATUSES, createTracking, getTracking } from '../tracking'

export default function POTable({ tableId, pos, isSG, showShip, upsertPO, deletePO, showModal, closeModal }) {
  const [trackingInfo, setTrackingInfo] = useState({}) // pid -> live tracking data
  const [loadingTracking, setLoadingTracking] = useState({})

  const rows = pos
    .filter(p => p.table_id === tableId)
    .sort((a, b) => {
      if (!a.eta && !b.eta) return 0
      if (!a.eta) return 1
      if (!b.eta) return -1
      return new Date(a.eta) - new Date(b.eta)
    })
  const total = rows.reduce((s, p) => s + (p.po_value || 0), 0)

  // Load tracking info for rows that have tracking numbers
  useEffect(() => {
    rows.forEach(async p => {
      if (p.tracking_number && p.carrier_slug && p.carrier_slug !== 'other' && !trackingInfo[p.id]) {
        setLoadingTracking(prev => ({ ...prev, [p.id]: true }))
        const info = await getTracking(p.tracking_number, p.carrier_slug)
        if (info) setTrackingInfo(prev => ({ ...prev, [p.id]: info }))
        setLoadingTracking(prev => ({ ...prev, [p.id]: false }))
      }
    })
  }, [rows.map(r => r.id + r.tracking_number).join(',')])

  const update = (p, field, val) => upsertPO({ ...p, [field]: val ?? null })

  const handleTrackingSubmit = async (p, trackingNumber, carrierSlug) => {
    if (!trackingNumber || !carrierSlug) return
    // Save to DB
    await upsertPO({ ...p, tracking_number: trackingNumber, carrier_slug: carrierSlug })
    // Register with AfterShip
    const result = await createTracking(trackingNumber, carrierSlug)
    if (result.error && result.error !== 'No AfterShip API key configured') {
      console.warn('AfterShip:', result.error)
    }
    // Fetch live info
    const info = await getTracking(trackingNumber, carrierSlug)
    if (info) {
      setTrackingInfo(prev => ({ ...prev, [p.id]: info }))
      // If AfterShip gives us an ETA and we don't have one, use it
      if (info.expectedDelivery && !p.eta) {
        await upsertPO({ ...p, tracking_number: trackingNumber, carrier_slug: carrierSlug, eta: info.expectedDelivery.split('T')[0] })
      }
    }
  }

  const handleStatus = (p, val) => {
    if (val === 'Complete' || val === 'Delete') {
      const isDel = val === 'Delete'
      showModal({
        title: isDel ? 'Delete this PO?' : 'Mark as Complete?',
        body: `PO #${p.id} will be ${isDel ? 'permanently deleted' : 'removed from the list'}.`,
        confirmLabel: isDel ? 'Yes, delete' : 'Yes, mark complete',
        danger: isDel,
        onConfirm: () => { deletePO(p.id); closeModal() }
      })
    } else {
      update(p, 'status', val)
    }
  }

  const [addRow, setAddRow] = useState({ supplier: '', id: '', status: 'Committed', dest: '', order_date: '', eta: '', po_value: '', product_type: '' })
  const defaultDest = tableId === 'rt-awd' ? 'RT AWD' : tableId === 'rt-bb' ? 'BB' : tableId === 'sg-awdfba' ? 'AWD' : 'BB'
  const entity = tableId.startsWith('sg') ? 'SG' : 'RT'
  const suppliers = isSG ? ['CNBM INTERNATIONAL'] : ['Dongyang Shanye Fishing','I-Lure','Sourcepro','WEIGHT CO','JXL','Weihai Huayue Sports','XINGTAI XIOU IMPORT']
  const destOpts = tableId === 'rt-awd' ? ['RT AWD'] : tableId === 'rt-bb' ? ['BB'] : tableId === 'sg-awdfba' ? ['AWD','FBA'] : ['BB']
  const prodOpts = isSG ? SG_PRODUCTS : RT_PRODUCTS

  const submitAdd = () => {
    if (!addRow.supplier || !addRow.id) return
    upsertPO({
      id: addRow.id, supplier: addRow.supplier, status: addRow.status,
      dest: addRow.dest || defaultDest, entity, table_id: tableId,
      order_date: addRow.order_date || null, eta: addRow.eta || null,
      po_value: addRow.po_value ? +addRow.po_value : null,
      product_type: addRow.product_type || null
    })
    setAddRow({ supplier: '', id: '', status: 'Committed', dest: '', order_date: '', eta: '', po_value: '', product_type: '' })
  }

  const statusColor = (s) => {
    if (s === 'Committed') return { bg: '#E6F1FB', fc: '#0C447C' }
    if (s === 'Draft') return { bg: '#FAEEDA', fc: '#633806' }
    if (s === 'Complete') return { bg: '#EAF3DE', fc: '#27500A' }
    return { bg: '#FCEBEB', fc: '#A32D2D' }
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>PO Value and Order Date editable in Draft. ETA changes re-sort by arrival.</p>
      <div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: 8, marginBottom: 4 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={thS}>Supplier</th>
              <th style={thS}>PO #</th>
              <th style={thS}>Status</th>
              {isSG && <th style={thS}>Product</th>}
              <th style={thS}>Dest</th>
              <th style={thS}>Order Date</th>
              <th style={thS}>ETA</th>
              <th style={thS}>PO Value</th>
              <th style={{ ...thS, minWidth: 200 }}>Tracking</th>
              {showShip && <th style={thS}>FCL / LCL</th>}
              <th style={thS}>Days Away</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const sc = SUPP_COLORS[p.supplier] || { bg: '#f5f5f5', fc: '#333', b: '#ccc' }
              const days = daysUntil(p.eta)
              const ac = arrivalColor(days)
              const dTxt = days === null ? 'TBD' : days < 0 ? `${Math.abs(days)}d overdue` : `${days} days`
              const isDraft = (p.status || 'Draft') === 'Draft'
              const sc2 = statusColor(p.status)
              const db = p.dest === 'AWD' || p.dest === 'RT AWD' ? { bg: '#E6F1FB', fc: '#0C447C' } : p.dest === 'FBA' ? { bg: '#EEEDFE', fc: '#3C3489' } : { bg: '#F1EFE8', fc: '#444441' }
              const liveInfo = trackingInfo[p.id]
              const isLoading = loadingTracking[p.id]
              const statusStyle = liveInfo ? (TRACKING_STATUSES[liveInfo.status] || TRACKING_STATUSES.pending) : null

              return (
                <tr key={p.id} style={{ background: sc.bg + '18', borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ ...tdS, fontWeight: 700, background: sc.bg, color: sc.fc, borderLeft: `3px solid ${sc.b}`, textAlign: 'left', minWidth: 140 }}>{p.supplier}</td>
                  <td style={{ ...tdS, fontFamily: 'monospace', fontSize: 11, color: '#666' }}>#{p.id}</td>
                  <td style={tdS}>
                    <select style={{ ...selS, background: sc2.bg, color: sc2.fc, borderColor: sc2.fc + '44' }} value={p.status || 'Draft'} onChange={e => handleStatus(p, e.target.value)}>
                      <option value='Draft'>Draft</option>
                      <option value='Committed'>Committed</option>
                      <option value='Complete'>Complete</option>
                      <option value='Delete'>Delete</option>
                    </select>
                  </td>
                  {isSG && (
                    <td style={tdS}>
                      <select style={selS} value={p.product_type || ''} onChange={e => update(p, 'product_type', e.target.value)}>
                        <option value=''>-- Select --</option>
                        {prodOpts.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                  )}
                  <td style={tdS}><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 600, background: db.bg, color: db.fc }}>{p.dest}</span></td>
                  <td style={tdS}>
                    {isDraft
                      ? <input type="date" defaultValue={p.order_date || ''} onBlur={e => update(p, 'order_date', e.target.value)} style={dateInputS} />
                      : <span style={{ fontSize: 11, color: '#666' }}>{fmtDate(p.order_date)}</span>}
                  </td>
                  <td style={tdS}>
                    <input type="date" defaultValue={p.eta || ''} onBlur={e => update(p, 'eta', e.target.value)} style={dateInputS} />
                    {liveInfo?.expectedDelivery && (
                      <div style={{ fontSize: 9, color: '#27500A', marginTop: 2 }}>
                        AfterShip: {new Date(liveInfo.expectedDelivery).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdS, fontSize: 11 }}>
                    {isDraft
                      ? <input type="number" defaultValue={p.po_value || ''} onBlur={e => update(p, 'po_value', e.target.value ? +e.target.value : null)} style={numInputS} placeholder="0.00" />
                      : fmtMoney(p.po_value)}
                  </td>

                  {/* Tracking cell */}
                  <td style={{ ...tdS, minWidth: 200 }}>
                    <TrackingCell
                      po={p}
                      liveInfo={liveInfo}
                      isLoading={isLoading}
                      statusStyle={statusStyle}
                      onSubmit={handleTrackingSubmit}
                      onClear={() => upsertPO({ ...p, tracking_number: null, carrier_slug: null, tracking_status: null, tracking_label: null, tracking_location: null })}
                    />
                  </td>

                  {showShip && (
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
                  )}
                  <td style={{ ...tdS, fontWeight: 700, minWidth: 80, background: ac.bg, color: ac.fc, border: `1px solid ${ac.border}` }}>{dTxt}</td>
                </tr>
              )
            })}

            {/* Totals row */}
            <tr style={{ background: '#f5f5f3', borderTop: '2px solid #ddd' }}>
              <td colSpan={(isSG ? 1 : 0) + (showShip ? 1 : 0) + 8} style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, textAlign: 'right' }}>
                {rows.length} open POs{total ? `   |   Total committed: ${fmtMoney(total)}` : ''}
              </td>
              <td />
            </tr>

            {/* Add row */}
            <tr style={{ background: '#f8f8f6' }}>
              <td style={tdS}><select style={addSelS} value={addRow.supplier} onChange={e => setAddRow(r => ({...r, supplier: e.target.value}))}><option value=''>Supplier</option>{suppliers.map(s => <option key={s} value={s}>{s}</option>)}</select></td>
              <td style={tdS}><input style={addInpS} placeholder="PO #" value={addRow.id} onChange={e => setAddRow(r => ({...r, id: e.target.value}))} /></td>
              <td style={tdS}><select style={addSelS} value={addRow.status} onChange={e => setAddRow(r => ({...r, status: e.target.value}))}><option>Draft</option><option>Committed</option></select></td>
              {isSG && <td style={tdS}><select style={addSelS} value={addRow.product_type} onChange={e => setAddRow(r => ({...r, product_type: e.target.value}))}><option value=''>Product</option>{prodOpts.map(o => <option key={o} value={o}>{o}</option>)}</select></td>}
              <td style={tdS}><select style={addSelS} value={addRow.dest || defaultDest} onChange={e => setAddRow(r => ({...r, dest: e.target.value}))}>{destOpts.map(d => <option key={d} value={d}>{d}</option>)}</select></td>
              <td style={tdS}><input type="date" style={addInpS} value={addRow.order_date} onChange={e => setAddRow(r => ({...r, order_date: e.target.value}))} /></td>
              <td style={tdS}><input type="date" style={addInpS} value={addRow.eta} onChange={e => setAddRow(r => ({...r, eta: e.target.value}))} /></td>
              <td style={tdS}><input type="number" style={{ ...addInpS, width: 88 }} placeholder="Value $" value={addRow.po_value} onChange={e => setAddRow(r => ({...r, po_value: e.target.value}))} /></td>
              <td style={tdS}><button style={{ padding: '5px 10px', background: '#1F3864', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 500, cursor: 'pointer' }} onClick={submitAdd}>+ Add</button></td>
              {showShip && <td style={tdS} />}
              <td style={tdS} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tracking cell component ───────────────────────────────────────────────
function TrackingCell({ po, liveInfo, isLoading, statusStyle, onSubmit, onClear }) {
  const [trackNum, setTrackNum] = useState(po.tracking_number || '')
  const [carrier, setCarrier] = useState(po.carrier_slug || '')
  const [showCheckpoints, setShowCheckpoints] = useState(false)
  const hasTracking = po.tracking_number && po.carrier_slug

  if (hasTracking) {
    return (
      <div style={{ fontSize: 10 }}>
        {/* Carrier + number */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
          <span style={{ fontWeight: 600, color: '#333' }}>
            {OCEAN_CARRIERS.find(c => c.slug === po.carrier_slug)?.name || po.carrier_slug}
          </span>
          <span style={{ fontFamily: 'monospace', color: '#666' }}>{po.tracking_number}</span>
        </div>
        {/* Live status badge */}
        {isLoading && <div style={{ color: '#888', fontStyle: 'italic' }}>Refreshing…</div>}
        {liveInfo && statusStyle && (
          <div style={{ marginBottom: 3 }}>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: statusStyle.bg, color: statusStyle.color }}>
              {liveInfo.statusLabel}
            </span>
            {liveInfo.lastLocation && (
              <span style={{ color: '#666', marginLeft: 5 }}>📍 {liveInfo.lastLocation}</span>
            )}
          </div>
        )}
        {!liveInfo && !isLoading && po.carrier_slug !== 'other' && (
          <div style={{ color: '#888', fontStyle: 'italic', fontSize: 9 }}>
            {process.env.REACT_APP_AFTERSHIP_API_KEY ? 'Fetching status…' : 'Add AfterShip key for live status'}
          </div>
        )}
        {/* Checkpoints toggle */}
        {liveInfo?.checkpoints?.length > 0 && (
          <div>
            <button onClick={() => setShowCheckpoints(v => !v)} style={{ fontSize: 9, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
              {showCheckpoints ? 'Hide history' : `Show ${liveInfo.checkpoints.length} updates`}
            </button>
            {showCheckpoints && (
              <div style={{ marginTop: 4, borderTop: '1px solid #eee', paddingTop: 4 }}>
                {liveInfo.checkpoints.map((cp, i) => (
                  <div key={i} style={{ marginBottom: 3, color: '#555' }}>
                    <span style={{ fontWeight: 500 }}>{new Date(cp.time).toLocaleDateString()}</span>
                    {cp.location && <span> · {cp.location}</span>}
                    {cp.message && <div style={{ color: '#888', fontSize: 9 }}>{cp.message}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button onClick={onClear} style={{ fontSize: 9, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', marginTop: 2 }}>
          remove
        </button>
      </div>
    )
  }

  // No tracking yet — show entry form
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <select
        style={{ fontSize: 10, padding: '3px 4px', border: '1px solid #ddd', borderRadius: 4, width: '100%' }}
        value={carrier}
        onChange={e => setCarrier(e.target.value)}
      >
        <option value=''>Select carrier…</option>
        {OCEAN_CARRIERS.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 3 }}>
        <input
          type="text"
          placeholder="Tracking number"
          value={trackNum}
          onChange={e => setTrackNum(e.target.value)}
          style={{ fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, flex: 1, fontFamily: 'monospace' }}
        />
        <button
          onClick={() => onSubmit(po, trackNum, carrier)}
          disabled={!trackNum || !carrier}
          style={{ fontSize: 10, padding: '3px 8px', background: carrier && trackNum ? '#1F3864' : '#ccc', color: '#fff', border: 'none', borderRadius: 4, cursor: carrier && trackNum ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
        >
          Track
        </button>
      </div>
    </div>
  )
}

const thS = { background: '#f5f5f3', fontSize: 10, fontWeight: 500, color: '#666', padding: '7px 8px', textAlign: 'center', borderRight: '1px solid #eee', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap', letterSpacing: '.04em', textTransform: 'uppercase' }
const tdS = { padding: '7px 8px', borderRight: '1px solid #eee', fontSize: 12, textAlign: 'center', verticalAlign: 'middle' }
const selS = { fontSize: 11, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' }
const dateInputS = { fontSize: 11, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: 110, cursor: 'pointer' }
const numInputS = { fontSize: 11, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: 90 }
const addSelS = { fontSize: 11, padding: '3px 4px', border: '1px solid #ddd', borderRadius: 4, width: '100%' }
const addInpS = { fontSize: 11, padding: '3px 4px', border: '1px solid #ddd', borderRadius: 4, width: '100%' }
