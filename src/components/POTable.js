import React, { useState, useEffect } from 'react'
import { SUPP_COLORS, SG_PRODUCTS, RT_PRODUCTS, daysUntil, arrivalColor, fmtDate, fmtMoney } from '../constants'
import { CARRIERS, detectCarrier, registerTracking, getTracking } from '../tracking'

// Safe string — converts anything to displayable text
function safeStr(val) {
  if (val == null) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object') {
    if (val.city || val.country) return [val.city, val.state, val.country].filter(Boolean).join(', ')
    return JSON.stringify(val)
  }
  return String(val)
}

export default function POTable({ tableId, pos, isSG, showShip, upsertPO, deletePO, showModal, closeModal }) {
  const [trackingInfo, setTrackingInfo] = useState({})
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

  // Only load tracking on mount, not on every render — preserve quota
  useEffect(() => {
    rows.forEach(async p => {
      if (p.tracking_number && !trackingInfo[p.id] && !loadingTracking[p.id]) {
        setLoadingTracking(prev => ({ ...prev, [p.id]: true }))
        try {
          const info = await getTracking(p.tracking_number)
          if (info) setTrackingInfo(prev => ({ ...prev, [p.id]: info }))
        } catch (e) {
          console.error('Tracking error', p.id, e)
        }
        setLoadingTracking(prev => ({ ...prev, [p.id]: false }))
      }
    })
  }, [rows.map(r => r.id + (r.tracking_number || '')).join(',')])

  const update = (p, field, val) => upsertPO({ ...p, [field]: val ?? null })

  const handleTrackingSubmit = async (p, trackingNumber) => {
    if (!trackingNumber) return
    const detected = detectCarrier(trackingNumber)
    await upsertPO({ ...p, tracking_number: trackingNumber, carrier_slug: detected?.code || '0' })
    await registerTracking(trackingNumber)
    setTimeout(async () => {
      setLoadingTracking(prev => ({ ...prev, [p.id]: true }))
      try {
        const info = await getTracking(trackingNumber)
        if (info) setTrackingInfo(prev => ({ ...prev, [p.id]: info }))
      } catch (e) { console.error(e) }
      setLoadingTracking(prev => ({ ...prev, [p.id]: false }))
    }, 2000)
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

  const statusColor = s => s === 'Committed' ? { bg: '#E6F1FB', fc: '#0C447C' } : s === 'Draft' ? { bg: '#FAEEDA', fc: '#633806' } : s === 'Complete' ? { bg: '#EAF3DE', fc: '#27500A' } : { bg: '#FCEBEB', fc: '#A32D2D' }

  const submitAdd = () => {
    if (!addRow.supplier || !addRow.id) return
    upsertPO({ id: addRow.id, supplier: addRow.supplier, status: addRow.status, dest: addRow.dest || defaultDest, entity, table_id: tableId, order_date: addRow.order_date || null, eta: addRow.eta || null, po_value: addRow.po_value ? +addRow.po_value : null, product_type: addRow.product_type || null })
    setAddRow({ supplier: '', id: '', status: 'Committed', dest: '', order_date: '', eta: '', po_value: '', product_type: '' })
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
              <th style={{ ...thS, minWidth: 220 }}>Tracking</th>
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
              const info = trackingInfo[p.id]
              const isLoading = loadingTracking[p.id]

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
                    {info?.eta && <div style={{ fontSize: 9, color: '#27500A', marginTop: 2 }}>17T: {safeStr(info.eta)}</div>}
                  </td>
                  <td style={{ ...tdS, fontSize: 11 }}>
                    {isDraft
                      ? <input type="number" defaultValue={p.po_value || ''} onBlur={e => update(p, 'po_value', e.target.value ? +e.target.value : null)} style={numInputS} placeholder="0.00" />
                      : fmtMoney(p.po_value)}
                  </td>
                  <td style={{ ...tdS, minWidth: 220 }}>
                    <TrackingCell
                      po={p}
                      info={info}
                      isLoading={isLoading}
                      onSubmit={handleTrackingSubmit}
                      onClear={() => {
                        upsertPO({ ...p, tracking_number: null, carrier_slug: null })
                        setTrackingInfo(prev => { const n = {...prev}; delete n[p.id]; return n })
                      }}
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
            <tr style={{ background: '#f5f5f3', borderTop: '2px solid #ddd' }}>
              <td colSpan={(isSG ? 1 : 0) + (showShip ? 1 : 0) + 8} style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, textAlign: 'right' }}>
                {rows.length} open POs{total ? `   |   Total committed: ${fmtMoney(total)}` : ''}
              </td>
              <td />
            </tr>
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

function TrackingCell({ po, info, isLoading, onSubmit, onClear }) {
  const [trackNum, setTrackNum] = useState(po.tracking_number || '')
  const [detected, setDetected] = useState(null)
  const [showEvents, setShowEvents] = useState(false)

  useEffect(() => { setTrackNum(po.tracking_number || '') }, [po.tracking_number])

  const handleChange = (val) => {
    setTrackNum(val)
    setDetected(detectCarrier(val))
  }

  const hasTracking = !!po.tracking_number
  const carrierName = info?.resolvedCarrier
    || (po.carrier_slug ? CARRIERS.find(c => c.code === po.carrier_slug)?.name : null)
    || (po.tracking_number ? detectCarrier(po.tracking_number)?.name : null)
    || null

  if (hasTracking) {
    return (
      <div style={{ fontSize: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
          {carrierName && <span style={{ background: '#E6F1FB', color: '#0C447C', fontSize: 9, padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>{carrierName}</span>}
          <span style={{ fontFamily: 'monospace', color: '#333', fontWeight: 600 }}>{po.tracking_number}</span>
        </div>
        {isLoading && <div style={{ color: '#888', fontStyle: 'italic', fontSize: 9 }}>Fetching status…</div>}
        {info && !isLoading && (
          <div>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: info.statusStyle?.bg || '#f5f5f5', color: info.statusStyle?.color || '#888' }}>
              {safeStr(info.statusIcon)} {safeStr(info.statusLabel)}
            </span>
            {info.lastLocation && <div style={{ color: '#555', marginTop: 2, fontSize: 9 }}>📍 {safeStr(info.lastLocation)}</div>}
            {info.lastTime && <div style={{ color: '#888', fontSize: 9 }}>{safeStr(info.lastTime)}</div>}
            {info.events?.length > 0 && (
              <button onClick={() => setShowEvents(v => !v)} style={{ fontSize: 9, color: '#0C447C', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', marginTop: 2 }}>
                {showEvents ? 'Hide history' : `${info.events.length} updates`}
              </button>
            )}
            {showEvents && (
              <div style={{ marginTop: 4, borderTop: '1px solid #eee', paddingTop: 4, maxHeight: 120, overflowY: 'auto' }}>
                {info.events.map((ev, i) => (
                  <div key={i} style={{ marginBottom: 4, fontSize: 9 }}>
                    <div style={{ fontWeight: 500 }}>{safeStr(ev.time)}</div>
                    {ev.location && <div>📍 {safeStr(ev.location)}</div>}
                    {ev.message && <div style={{ color: '#888' }}>{safeStr(ev.message)}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {!info && !isLoading && (
          <div style={{ color: '#888', fontSize: 9, fontStyle: 'italic' }}>No status yet</div>
        )}
        <button onClick={onClear} style={{ fontSize: 9, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', marginTop: 3 }}>remove</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input
        type="text"
        placeholder="Paste tracking number"
        value={trackNum}
        onChange={e => handleChange(e.target.value)}
        style={{ fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: '100%', fontFamily: 'monospace' }}
      />
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: detected ? '#27500A' : '#aaa', background: detected ? '#EAF3DE' : '#f5f5f5', padding: '2px 6px', borderRadius: 4, flex: 1 }}>
          {detected ? `✓ ${detected.name}` : 'Enter number to detect carrier'}
        </span>
        <button
          onClick={() => trackNum && onSubmit(po, trackNum)}
          disabled={!trackNum}
          style={{ fontSize: 10, padding: '3px 8px', background: trackNum ? '#1F3864' : '#ccc', color: '#fff', border: 'none', borderRadius: 4, cursor: trackNum ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
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
