import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { SUPP_COLORS, SG_PRODUCTS, RT_PRODUCTS, daysUntil, arrivalColor, fmtDate, fmtMoney } from '../constants'
import { detectCarrier, registerTracking, getTracking, isDirectOnly, getDirectUrl } from '../tracking'
import PODocsCell from './PODocsCell'

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

// Format any date/datetime string to M/D/YYYY
function fmtTrackDate(val) {
  if (!val) return ''
  try {
    const s = typeof val === 'string' ? val : JSON.stringify(val)
    const match = s.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (!match) return s.replace(/T.*/, '')
    const [, year, month, day] = match
    return `${parseInt(month)}/${parseInt(day)}/${year}`
  } catch (e) { return '' }
}

// Helper: receive-date display used throughout the app for AWD/FBA rows
// Returns { dateText, subText } where subText is short ("in 14d" / "3d overdue" / "Today")
export function receiveDateDisplay(etaIso) {
  if (!etaIso) return { dateText: 'TBD', subText: '' }
  const days = daysUntil(etaIso)
  const dateText = fmtTrackDate(etaIso)
  let subText = ''
  if (days !== null) {
    if (days < 0) subText = `${Math.abs(days)}d overdue`
    else if (days === 0) subText = 'Today'
    else subText = `in ${days}d`
  }
  return { dateText, subText }
}

// ContainerRow — one tracking entry per container within an AWD PO.
// Each container has its OWN eta, box_count and dest so different containers
// arriving separately can be tracked independently.
function ContainerRow({ container, poDest, onUpdate, onDelete }) {
  const [trackingInfo, setTrackingInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [val, setVal] = useState(container.tracking_number || '')

  useEffect(() => {
    if (container.tracking_number && !isDirectOnly(container.tracking_number)) {
      setLoading(true)
      getTracking(container.tracking_number)
        .then(info => setTrackingInfo(info))
        .finally(() => setLoading(false))
    }
  }, [container.tracking_number])

  const handleBlur = async () => {
    const trimmed = val.trim()
    if (trimmed === container.tracking_number) return
    await onUpdate(container.id, { tracking_number: trimmed || null })
    if (trimmed) {
      await registerTracking(trimmed)
      setTimeout(async () => {
        const info = await getTracking(trimmed)
        setTrackingInfo(info)
        // Auto-fill ETA from tracking if the container doesn't have one yet
        if (info?.eta && !container.eta) {
          const m = String(info.eta).match(/(\d{4})-(\d{2})-(\d{2})/)
          if (m) onUpdate(container.id, { eta: `${m[1]}-${m[2]}-${m[3]}` })
        }
      }, 2000)
    }
  }

  const detected = detectCarrier(val || container.tracking_number || '')
  const directUrl = container.tracking_number ? getDirectUrl(container.tracking_number) : null
  const isDirect = container.tracking_number ? isDirectOnly(container.tracking_number) : false

  const { dateText, subText } = receiveDateDisplay(container.eta)
  const rc = arrivalColor(daysUntil(container.eta))

  // Destination options — if the parent PO is SG default options are AWD/FBA, else AWD/FBA/RT AWD
  const destOpts = ['AWD', 'FBA', 'RT AWD']

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px dashed #e0e0e0', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, color: '#888', minWidth: 60, paddingTop: 4 }}>Container {container.container_num}</span>

      {/* Tracking input */}
      <div style={{ flex: 1, minWidth: 150 }}>
        <input
          type="text"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={handleBlur}
          placeholder="Enter tracking #"
          style={{ fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: '100%', fontFamily: 'monospace' }}
        />
        {detected && !container.tracking_number && (
          <div style={{ fontSize: 9, color: '#27500A', background: '#EAF3DE', padding: '2px 5px', borderRadius: 3, marginTop: 2 }}>✓ {detected.name}</div>
        )}
      </div>

      {/* Dest per container */}
      <div style={{ minWidth: 80 }}>
        <div style={{ fontSize: 9, color: '#888', marginBottom: 2 }}>Dest</div>
        <select
          value={container.dest || poDest || ''}
          onChange={e => onUpdate(container.id, { dest: e.target.value || null })}
          style={{ fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: '100%' }}
        >
          <option value=''>--</option>
          {destOpts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Boxes per container */}
      <div style={{ minWidth: 70 }}>
        <div style={{ fontSize: 9, color: '#888', marginBottom: 2 }}>Boxes</div>
        <input
          type="number"
          defaultValue={container.box_count || ''}
          placeholder="#"
          onBlur={e => {
            const v = e.target.value ? parseInt(e.target.value) : null
            onUpdate(container.id, { box_count: !isNaN(v) ? v : null })
          }}
          style={{ fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: '100%' }}
        />
      </div>

      {/* ETA input — each container can have a different receive date */}
      <div style={{ minWidth: 120 }}>
        <div style={{ fontSize: 9, color: '#888', marginBottom: 2 }}>Est. Receive</div>
        <input
          type="date"
          defaultValue={container.eta || ''}
          onBlur={e => onUpdate(container.id, { eta: e.target.value || null })}
          style={{ fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: '100%' }}
        />
        {container.eta && (
          <div style={{ fontSize: 9, marginTop: 2, padding: '2px 5px', borderRadius: 3, background: rc.bg, color: rc.fc, textAlign: 'center' }}>
            {dateText}{subText ? ` (${subText})` : ''}
          </div>
        )}
      </div>

      {/* Status */}
      <div style={{ minWidth: 140, fontSize: 10 }}>
        {loading && <span style={{ color: '#888', fontStyle: 'italic' }}>Checking…</span>}
        {isDirect && directUrl && (
          <a href={directUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, padding: '2px 8px', background: '#0C447C', color: '#fff', borderRadius: 5, textDecoration: 'none', fontWeight: 600 }}>
            Track on {detected?.name} →
          </a>
        )}
        {!isDirect && trackingInfo && (
          <div>
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, fontWeight: 600, background: trackingInfo.statusStyle?.bg || '#f5f5f5', color: trackingInfo.statusStyle?.color || '#888' }}>
              {safeStr(trackingInfo.statusIcon)} {safeStr(trackingInfo.statusLabel)}
            </span>
            {trackingInfo.lastTime && <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>{fmtTrackDate(trackingInfo.lastTime)}</div>}
            {trackingInfo.lastLocation && <div style={{ fontSize: 9, color: '#555' }}>📍 {safeStr(trackingInfo.lastLocation)}</div>}
          </div>
        )}
        {!isDirect && !trackingInfo && !loading && container.tracking_number && (
          <span style={{ fontSize: 9, color: '#aaa', fontStyle: 'italic' }}>No status yet</span>
        )}
      </div>

      {/* Delete container */}
      <button onClick={() => onDelete(container.id)}
        style={{ fontSize: 10, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', flexShrink: 0, alignSelf: 'center' }}>✕</button>
    </div>
  )
}

