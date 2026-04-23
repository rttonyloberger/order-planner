import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { SUPP_COLORS, SG_PRODUCTS, RT_PRODUCTS, daysUntil, arrivalColor, fmtDate, fmtMoney } from '../constants'
import { CARRIERS, detectCarrier, registerTracking, getTracking, isDirectOnly, getDirectUrl } from '../tracking'
import PODocsCell from './PODocsCell'
import PONotesCell from './PONotesCell'

// Today's date as YYYY-MM-DD — used to default the Date Received popup.
function todayIsoStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// Date-received form used inside the Complete modal (via Modal's `children` prop).
function DateReceivedForm({ dateRef, poId }) {
  return (
    <div>
      <p style={{ fontSize: 12, color: '#555', lineHeight: 1.5, marginBottom: 10 }}>
        When was PO #{poId} received? This date will show on the Completed POs tab.
      </p>
      <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 4 }}>Date received</label>
      <input
        type="date"
        defaultValue={dateRef.current}
        onChange={e => { dateRef.current = e.target.value }}
        style={{ fontSize: 13, padding: '7px 10px', border: '1px solid #ccc', borderRadius: 6, width: '100%' }}
      />
    </div>
  )
}

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


// Pull a YYYY-MM-DD substring out of whatever 17TRACK gave us.
function extractIsoDate(val) {
  if (!val || typeof val !== 'string') return null
  const m = val.match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
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
  // Container map keyed by po_id. Loaded in bulk so rows can show their
  // container count and (when expanded) per-container ETAs without each row
  // firing its own query.
  const [containerMap, setContainerMap] = useState({})
  const [expandedContainersId, setExpandedContainersId] = useState(null)
  // Per-container tracking info — lifted up to the parent so the BB main row
  // can display aggregated Carrier / Last Update / Tracking Status / Boxes
  // across all containers even when the per-container panel is collapsed.
  // Keyed by container.id.
  const [containerTrackingInfo, setContainerTrackingInfo] = useState({})
  const [containerLoadingIds, setContainerLoadingIds] = useState(new Set())

  const bbPos = pos
    .filter(p => p.dest === 'BB' && p.status !== 'Complete')
    .sort((a, b) => {
      if (!a.eta && !b.eta) return 0
      if (!a.eta) return 1
      if (!b.eta) return -1
      return new Date(a.eta) - new Date(b.eta)
    })

  // Bulk-load containers for every BB PO shown in this tab so each row can
  // render its container count inline and expand to show per-container ETAs.
  useEffect(() => {
    async function loadAllContainers() {
      if (bbPos.length === 0) { setContainerMap({}); return }
      const ids = bbPos.map(p => p.id)
      const { data } = await supabase.from('awd_containers').select('*').in('po_id', ids).order('container_num')
      const byPO = {}
      for (const c of (data || [])) {
        if (!byPO[c.po_id]) byPO[c.po_id] = []
        byPO[c.po_id].push(c)
      }
      setContainerMap(byPO)
    }
    loadAllContainers()
  }, [bbPos.map(p => p.id).join(',')])

  const loadOne = useCallback(async (po) => {
    if (!po.tracking_number) return
    setLoadingIds(prev => new Set([...prev, po.id]))
    try {
      const info = await getTracking(po.tracking_number)
      setTrackingInfo(prev => ({ ...prev, [po.id]: info || { noData: true } }))
      // Auto-overwrite p.eta whenever tracking returns a new eta — tracking
      // is the source of truth, manual entry is just a starting placeholder.
      if (info) {
        const iso = extractIsoDate(info.eta)
        if (iso && iso !== po.eta) upsertPO({ ...po, eta: iso })
      }
    } catch (e) {
      console.error('Tracking error for', po.id, e)
      setTrackingInfo(prev => ({ ...prev, [po.id]: { noData: true } }))
    }
    setLoadingIds(prev => { const n = new Set(prev); n.delete(po.id); return n })
  }, [upsertPO])

  useEffect(() => {
    const withTracking = bbPos.filter(p => p.tracking_number)
    withTracking.forEach(po => { if (!trackingInfo[po.id]) loadOne(po) })
    if (withTracking.length) setLastRefresh(new Date())
  }, [bbPos.map(p => p.id).join(',')])

  const handleRefreshAll = useCallback(async () => {
    setRefreshing(true)
    for (const po of bbPos.filter(p => p.tracking_number)) await loadOne(po)
    setLastRefresh(new Date())
    setRefreshing(false)
  }, [bbPos, loadOne])

  // Keep "in Nd" / ETA fresh: re-fetch tracking every 10 minutes while the
  // tab is visible and whenever the window regains focus. daysUntil(p.eta)
  // already recalculates relative to today on every render, so pairing that
  // with periodic eta syncs from 17TRACK prevents the stale "in 17d" problem.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible' && bbPos.some(p => p.tracking_number)) {
        handleRefreshAll()
      }
    }, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [handleRefreshAll, bbPos])

  useEffect(() => {
    const onFocus = () => {
      if (bbPos.some(p => p.tracking_number)) handleRefreshAll()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [handleRefreshAll, bbPos])

  const update = (po, field, val) => upsertPO({ ...po, [field]: val || null })

  const handleAddTracking = async (po, trackingNumber) => {
    if (!trackingNumber) return
    const auto = detectCarrier(trackingNumber)
    await upsertPO({ ...po, tracking_number: trackingNumber, carrier_slug: auto?.code || '0' })
    await registerTracking(trackingNumber)
    // loadOne will now auto-sync p.eta once tracking returns a date.
    setTimeout(() => loadOne({ ...po, tracking_number: trackingNumber, carrier_slug: auto?.code || '0' }), 3000)
  }

  const handleMarkComplete = (po) => {
    // Ask for the actual date received, then flip status to Complete (no
    // delete) so the PO lands on the Completed POs archive tab.
    const dateRef = { current: po.received_date || todayIsoStr() }
    showModal({
      title: 'Mark as Complete',
      confirmLabel: 'Mark as Received',
      children: <DateReceivedForm dateRef={dateRef} poId={po.id} />,
      onConfirm: () => {
        upsertPO({ ...po, status: 'Complete', received_date: dateRef.current || todayIsoStr() })
        closeModal()
      }
    })
  }

  // Per-container CRUD used by the BB expanded panel. All writes update the
  // local containerMap so the row count / expanded sub-rows stay in sync
  // without a full reload.
  const addContainer = async (po) => {
    const existing = containerMap[po.id] || []
    const nextNum = existing.length > 0 ? Math.max(...existing.map(c => c.container_num)) + 1 : 1
    const { data } = await supabase.from('awd_containers').insert({
      po_id: po.id,
      container_num: nextNum,
      eta: po.eta || null,
    }).select().single()
    if (data) setContainerMap(prev => ({ ...prev, [po.id]: [...(prev[po.id] || []), data] }))
  }

  const updateContainer = async (poId, containerId, updates) => {
    await supabase.from('awd_containers').update(updates).eq('id', containerId)
    setContainerMap(prev => ({
      ...prev,
      [poId]: (prev[poId] || []).map(c => c.id === containerId ? { ...c, ...updates } : c)
    }))
  }

  const deleteContainer = async (poId, containerId) => {
    await supabase.from('awd_containers').delete().eq('id', containerId)
    setContainerMap(prev => ({
      ...prev,
      [poId]: (prev[poId] || []).filter(c => c.id !== containerId)
    }))
    // Drop any cached tracking info for the deleted container.
    setContainerTrackingInfo(prev => { const n = { ...prev }; delete n[containerId]; return n })
  }

  // Fetch 17TRACK info for a single container and cache it on
  // containerTrackingInfo[container.id]. Also auto-writes the container's eta
  // when tracking returns a new date — same pattern as loadOne(po).
  const loadContainerOne = useCallback(async (container) => {
    if (!container.tracking_number) return
    if (isDirectOnly(container.tracking_number)) return
    setContainerLoadingIds(prev => new Set([...prev, container.id]))
    try {
      const info = await getTracking(container.tracking_number)
      setContainerTrackingInfo(prev => ({ ...prev, [container.id]: info || { noData: true } }))
      if (info) {
        const iso = extractIsoDate(info.eta)
        if (iso && iso !== container.eta) {
          await supabase.from('awd_containers').update({ eta: iso }).eq('id', container.id)
          setContainerMap(prev => ({
            ...prev,
            [container.po_id]: (prev[container.po_id] || []).map(c =>
              c.id === container.id ? { ...c, eta: iso } : c
            )
          }))
        }
      }
    } catch (e) {
      console.error('Container tracking error for', container.id, e)
      setContainerTrackingInfo(prev => ({ ...prev, [container.id]: { noData: true } }))
    }
    setContainerLoadingIds(prev => { const n = new Set(prev); n.delete(container.id); return n })
  }, [])

  // Auto-load tracking info for any container that has a tracking number and
  // hasn't been fetched yet. Runs whenever the container map changes.
  useEffect(() => {
    const allContainers = Object.values(containerMap).flat()
    for (const c of allContainers) {
      if (c.tracking_number && !containerTrackingInfo[c.id] && !containerLoadingIds.has(c.id)) {
        loadContainerOne(c)
      }
    }
  }, [containerMap, containerTrackingInfo, containerLoadingIds, loadContainerOne])

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
                  {['Supplier','PO #','Entity','Product','PO Status','Order Date','ETA','PO Value','Carrier','Tracking #','Last Update','Tracking Status','Notes','Docs','FCL/LCL','Est. Receive Date'].map(h => (
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
                  // Per-PO container info (pre-loaded in bulk). Containers live
                  // in an expandable sub-panel. The ▶ N containers toggle only
                  // appears when at least one container is saved; otherwise a
                  // small "+ Split into containers" button lets the team add
                  // the first one.
                  const containers = containerMap[p.id] || []
                  const hasAnyContainers = containers.length >= 1
                  const isContainersExpanded = expandedContainersId === p.id

                  // Aggregated container info used to fill the main row's
                  // Carrier / Tracking # / Last Update / Tracking Status /
                  // FCL/LCL cells when containers exist. Without this the
                  // main row would show empty fields even though the team
                  // has already entered tracking info at the container level.
                  const containerInfos = containers.map(c => ({ c, info: containerTrackingInfo[c.id] }))
                  const containerCarriers = [...new Set(containers.map(c => {
                    const info = containerTrackingInfo[c.id]
                    if (info && !info.noData && info.resolvedCarrier) return info.resolvedCarrier
                    const det = detectCarrier(c.tracking_number)
                    return det?.name
                  }).filter(Boolean))]
                  const containerLastTimes = containers
                    .map(c => containerTrackingInfo[c.id]?.lastTime)
                    .filter(Boolean)
                  const latestContainerUpdate = containerLastTimes.length > 0
                    ? containerLastTimes.slice().sort((a, b) => new Date(b) - new Date(a))[0]
                    : null
                  const validContainerInfos = containerInfos
                    .map(x => x.info)
                    .filter(i => i && !i.noData && i.statusCode)
                  const totalContainerBoxes = containers.reduce((s, c) => s + (c.box_count || 0), 0)
                  const containerShipModes = [...new Set(containers.map(c => c.ship_mode).filter(Boolean))]
                  const anyContainerLoading = containers.some(c => containerLoadingIds.has(c.id))
                  // Earliest container eta → drives the main row's Est.
                  // Receive Date and its "days out" coloring when containers
                  // are present. Falls back to p.eta.
                  const earliestContainerEta = containers.reduce((best, c) => {
                    if (!c.eta) return best
                    if (!best) return c.eta
                    return new Date(c.eta) < new Date(best) ? c.eta : best
                  }, null)
                  const effectiveEta = hasAnyContainers ? (earliestContainerEta || p.eta) : p.eta
                  const effectiveDays = daysUntil(effectiveEta)
                  const effectiveAc = arrivalColor(effectiveDays)

                  // Days away cell — show Delivered if delivered
                  const dTxt = days === null ? 'TBD' : days < 0 ? `${Math.abs(days)}d overdue` : `${days} days`
                  const dStyle = isDelivered ? { bg: '#EAF3DE', fc: '#27500A', border: '#639922' } : effectiveAc

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
                        <td style={{ ...tdS, fontWeight: 700, background: isDelivered ? '#EAF3DE' : sc.bg, color: isDelivered ? '#27500A' : sc.fc, borderLeft: `3px solid ${isDelivered ? '#639922' : sc.b}`, textAlign: 'left', minWidth: 140 }}>
                          <div>{safeStr(p.supplier)}</div>
                          {hasAnyContainers ? (
                            <button
                              onClick={() => setExpandedContainersId(isContainersExpanded ? null : p.id)}
                              style={{ marginTop: 4, fontSize: 9, padding: '2px 8px', background: '#1F3864', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              title="Show per-container tracking, notes, docs and ETAs"
                            >
                              {isContainersExpanded ? '▼' : '▶'} {containers.length} container{containers.length > 1 ? 's' : ''}
                            </button>
                          ) : (
                            <button
                              onClick={async () => { await addContainer(p); setExpandedContainersId(p.id) }}
                              style={{ marginTop: 4, fontSize: 9, padding: '2px 8px', background: '#fff', color: '#1F3864', border: '1px dashed #1F3864', borderRadius: 10, cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              title="Split this PO into multiple containers"
                            >
                              + Split into containers
                            </button>
                          )}
                        </td>
                        <td style={{ ...tdS, fontFamily: 'monospace', fontSize: 11, color: '#666' }}>#{safeStr(p.id)}</td>
                        <td style={tdS}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: p.entity === 'RT' ? '#E6F1FB' : '#EAF3DE', color: p.entity === 'RT' ? '#0C447C' : '#27500A' }}>{safeStr(p.entity)}</span></td>
                        {/* Product — read-only on BB Receiving. Edits happen
                            upstream on the RT / SG Draft rows. */}
                        <td style={{ ...tdS, minWidth: 120 }}>
                          <span style={{ fontSize: 11, color: '#444' }}>{p.product_type || '—'}</span>
                        </td>
                        <td style={tdS}><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 600, background: p.status === 'Committed' ? '#E6F1FB' : '#FAEEDA', color: p.status === 'Committed' ? '#0C447C' : '#633806' }}>{safeStr(p.status)}</span></td>
                        <td style={{ ...tdS, fontSize: 11, color: '#666' }}>{fmtDate(p.order_date)}</td>
                        {/* ETA — read-only on BB Receiving. Edit upstream on
                            the RT / SG tab, or let tracking numbers update
                            the Est. Receive Date column automatically. */}
                        <td style={tdS}>
                          <span style={{ fontSize: 11, color: '#444' }}>{p.eta ? fmtDate(p.eta) : '—'}</span>
                          {hasInfo && extractIsoDate(info.eta) && <div style={{ fontSize: 9, color: '#27500A', marginTop: 2 }}>📡 from tracking</div>}
                        </td>
                        <td style={{ ...tdS, fontSize: 11 }}>{fmtMoney(p.po_value)}</td>
                        {/* Carrier — when the PO has containers, aggregate
                            across them. Otherwise fall back to PO-level
                            tracking info. */}
                        <td style={{ ...tdS, minWidth: 140, fontSize: 10 }}>
                          {hasAnyContainers
                            ? (containerCarriers.length === 0
                                ? <span style={{ color: '#ccc' }}>—</span>
                                : containerCarriers.length === 1
                                  ? <span style={{ background: '#E6F1FB', color: '#0C447C', padding: '2px 7px', borderRadius: 8, fontWeight: 600 }}>{safeStr(containerCarriers[0])}</span>
                                  : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center' }}>
                                      {containerCarriers.map(c => (
                                        <span key={c} style={{ background: '#E6F1FB', color: '#0C447C', padding: '1px 6px', borderRadius: 8, fontWeight: 600, fontSize: 9 }}>{safeStr(c)}</span>
                                      ))}
                                    </div>)
                            : hasInfo && info.resolvedCarrier
                              ? <span style={{ background: '#E6F1FB', color: '#0C447C', padding: '2px 7px', borderRadius: 8, fontWeight: 600 }}>{safeStr(info.resolvedCarrier)}</span>
                              : (() => { const det = detectCarrier(p.tracking_number); return det ? <span style={{ background: '#f0f0f0', color: '#555', padding: '2px 7px', borderRadius: 8 }}>{safeStr(det.name)}</span> : <span style={{ color: '#ccc' }}>—</span> })()
                          }
                        </td>
                        {/* Tracking # — when containers exist, show a
                            compact list of each container's tracking number
                            so the team can see at a glance that tracking is
                            filled in even when the drop-down is collapsed.
                            Tracking numbers are still edited inside each
                            container row in the expanded panel. */}
                        <td style={{ ...tdS, minWidth: 170 }}>
                          {hasAnyContainers
                            ? <div style={{ textAlign: 'left' }}>
                                {containers.map(c => {
                                  const label = c.name || `${p.id}-${c.container_num}`
                                  return (
                                    <div key={c.id} style={{ padding: '1px 0', fontSize: 10, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                      <span style={{ color: '#888', fontSize: 9, minWidth: 64, flexShrink: 0 }}>{label}:</span>
                                      {c.tracking_number
                                        ? <span style={{ fontFamily: 'monospace', color: '#444' }}>{safeStr(c.tracking_number)}</span>
                                        : <span style={{ color: '#bbb', fontStyle: 'italic' }}>—</span>}
                                    </div>
                                  )
                                })}
                              </div>
                            : <TrackingInput po={p} onSubmit={handleAddTracking} onRemove={() => { update(p, 'tracking_number', null); setTrackingInfo(prev => { const n = {...prev}; delete n[p.id]; return n }) }} />
                          }
                        </td>
                        {/* Last Update — aggregates across containers: most
                            recent lastTime among any container. Falls back
                            to PO-level tracking info when there are no
                            containers. */}
                        <td style={{ ...tdS, minWidth: 120, fontSize: 10 }}>
                          {hasAnyContainers
                            ? (anyContainerLoading && !latestContainerUpdate
                                ? <span style={{ color: '#888', fontStyle: 'italic' }}>Checking…</span>
                                : latestContainerUpdate
                                  ? <span style={{ color: '#444' }}>{fmtTrackDate(latestContainerUpdate)}</span>
                                  : <span style={{ color: '#ccc' }}>—</span>)
                            : isLoading ? <span style={{ color: '#888', fontStyle: 'italic' }}>Checking…</span>
                              : hasInfo && info.lastTime ? <span style={{ color: '#444' }}>{fmtTrackDate(info.lastTime)}</span>
                              : p.tracking_number ? <button onClick={() => loadOne(p)} style={recheckStyle}>Re-check</button>
                              : <span style={{ color: '#ccc' }}>—</span>}
                        </td>
                        {/* Tracking Status — aggregates across containers.
                            All-same status shows the shared status pill with
                            a count. Mixed statuses show a breakdown. */}
                        <td style={{ ...tdS, minWidth: 140 }}>
                          {hasAnyContainers
                            ? (anyContainerLoading && validContainerInfos.length === 0
                                ? <span style={{ fontSize: 10, color: '#888', fontStyle: 'italic' }}>Fetching…</span>
                                : validContainerInfos.length === 0
                                  ? <span style={{ fontSize: 10, color: '#888', fontStyle: 'italic' }}>No status yet</span>
                                  : (() => {
                                      const codes = [...new Set(validContainerInfos.map(i => i.statusCode))]
                                      if (codes.length === 1) {
                                        const i = validContainerInfos[0]
                                        return (
                                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: i.statusStyle?.bg || '#f5f5f5', color: i.statusStyle?.color || '#888' }}>
                                            {safeStr(i.statusIcon)} {safeStr(i.statusLabel)} ({validContainerInfos.length})
                                          </span>
                                        )
                                      }
                                      const byCode = {}
                                      for (const vi of validContainerInfos) byCode[vi.statusLabel || vi.statusCode] = (byCode[vi.statusLabel || vi.statusCode] || 0) + 1
                                      return (
                                        <div style={{ fontSize: 10, color: '#555', lineHeight: 1.4 }}>
                                          {Object.entries(byCode).map(([label, n]) => (
                                            <div key={label}>{n}× {label}</div>
                                          ))}
                                        </div>
                                      )
                                    })())
                            : isLoading ? <span style={{ fontSize: 10, color: '#888', fontStyle: 'italic' }}>Fetching…</span>
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
                        {/* Notes (left of Docs) */}
                        <td style={{ ...tdS, minWidth: 160, verticalAlign: 'top', padding: '8px' }}>
                          <PONotesCell po={p} upsertPO={upsertPO} />
                        </td>
                        {/* Docs */}
                        <td style={{ ...tdS, minWidth: 190, verticalAlign: 'top', padding: '8px' }}>
                          <PODocsCell poId={p.id} />
                        </td>
                        {/* FCL/LCL + boxes — when containers exist, show
                            aggregated mode pills + total box count across
                            all containers. Otherwise fall back to the
                            PO-level editable controls. */}
                        <td style={{ ...tdS, minWidth: 120 }}>
                          {hasAnyContainers
                            ? <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                                {containerShipModes.length === 0 && <span style={{ color: '#ccc', fontSize: 10 }}>—</span>}
                                {containerShipModes.map(m => (
                                  <span key={m} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                                    background: m === 'FCL' ? '#E6F1FB' : '#EEEDFE',
                                    color: m === 'FCL' ? '#0C447C' : '#3C3489' }}>
                                    {m}
                                  </span>
                                ))}
                                {totalContainerBoxes > 0 && (
                                  <span style={{ fontSize: 10, color: '#555', whiteSpace: 'nowrap' }}>{totalContainerBoxes} boxes</span>
                                )}
                              </div>
                            : <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
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
                              </div>}
                        </td>
                        {/* Est. Receive Date — when containers exist, show
                            the earliest container eta (the first one that
                            will arrive). Otherwise show p.eta. Tracking
                            auto-updates both, so this stays fresh. */}
                        <td style={{ ...tdS, fontWeight: 700, minWidth: 110, background: dStyle.bg, color: dStyle.fc, border: `1px solid ${dStyle.border}` }}>
                          {isDelivered ? 'Delivered' : (
                            <div>
                              <div style={{ fontSize: 11 }}>{effectiveEta ? fmtTrackDate(effectiveEta) : 'TBD'}</div>
                              {effectiveDays !== null && effectiveEta && (
                                <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1 }}>
                                  {effectiveDays < 0 ? `${Math.abs(effectiveDays)}d overdue` : effectiveDays === 0 ? 'Today' : `in ${effectiveDays}d`}
                                </div>
                              )}
                              {hasAnyContainers && earliestContainerEta && earliestContainerEta !== p.eta && (
                                <div style={{ fontSize: 8, fontWeight: 400, marginTop: 1, opacity: 0.75 }}>
                                  earliest container
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Per-container detail panel — rich sub-rows per container */}
                      {isContainersExpanded && hasAnyContainers && (
                        <tr>
                          <td colSpan={16} style={{ padding: '14px 20px', background: '#f0f6fb', borderBottom: '2px solid #b7d0e2' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#1F3864' }}>
                                Containers for PO #{safeStr(p.id)} — {safeStr(p.supplier)}
                                <span style={{ fontWeight: 400, color: '#666', marginLeft: 8 }}>· each container is received individually</span>
                              </div>
                              <button
                                onClick={() => addContainer(p)}
                                style={{ fontSize: 11, padding: '5px 14px', background: '#1F3864', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>
                                + Add Container
                              </button>
                            </div>
                            <div style={{ background: '#fff', border: '1px solid #d0d7e2', borderRadius: 8, overflow: 'hidden' }}>
                              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                <thead>
                                  <tr>
                                    {['Container Name','Tracking #','Carrier','Last Update','Tracking Status','FCL/LCL','Notes','Docs','Est. Receive Date',''].map(h => (
                                      <th key={h} style={{ ...thS, background: '#e8eff7', fontSize: 9 }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {containers.map(c => (
                                    <BBContainerSubRow
                                      key={c.id}
                                      container={c}
                                      parentPo={p}
                                      trackingInfo={containerTrackingInfo[c.id]}
                                      loading={containerLoadingIds.has(c.id)}
                                      onUpdate={(updates) => updateContainer(p.id, c.id, updates)}
                                      onDelete={() => deleteContainer(p.id, c.id)}
                                    />
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}

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

// BBContainerSubRow — one rich table row per container inside the BB expanded
// panel. Behaves like a mini-PO: editable name, tracking number (with carrier
// auto-detect), FCL/LCL + boxes, per-container notes, shared PO-level docs,
// and its own est. receive date. Tracking writes back to the container's eta
// the same way the main BB row does.
//
// trackingInfo / loading are supplied from the parent ReceivingTab so the
// same 17TRACK fetch powers both the aggregated main-row display and the
// per-container sub-row — no double API calls. When trackingInfo/loading
// are not supplied the component falls back to internal state so it stays
// drop-in compatible with older callers.
function BBContainerSubRow({ container, parentPo, trackingInfo: trackingInfoProp, loading: loadingProp, onUpdate, onDelete }) {
  const [val, setVal] = useState(container.tracking_number || '')
  // Local fallback state only used if the parent didn't pass trackingInfo.
  const [localTrackingInfo, setLocalTrackingInfo] = useState(null)
  const [localLoading, setLocalLoading] = useState(false)

  const trackingInfo = trackingInfoProp !== undefined ? trackingInfoProp : localTrackingInfo
  const loading = loadingProp !== undefined ? loadingProp : localLoading

  // Default display name: {po.id}-{container_num}
  const defaultName = `${parentPo.id}-${container.container_num}`

  useEffect(() => { setVal(container.tracking_number || '') }, [container.tracking_number])

  // Fetch tracking on mount / whenever tracking number changes — but ONLY
  // when the parent isn't already managing tracking info for us. When the
  // parent passes trackingInfoProp, skip this to avoid duplicate 17TRACK
  // calls and racing eta writes.
  useEffect(() => {
    if (trackingInfoProp !== undefined) return
    let cancelled = false
    if (container.tracking_number && !isDirectOnly(container.tracking_number)) {
      setLocalLoading(true)
      getTracking(container.tracking_number).then(info => {
        if (cancelled) return
        setLocalTrackingInfo(info)
        if (info) {
          const iso = extractIsoDate(info.eta)
          if (iso && iso !== container.eta) onUpdate({ eta: iso })
        }
      }).finally(() => { if (!cancelled) setLocalLoading(false) })
    }
    return () => { cancelled = true }
  }, [container.tracking_number, trackingInfoProp])

  const handleTrackingBlur = async () => {
    const trimmed = val.trim()
    if (trimmed === (container.tracking_number || '')) return
    const auto = detectCarrier(trimmed)
    await onUpdate({ tracking_number: trimmed || null, carrier_slug: auto?.code || null })
    if (trimmed) {
      await registerTracking(trimmed)
      // Only chase a follow-up fetch locally if the parent isn't managing
      // tracking info — otherwise the parent's auto-loader will pick it up.
      if (trackingInfoProp === undefined) {
        setTimeout(async () => {
          const info = await getTracking(trimmed)
          setLocalTrackingInfo(info)
          if (info) {
            const iso = extractIsoDate(info.eta)
            if (iso) onUpdate({ eta: iso })
          }
        }, 2000)
      }
    }
  }

  const detected = detectCarrier(container.tracking_number || val || '')
  const carrierName = trackingInfo?.resolvedCarrier || detected?.name

  const cDays = daysUntil(container.eta)
  const cColor = arrivalColor(cDays)
  const cEtaText = container.eta
    ? (() => { const [y, m, d] = container.eta.split('-'); return `${parseInt(m)}/${parseInt(d)}/${y}` })()
    : 'TBD'
  const cSub = cDays === null ? '' : cDays < 0 ? `${Math.abs(cDays)}d overdue` : cDays === 0 ? 'Today' : `in ${cDays}d`

  const directUrl = container.tracking_number ? getDirectUrl(container.tracking_number) : null
  const isDirect = container.tracking_number ? isDirectOnly(container.tracking_number) : false

  // PONotesCell expects a { id, notes } shape; reuse it against the container.
  const notesShim = { id: container.id, notes: container.notes }
  const notesUpsert = (obj) => onUpdate({ notes: obj.notes ?? null })

  return (
    <tr style={{ borderBottom: '1px solid #eef2f6' }}>
      {/* Name */}
      <td style={{ ...tdS, textAlign: 'left', minWidth: 140, background: '#f7fafd' }}>
        <input
          type="text"
          defaultValue={container.name || ''}
          placeholder={defaultName}
          onBlur={e => {
            const v = e.target.value.trim()
            if ((v || null) !== (container.name || null)) onUpdate({ name: v || null })
          }}
          style={{ fontSize: 11, padding: '3px 6px', border: '1px solid #d0d7e2', borderRadius: 4, width: '100%', fontFamily: 'monospace', fontWeight: 600, color: '#1F3864', background: '#fff' }}
          title={`Default: ${defaultName}`}
        />
        {!container.name && <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>default: {defaultName}</div>}
      </td>

      {/* Tracking # */}
      <td style={{ ...tdS, minWidth: 160 }}>
        <input
          type="text"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={handleTrackingBlur}
          placeholder="Enter tracking #"
          style={{ fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: '100%', fontFamily: 'monospace' }}
        />
      </td>

      {/* Carrier */}
      <td style={{ ...tdS, minWidth: 120, fontSize: 10 }}>
        {carrierName
          ? <span style={{ background: '#E6F1FB', color: '#0C447C', padding: '2px 7px', borderRadius: 8, fontWeight: 600 }}>{safeStr(carrierName)}</span>
          : <span style={{ color: '#ccc' }}>—</span>}
      </td>

      {/* Last Update */}
      <td style={{ ...tdS, minWidth: 110, fontSize: 10 }}>
        {loading ? <span style={{ color: '#888', fontStyle: 'italic' }}>Checking…</span>
          : trackingInfo?.lastTime ? <span style={{ color: '#444' }}>{fmtTrackDate(trackingInfo.lastTime)}</span>
          : container.tracking_number ? <span style={{ color: '#bbb' }}>—</span>
          : <span style={{ color: '#ccc' }}>—</span>}
      </td>

      {/* Tracking Status */}
      <td style={{ ...tdS, minWidth: 130, fontSize: 10 }}>
        {loading ? <span style={{ color: '#aaa' }}>…</span>
          : trackingInfo
            ? <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: trackingInfo.statusStyle?.bg || '#f5f5f5', color: trackingInfo.statusStyle?.color || '#888' }}>
                {safeStr(trackingInfo.statusIcon)} {safeStr(trackingInfo.statusLabel)}
              </span>
            : isDirect && directUrl
              ? <a href={directUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, padding: '3px 8px', background: '#0C447C', color: '#fff', borderRadius: 5, textDecoration: 'none', fontWeight: 600 }}>Track →</a>
              : <span style={{ color: '#ccc' }}>—</span>}
      </td>

      {/* FCL / LCL + boxes */}
      <td style={{ ...tdS, minWidth: 130 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          <select
            style={{ fontSize: 10, padding: '2px 4px', border: '1px solid #ddd', borderRadius: 4 }}
            value={container.ship_mode || ''}
            onChange={e => onUpdate({ ship_mode: e.target.value || null })}
          >
            <option value=''>--</option>
            <option value='FCL'>FCL</option>
            <option value='LCL'>LCL</option>
          </select>
          {container.ship_mode === 'FCL' && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#E6F1FB', color: '#0C447C' }}>FCL</span>}
          {container.ship_mode === 'LCL' && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#EEEDFE', color: '#3C3489' }}>LCL</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <input
              type="number"
              placeholder="#"
              defaultValue={container.box_count || ''}
              onBlur={e => {
                const v = e.target.value ? parseInt(e.target.value) : null
                onUpdate({ box_count: !isNaN(v) ? v : null })
              }}
              style={{ fontSize: 10, padding: '2px 5px', border: '1px solid #ddd', borderRadius: 4, width: 46 }}
            />
            <span style={{ fontSize: 10, color: '#555', whiteSpace: 'nowrap' }}>boxes</span>
          </div>
        </div>
      </td>

      {/* Notes (per container) */}
      <td style={{ ...tdS, minWidth: 160, verticalAlign: 'top', padding: '6px 8px' }}>
        <PONotesCell po={notesShim} upsertPO={notesUpsert} />
      </td>

      {/* Docs — shared with the parent PO's doc bucket. Any container can
          attach/see them, reflecting that docs like packing lists typically
          cover the whole PO rather than a single container. */}
      <td style={{ ...tdS, minWidth: 180, verticalAlign: 'top', padding: '6px 8px' }}>
        <PODocsCell poId={parentPo.id} />
      </td>

      {/* Est. Receive Date */}
      <td style={{ ...tdS, fontWeight: 700, minWidth: 120, background: cColor.bg, color: cColor.fc, border: `1px solid ${cColor.border}` }}>
        <input
          type="date"
          key={container.eta || 'none'}
          defaultValue={container.eta || ''}
          onBlur={e => onUpdate({ eta: e.target.value || null })}
          style={{ fontSize: 10, padding: '2px 4px', border: '1px solid #ddd', borderRadius: 4, width: '100%', background: '#fff', color: '#333' }}
        />
        <div style={{ fontSize: 11, marginTop: 3, fontWeight: 600 }}>{cEtaText}</div>
        {cSub && <div style={{ fontSize: 9, fontWeight: 400 }}>{cSub}</div>}
      </td>

      {/* Delete */}
      <td style={{ ...tdS, minWidth: 36 }}>
        <button
          onClick={onDelete}
          title="Remove container"
          style={{ fontSize: 13, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
        >✕</button>
      </td>
    </tr>
  )
}

const thS = { background: '#f5f5f3', fontSize: 10, fontWeight: 500, color: '#666', padding: '7px 8px', textAlign: 'center', borderRight: '1px solid #eee', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap', letterSpacing: '.04em', textTransform: 'uppercase' }
const tdS = { padding: '7px 8px', borderRight: '1px solid #eee', fontSize: 12, textAlign: 'center', verticalAlign: 'middle' }
const selS = { fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 5, background: '#fff', cursor: 'pointer', width: '100%' }
const recheckStyle = { display: 'block', fontSize: 9, color: '#0C447C', background: 'none', border: '1px solid #0C447C', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', marginTop: 3 }