// AWD PO Row — expandable with sub-containers. Exported so SGTab can reuse it.
export function AWDPORow({ po, upsertPO }) {
  const [expanded, setExpanded] = useState(false)
  const [containers, setContainers] = useState([])
  const [loadingContainers, setLoadingContainers] = useState(false)

  const sc = SUPP_COLORS[po.supplier] || { bg: '#f5f5f5', fc: '#333', b: '#ccc' }
  const opts = po.entity === 'SG' ? SG_PRODUCTS : RT_PRODUCTS

  const loadContainers = useCallback(async () => {
    setLoadingContainers(true)
    const { data } = await supabase.from('awd_containers').select('*').eq('po_id', po.id).order('container_num')
    setContainers(data || [])
    setLoadingContainers(false)
  }, [po.id])

  useEffect(() => {
    if (expanded) loadContainers()
  }, [expanded, loadContainers])

  // Compute the earliest container ETA so the main row summary always reflects
  // the earliest receive date across all containers. Falls back to po.eta.
  const earliestContainerEta = containers.reduce((best, c) => {
    if (!c.eta) return best
    if (!best) return c.eta
    return new Date(c.eta) < new Date(best) ? c.eta : best
  }, null)
  const effectiveEta = earliestContainerEta || po.eta
  const { dateText, subText } = receiveDateDisplay(effectiveEta)
  const ac = arrivalColor(daysUntil(effectiveEta))

  const totalBoxes = containers.reduce((sum, c) => sum + (c.box_count || 0), 0)

  const addContainer = async () => {
    const nextNum = containers.length > 0 ? Math.max(...containers.map(c => c.container_num)) + 1 : 1
    const { data } = await supabase.from('awd_containers').insert({
      po_id: po.id,
      container_num: nextNum,
      dest: po.dest || null,
      eta: po.eta || null,
    }).select().single()
    if (data) setContainers(prev => [...prev, data])
  }

  const updateContainer = async (containerId, updates) => {
    await supabase.from('awd_containers').update(updates).eq('id', containerId)
    setContainers(prev => prev.map(c => c.id === containerId ? { ...c, ...updates } : c))
  }

  const deleteContainer = async (containerId) => {
    await supabase.from('awd_containers').delete().eq('id', containerId)
    setContainers(prev => prev.filter(c => c.id !== containerId))
  }

  const update = (field, val) => upsertPO({ ...po, [field]: val || null })

  // Destination badge color
  const db = po.dest === 'AWD' || po.dest === 'RT AWD' ? { bg: '#E6F1FB', fc: '#0C447C' }
           : po.dest === 'FBA' ? { bg: '#EEEDFE', fc: '#3C3489' }
           : { bg: '#F1EFE8', fc: '#444441' }

  return (
    <>
      <tr style={{ background: sc.bg + '18', borderBottom: expanded ? 'none' : '1px solid #f0f0f0', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}>
        <td style={{ ...tdS, fontWeight: 700, background: sc.bg, color: sc.fc, borderLeft: `3px solid ${sc.b}`, textAlign: 'left', minWidth: 140 }}>
          <span style={{ marginRight: 6, fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>{safeStr(po.supplier)}
        </td>
        <td style={{ ...tdS, fontFamily: 'monospace', fontSize: 11, color: '#666' }} onClick={e => e.stopPropagation()}>#{safeStr(po.id)}</td>
        <td style={tdS} onClick={e => e.stopPropagation()}>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: po.entity === 'RT' ? '#E6F1FB' : '#EAF3DE', color: po.entity === 'RT' ? '#0C447C' : '#27500A' }}>{safeStr(po.entity)}</span>
        </td>
        <td style={tdS} onClick={e => e.stopPropagation()}>
          <select style={selS} value={po.dest || ''} onChange={e => update('dest', e.target.value)}>
            <option value=''>--</option>
            <option value='AWD'>AWD</option>
            <option value='FBA'>FBA</option>
            <option value='RT AWD'>RT AWD</option>
          </select>
          {po.dest && (
            <div style={{ marginTop: 3 }}>
              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 600, background: db.bg, color: db.fc }}>{po.dest}</span>
            </div>
          )}
        </td>
        <td style={{ ...tdS, minWidth: 120 }} onClick={e => e.stopPropagation()}>
          <select style={selS} value={po.product_type || ''} onChange={e => update('product_type', e.target.value)}>
            <option value=''>--</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </td>
        <td style={tdS} onClick={e => e.stopPropagation()}>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 600, background: po.status === 'Committed' ? '#E6F1FB' : '#FAEEDA', color: po.status === 'Committed' ? '#0C447C' : '#633806' }}>{safeStr(po.status)}</span>
        </td>
        <td style={{ ...tdS, fontSize: 11, color: '#666' }} onClick={e => e.stopPropagation()}>{fmtDate(po.order_date)}</td>
        <td style={tdS} onClick={e => e.stopPropagation()}>
          <input type="date" defaultValue={po.eta || ''} onBlur={e => update('eta', e.target.value)} style={{ fontSize: 11, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: 110 }} />
        </td>
        <td style={{ ...tdS, fontSize: 11 }} onClick={e => e.stopPropagation()}>{fmtMoney(po.po_value)}</td>
        <td style={{ ...tdS, minWidth: 70, textAlign: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#0C447C' }}>
            {totalBoxes > 0 ? totalBoxes : (po.box_count || '—')}
          </span>
        </td>
        <td style={{ ...tdS, minWidth: 80, textAlign: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#0C447C' }}>
            {containers.length > 0 ? `${containers.length} container${containers.length > 1 ? 's' : ''}` : '—'}
          </span>
        </td>
        <td style={{ ...tdS, minWidth: 190 }} onClick={e => e.stopPropagation()}>
          <PODocsCell poId={po.id} />
        </td>
        <td style={{ ...tdS, fontWeight: 700, minWidth: 110, background: ac.bg, color: ac.fc, border: `1px solid ${ac.border}` }}>
          <div>
            <div style={{ fontSize: 11 }}>{dateText}</div>
            {subText && <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1 }}>{subText}</div>}
          </div>
        </td>
      </tr>

      {/* Expanded containers panel */}
      {expanded && (
        <tr>
          <td colSpan={13} style={{ padding: '12px 20px 16px', background: '#f0f6fb', borderBottom: '2px solid #b7d0e2' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1F3864' }}>
                Containers for PO #{safeStr(po.id)} — {safeStr(po.supplier)}
              </span>
              <button onClick={addContainer}
                style={{ fontSize: 11, padding: '5px 14px', background: '#1F3864', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>
                + Add Container
              </button>
            </div>
            {loadingContainers && <div style={{ color: '#888', fontSize: 11, fontStyle: 'italic' }}>Loading…</div>}
            {!loadingContainers && containers.length === 0 && (
              <div style={{ color: '#aaa', fontSize: 11, fontStyle: 'italic', padding: '8px 0' }}>
                No containers yet — click "+ Add Container" to start adding tracking numbers, receive dates, boxes, and destinations per container
              </div>
            )}
            {containers.map(c => (
              <ContainerRow key={c.id} container={c} poDest={po.dest}
                onUpdate={updateContainer} onDelete={deleteContainer} />
            ))}
          </td>
        </tr>
      )}
    </>
  )
}

// AWDPOTable — renders the expandable row table. Exported so SGTab can reuse it
// filtered to SG-entity rows.
export function AWDPOTable({ pos, upsertPO, entityFilter }) {
  const awdPos = pos
    .filter(p => p.dest === 'AWD' || p.dest === 'FBA' || p.dest === 'RT AWD')
    .filter(p => !entityFilter || p.entity === entityFilter)
    .sort((a, b) => {
      if (!a.eta && !b.eta) return 0
      if (!a.eta) return 1
      if (!b.eta) return -1
      return new Date(a.eta) - new Date(b.eta)
    })
  const totalVal = awdPos.reduce((s, p) => s + (p.po_value || 0), 0)

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {['Supplier','PO #','Entity','Dest','Product','Status','Order Date','ETA','PO Value','Boxes','Containers','Docs','Est. Receive Date'].map(h => (
              <th key={h} style={thS}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {awdPos.length === 0 && (
            <tr><td colSpan={13} style={{ padding: 30, textAlign: 'center', color: '#888', fontSize: 12 }}>No open AWD/FBA POs.</td></tr>
          )}
          {awdPos.map(p => (
            <AWDPORow key={p.id} po={p} upsertPO={upsertPO} />
          ))}
          {awdPos.length > 0 && (
            <tr style={{ background: '#f5f5f5', borderTop: '2px solid #ddd' }}>
              <td colSpan={12} style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, textAlign: 'right' }}>
                {awdPos.length} open POs{totalVal ? `   |   Total committed: ${fmtMoney(totalVal)}` : ''}
              </td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function AWDTab({ pos, upsertPO, deletePO, showModal, closeModal }) {
  const [addRow, setAddRow] = useState({ supplier: '', id: '', status: 'Committed', dest: 'AWD', entity: 'RT', order_date: '', eta: '', po_value: '', product_type: '' })

  const awdPos = pos
    .filter(p => p.dest === 'AWD' || p.dest === 'FBA' || p.dest === 'RT AWD')

  const suppliers = ['Dongyang Shanye Fishing', 'I-Lure', 'Sourcepro', 'WEIGHT CO', 'JXL', 'Weihai Huayue Sports', 'XINGTAI XIOU IMPORT', 'CNBM INTERNATIONAL']
  const destOpts = ['AWD', 'FBA', 'RT AWD']

  const submitAdd = () => {
    if (!addRow.supplier || !addRow.id) return
    upsertPO({
      id: addRow.id, supplier: addRow.supplier, status: addRow.status,
      dest: addRow.dest, entity: addRow.entity, table_id: addRow.entity === 'SG' ? 'sg-awdfba' : 'rt-awd',
      order_date: addRow.order_date || null, eta: addRow.eta || null,
      po_value: addRow.po_value ? +addRow.po_value : null,
      product_type: addRow.product_type || null
    })
    setAddRow({ supplier: '', id: '', status: 'Committed', dest: 'AWD', entity: 'RT', order_date: '', eta: '', po_value: '', product_type: '' })
  }

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#4d7aaa,#6c91b9)', borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ color: '#000', fontSize: 16, fontWeight: 700, margin: 0 }}>AWD / FBA Shipments</h2>
          <p style={{ color: '#000', fontSize: 11, margin: '2px 0 0' }}>All AWD and FBA inbound orders — click a row to manage containers (each container has its own receive date, boxes and destination)</p>
        </div>
        <div style={{ background: 'rgba(255,255,255,.35)', borderRadius: 8, padding: '8px 16px', textAlign: 'center' }}>
          <div style={{ color: '#000', fontSize: 20, fontWeight: 700 }}>{awdPos.length}</div>
          <div style={{ color: '#000', fontSize: 10 }}>Open POs</div>
        </div>
      </div>

      <AWDPOTable pos={pos} upsertPO={upsertPO} />

      {/* Add row */}
      <div style={{ marginTop: 12, border: '1px solid #ddd', borderRadius: 8, padding: '10px 12px', background: '#f8f8f6' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#1F3864', marginBottom: 8 }}>Add a new AWD/FBA PO</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <select style={addSelS} value={addRow.supplier} onChange={e => setAddRow(r => ({...r, supplier: e.target.value}))}><option value=''>Supplier</option>{suppliers.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <input style={addInpS} placeholder="PO #" value={addRow.id} onChange={e => setAddRow(r => ({...r, id: e.target.value}))} />
          <select style={addSelS} value={addRow.entity} onChange={e => setAddRow(r => ({...r, entity: e.target.value}))}><option value='RT'>RT</option><option value='SG'>SG</option></select>
          <select style={addSelS} value={addRow.dest} onChange={e => setAddRow(r => ({...r, dest: e.target.value}))}>{destOpts.map(d => <option key={d} value={d}>{d}</option>)}</select>
          <input style={addInpS} placeholder="Product" value={addRow.product_type} onChange={e => setAddRow(r => ({...r, product_type: e.target.value}))} />
          <select style={addSelS} value={addRow.status} onChange={e => setAddRow(r => ({...r, status: e.target.value}))}><option>Draft</option><option>Committed</option></select>
          <input type="date" style={addInpS} value={addRow.order_date} onChange={e => setAddRow(r => ({...r, order_date: e.target.value}))} />
          <input type="date" style={addInpS} value={addRow.eta} onChange={e => setAddRow(r => ({...r, eta: e.target.value}))} />
          <input type="number" style={{ ...addInpS, width: 100 }} placeholder="Value $" value={addRow.po_value} onChange={e => setAddRow(r => ({...r, po_value: e.target.value}))} />
          <button style={{ padding: '5px 14px', background: '#1F3864', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 500, cursor: 'pointer' }} onClick={submitAdd}>+ Add PO</button>
        </div>
      </div>
    </div>
  )
}

const thS = { background: '#f5f5f3', fontSize: 10, fontWeight: 500, color: '#666', padding: '7px 8px', textAlign: 'center', borderRight: '1px solid #eee', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap', letterSpacing: '.04em', textTransform: 'uppercase' }
const tdS = { padding: '7px 8px', borderRight: '1px solid #eee', fontSize: 12, textAlign: 'center', verticalAlign: 'middle' }
const selS = { fontSize: 11, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 5, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }
const addSelS = { fontSize: 11, padding: '4px 6px', border: '1px solid #ddd', borderRadius: 4, minWidth: 120 }
const addInpS = { fontSize: 11, padding: '4px 6px', border: '1px solid #ddd', borderRadius: 4, minWidth: 110 }
