import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { SUPP_COLORS, SG_PRODUCTS, RT_PRODUCTS, daysUntil, arrivalColor, fmtDate, fmtMoney, searchMatchesPOOrContainers, searchMatchesAnyContainer, normalizeQuery } from '../constants'
import { detectCarrier, registerTracking, getTracking, isDirectOnly, getDirectUrl } from '../tracking'
import PODocsCell from './PODocsCell'
import PONotesCell from './PONotesCell'
import SearchBox from './SearchBox'

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

// Pull a YYYY-MM-DD date out of any tracking eta string, or return null.
function extractIsoDate(val) {
  if (!val) return null
  const s = typeof val === 'string' ? val : JSON.stringify(val)
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

// Today's date as YYYY-MM-DD for defaulting the "Date Received" input.
function todayIso() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// Helper: receive-date display used throughout the app for AWD/FBA rows
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

// AWDContainerSubRow — rich per-container table row inside the AWD/FBA
// expanded panel. Mirrors BBContainerSubRow from ReceivingTab.js (editable
// name, tracking # with auto-carrier detect, last-update / tracking status
// pills, FCL/LCL + boxes, per-container notes, shared PO-level docs, est.
// receive date that auto-updates from tracking) and adds a Dest column so
// AWD/FBA containers can each ship to a different warehouse code (FTW1,
// ONT8, LGB8, etc.) within a single PO.
//
// onUpdate takes just { ...updates }; the caller wraps in c.id to match
// BBContainerSubRow's signature.
function AWDContainerSubRow({ container, parentPo, onUpdate, onDelete, hideDest = false, isBB = false }) {
  const [val, setVal] = useState(container.tracking_number || '')
  const [trackingInfo, setTrackingInfo] = useState(null)
  const [loading, setLoading] = useState(false)

  // Default display name: {po.id}-{container_num}
  const defaultName = `${parentPo.id}-${container.container_num}`

  useEffect(() => { setVal(container.tracking_number || '') }, [container.tracking_number])

  // Fetch tracking on mount / whenever tracking number changes. Overwrites
  // container.eta if the carrier returns an ETA (same as BB).
  useEffect(() => {
    let cancelled = false
    if (container.tracking_number && !isDirectOnly(container.tracking_number)) {
      setLoading(true)
      getTracking(container.tracking_number).then(info => {
        if (cancelled) return
        setTrackingInfo(info)
        if (info) {
          const iso = extractIsoDate(info.eta)
          if (iso && iso !== container.eta) onUpdate({ eta: iso })
        }
      }).finally(() => { if (!cancelled) setLoading(false) })
    }
    return () => { cancelled = true }
  }, [container.tracking_number])

  const handleTrackingBlur = async () => {
    const trimmed = val.trim()
    if (trimmed === (container.tracking_number || '')) return
    const auto = detectCarrier(trimmed)
    await onUpdate({ tracking_number: trimmed || null, carrier_slug: auto?.code || null })
    if (trimmed) {
      await registerTracking(trimmed)
      setTimeout(async () => {
        const info = await getTracking(trimmed)
        setTrackingInfo(info)
        if (info) {
          const iso = extractIsoDate(info.eta)
          if (iso) onUpdate({ eta: iso })
        }
      }, 2000)
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

  // Round 26 — once a tracking number is saved on a container, every other
  // field on that container locks. Tony: "when a tracking number locks, make
  // sure all field after getting filled it, lock in and the only way to
  // change it is if you change it to draft in the SG or RT tab". Flipping
  // the parent PO back to Draft re-opens every input.
  const parentDraft = (parentPo?.status || 'Draft') === 'Draft'
  const cLocked = !parentDraft && !!container.tracking_number

  return (
    <tr style={{ borderBottom: '1px solid #eef2f6' }}>
      {/* Name */}
      <td style={{ ...tdS, textAlign: 'left', minWidth: 140, background: '#f7fafd' }}>
        {cLocked ? (
          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1F3864', fontSize: 11 }}>
            {safeStr(container.name || defaultName)}
          </span>
        ) : (
          <>
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
          </>
        )}
      </td>

      {/* Tracking # */}
      <td style={{ ...tdS, minWidth: 160 }}>
        {cLocked ? (
          <span style={{ fontFamily: 'monospace', color: '#444', fontSize: 11 }}>
            {safeStr(container.tracking_number)}
          </span>
        ) : (
          <input
            type="text"
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={handleTrackingBlur}
            placeholder="Enter tracking #"
            style={{ fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: '100%', fontFamily: 'monospace' }}
          />
        )}
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

      {/* Dest — AWD-specific, short warehouse code (e.g. FTW1, ONT8, LGB8).
          Hidden on RT-BB / SG-BB tables since every container in those POs
          is BB-bound; the column was visual noise that just repeated the
          obvious. Round 26. */}
      {!hideDest && (
        <td style={{ ...tdS, minWidth: 80 }}>
          {cLocked ? (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#F1EFE8', color: '#444441' }}>
              {safeStr(container.dest) || '—'}
            </span>
          ) : (
            <input
              type="text"
              defaultValue={container.dest || ''}
              placeholder="e.g. FTW1"
              maxLength={8}
              onBlur={e => onUpdate({ dest: e.target.value.trim().toUpperCase() || null })}
              style={{ fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: '100%', fontFamily: 'monospace', textTransform: 'uppercase', textAlign: 'center' }}
            />
          )}
        </td>
      )}

      {/* FCL / LCL + boxes (BB) — or Boxes-only (AWD/FBA, round 27).
          Tony asked to drop the FCL/LCL distinction on AWD/FBA shipments
          since the warehouse only cares about the box count for inbound
          AWD/FBA. BB shipments still split FCL vs LCL because the dock
          handles them differently. */}
      <td style={{ ...tdS, minWidth: isBB ? 130 : 90 }}>
        {isBB ? (
          cLocked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              {container.ship_mode
                ? <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                    background: container.ship_mode === 'FCL' ? '#E6F1FB' : '#EEEDFE',
                    color: container.ship_mode === 'FCL' ? '#0C447C' : '#3C3489' }}>
                    {container.ship_mode}
                  </span>
                : <span style={{ color: '#bbb', fontSize: 10 }}>—</span>}
              {container.ship_mode === 'LCL' && container.box_count != null && (
                <span style={{ fontSize: 10, color: '#555' }}>{container.box_count} box{container.box_count === 1 ? '' : 'es'}</span>
              )}
            </div>
          ) : (
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
          )
        ) : (
          // AWD/FBA — just a Boxes count, no FCL/LCL split.
          cLocked ? (
            <div style={{ textAlign: 'center' }}>
              {container.box_count != null
                ? <span style={{ fontSize: 11, fontWeight: 600, color: '#0C447C' }}>
                    {container.box_count} box{container.box_count === 1 ? '' : 'es'}
                  </span>
                : <span style={{ color: '#bbb', fontSize: 10 }}>—</span>}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
              <input
                type="number"
                placeholder="#"
                defaultValue={container.box_count || ''}
                onBlur={e => {
                  const v = e.target.value ? parseInt(e.target.value) : null
                  onUpdate({ box_count: !isNaN(v) ? v : null })
                }}
                style={{ fontSize: 11, padding: '3px 6px', border: '1px solid #ddd', borderRadius: 4, width: 56, textAlign: 'center' }}
              />
              <span style={{ fontSize: 10, color: '#555', whiteSpace: 'nowrap' }}>boxes</span>
            </div>
          )
        )}
      </td>

      {/* Notes (per container) — locked when the container has a tracking
          number and the parent PO isn't in Draft. Read-only display reuses
          PONotesCell with `readOnly`. */}
      <td style={{ ...tdS, minWidth: 160, verticalAlign: 'top', padding: '6px 8px' }}>
        <PONotesCell po={notesShim} upsertPO={notesUpsert} readOnly={cLocked} />
      </td>

      {/* Docs — shared with the parent PO's doc bucket. Any container can
          attach/see them, reflecting that docs like packing lists typically
          cover the whole PO rather than a single container. */}
      <td style={{ ...tdS, minWidth: 180, verticalAlign: 'top', padding: '6px 8px' }}>
        <PODocsCell poId={parentPo.id} />
      </td>

      {/* Est. Receive Date — locked when tracking is set and parent isn't
          Draft. Tracking-driven eta updates still flow in (they bypass this
          input via direct onUpdate). */}
      <td style={{ ...tdS, fontWeight: 700, minWidth: 120, background: cColor.bg, color: cColor.fc, border: `1px solid ${cColor.border}` }}>
        {!cLocked && (
          <input
            type="date"
            key={container.eta || 'none'}
            defaultValue={container.eta || ''}
            onBlur={e => onUpdate({ eta: e.target.value || null })}
            style={{ fontSize: 10, padding: '2px 4px', border: '1px solid #ddd', borderRadius: 4, width: '100%', background: '#fff', color: '#333' }}
          />
        )}
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

// Date-received form — rendered inside the Modal via the `children` prop when
// the user flips status to Complete. Writes to `dateRef.current` on change so
// the modal's onConfirm can read the final value via closure.
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

// AWD PO Row — expandable with sub-containers. Exported so RT/SG tabs can reuse it.
// isDraft gates all PO-level editing. Status dropdown always available unless
// readOnlyStatus is set.
// Props:
//  - allowContainerExpand: when false, row can't be expanded to show containers
//    (used in the Completed POs tab so the team doesn't accidentally keep
//    poking at container rows for archived orders).
//  - readOnlyStatus: when true, the status cell is shown as a badge instead of
//    a dropdown (used on the AWD/FBA Receiving tab where status is managed
//    from the originating RT / SG tabs).
export function AWDPORow({
  po, upsertPO, deletePO, destOptions = ['AWD', 'FBA', 'RT AWD'], showModal, closeModal,
  allowContainerExpand = true, readOnlyStatus = false,
  hideDest = false,
  // isBB — true when this row is on a BB-only table (sg-bb / rt-bb). Drives
  // the FCL/LCL vs Boxes-only display in the container expansion. AWD/FBA
  // shipments don't care about FCL/LCL split, only how many boxes are coming.
  isBB = false,
  requireMultipleToExpand = false,
  preloadedContainers,
  // forceExpanded — when true, render the row as if the user clicked to
  // expand it. Used by search: a query that matches a container field
  // (tracking #, notes, etc.) auto-pops the panel so the matching container
  // is visible without the user having to click. Goes back to normal when
  // the search clears.
  forceExpanded = false,
}) {
  const [expanded, setExpanded] = useState(false)
  const effectiveExpanded = expanded || forceExpanded
  const [containers, setContainers] = useState(preloadedContainers || [])
  const [loadingContainers, setLoadingContainers] = useState(false)

  const sc = SUPP_COLORS[po.supplier] || { bg: '#f5f5f5', fc: '#333', b: '#ccc' }
  const opts = po.entity === 'SG' ? SG_PRODUCTS : RT_PRODUCTS
  const isDraft = (po.status || 'Draft') === 'Draft'
  const isComplete = po.status === 'Complete'

  const statusColor = s => s === 'Committed' ? { bg: '#E6F1FB', fc: '#0C447C' }
                         : s === 'Complete'  ? { bg: '#EAF3DE', fc: '#27500A' }
                         : s === 'Delete'    ? { bg: '#FCEBEB', fc: '#A32D2D' }
                         : { bg: '#FAEEDA', fc: '#633806' }
  const sc2 = statusColor(po.status || 'Draft')

  const handleStatus = (val) => {
    if (val === 'Delete') {
      showModal?.({
        title: 'Delete this PO?',
        body: `PO #${po.id} will be permanently deleted.`,
        confirmLabel: 'Yes, delete',
        danger: true,
        onConfirm: () => { deletePO?.(po.id); closeModal?.() }
      })
    } else if (val === 'Complete') {
      // Capture received date via a ref so the modal's onConfirm can read it.
      const dateRef = { current: po.received_date || todayIso() }
      showModal?.({
        title: 'Mark as Complete',
        confirmLabel: 'Mark as Received',
        children: <DateReceivedForm dateRef={dateRef} poId={po.id} />,
        onConfirm: () => {
          upsertPO({ ...po, status: 'Complete', received_date: dateRef.current || todayIso() })
          closeModal?.()
        }
      })
    } else {
      upsertPO({ ...po, status: val })
    }
  }

  const loadContainers = useCallback(async () => {
    setLoadingContainers(true)
    const { data } = await supabase.from('awd_containers').select('*').eq('po_id', po.id).order('container_num')
    setContainers(data || [])
    setLoadingContainers(false)
  }, [po.id])

  // Load containers on mount (not just on expand) so the summary row can
  // show the box total and container count before the team clicks in. If the
  // parent table already pre-loaded containers, sync from that prop so we
  // don't fire a redundant query.
  useEffect(() => {
    if (preloadedContainers !== undefined) {
      setContainers(preloadedContainers)
    } else {
      loadContainers()
    }
  }, [loadContainers, preloadedContainers])

  // Earliest container ETA drives the summary row.
  const earliestContainerEta = containers.reduce((best, c) => {
    if (!c.eta) return best
    if (!best) return c.eta
    return new Date(c.eta) < new Date(best) ? c.eta : best
  }, null)
  const effectiveEta = earliestContainerEta || po.eta
  const { dateText, subText } = receiveDateDisplay(effectiveEta)
  const ac = arrivalColor(daysUntil(effectiveEta))

  // For completed POs we show the received_date in place of the ETA/receive-date column.
  const receivedText = po.received_date ? fmtTrackDate(po.received_date) : fmtTrackDate(po.eta) || '—'

  const totalBoxes = containers.reduce((sum, c) => sum + (c.box_count || 0), 0)

  const addContainer = async () => {
    const nextNum = containers.length > 0 ? Math.max(...containers.map(c => c.container_num)) + 1 : 1
    const { data } = await supabase.from('awd_containers').insert({
      po_id: po.id,
      container_num: nextNum,
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

  // When requireMultipleToExpand is set (Completed tab), only rows with more
  // than one actual container are clickable. Otherwise any row with container
  // expand allowed is clickable (so the open views can still add the first
  // container).
  const rowClickable = allowContainerExpand && (!requireMultipleToExpand || containers.length > 1)

  // Display count — if no real containers are saved, show as 1 container in
  // the summary (per Tony: "for ones where we dont add containers, auto make
  // it 1 container"). The dropdown is still gated on real container count.
  const displayContainerCount = Math.max(containers.length, 1)

  // Column counts for the row layout. Dest is dropped when hideDest is set.
  //   completed view: Supplier, PO #, Entity, [Dest,] Product, Status, Order Date,
  //                   PO Value, Boxes, Containers, Docs, Date Received  (12 / 11 cols)
  //   open view:      Supplier, PO #, Entity, [Dest,] Product, Status, Order Date,
  //                   ETA, PO Value, Boxes, Containers, Notes, Docs,
  //                   Est. Receive Date                                (14 / 13 cols)
  const colSpanForExpansion = (isComplete ? 12 : 14) - (hideDest ? 1 : 0)

  return (
    <>
      <tr style={{ background: sc.bg + '18', borderBottom: effectiveExpanded ? 'none' : '1px solid #f0f0f0', cursor: rowClickable ? 'pointer' : 'default' }}
        onClick={rowClickable ? () => setExpanded(e => !e) : undefined}>
        <td style={{ ...tdS, fontWeight: 700, background: sc.bg, color: sc.fc, borderLeft: `3px solid ${sc.b}`, textAlign: 'left', minWidth: 140 }}>
          <div>{safeStr(po.supplier)}</div>
          {allowContainerExpand && (
            containers.length > 0 ? (
              <button
                onClick={e => { e.stopPropagation(); setExpanded(exp => !exp) }}
                style={{ marginTop: 4, fontSize: 9, padding: '2px 8px', background: '#1F3864', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                title="Show per-container tracking, notes, docs and receive dates"
              >
                {effectiveExpanded ? '▼' : '▶'} {containers.length} container{containers.length > 1 ? 's' : ''}
              </button>
            ) : !isComplete ? (
              // Hide the "+ Split into containers" affordance on the Completed
              // POs tab — once a PO is received there's no reason to add
              // containers retroactively, and the button just clutters the
              // archive.
              <button
                onClick={async (e) => { e.stopPropagation(); await addContainer(); setExpanded(true) }}
                style={{ marginTop: 4, fontSize: 9, padding: '2px 8px', background: '#fff', color: '#1F3864', border: '1px dashed #1F3864', borderRadius: 10, cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                title="Split this PO into multiple containers"
              >
                + Split into containers
              </button>
            ) : null
          )}
        </td>
        <td style={{ ...tdS, fontFamily: 'monospace', fontSize: 11, color: '#666' }} onClick={e => e.stopPropagation()}>#{safeStr(po.id)}</td>
        <td style={tdS} onClick={e => e.stopPropagation()}>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: po.entity === 'RT' ? '#E6F1FB' : '#EAF3DE', color: po.entity === 'RT' ? '#0C447C' : '#27500A' }}>{safeStr(po.entity)}</span>
        </td>
        {!hideDest && <td style={tdS} onClick={e => e.stopPropagation()}>
          {isDraft ? (
            <select style={selS} value={po.dest || ''} onChange={e => update('dest', e.target.value)}>
              <option value=''>--</option>
              {destOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: db.bg, color: db.fc }}>{po.dest || '—'}</span>
          )}
          {isDraft && po.dest && (
            <div style={{ marginTop: 3 }}>
              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 600, background: db.bg, color: db.fc }}>{po.dest}</span>
            </div>
          )}
        </td>}
        <td style={{ ...tdS, minWidth: 120 }} onClick={e => e.stopPropagation()}>
          {isDraft ? (
            <select style={selS} value={po.product_type || ''} onChange={e => update('product_type', e.target.value)}>
              <option value=''>--</option>
              {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: 11, color: '#444' }}>{po.product_type || '—'}</span>
          )}
        </td>
        <td style={tdS} onClick={e => e.stopPropagation()}>
          {readOnlyStatus ? (
            <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 10, fontWeight: 600, background: sc2.bg, color: sc2.fc, border: `1px solid ${sc2.fc}22`, display: 'inline-block' }}>
              {po.status || 'Draft'}
            </span>
          ) : (
            <select
              style={{ ...selS, background: sc2.bg, color: sc2.fc, borderColor: sc2.fc + '44' }}
              value={po.status || 'Draft'}
              onChange={e => handleStatus(e.target.value)}
            >
              <option value='Draft'>Draft</option>
              <option value='Committed'>Committed</option>
              <option value='Complete'>Complete</option>
              <option value='Delete'>Delete</option>
            </select>
          )}
        </td>
        {/* Order Date — editable in Draft mode (round 22) so users can correct
            it before committing. Read-only otherwise. */}
        <td style={{ ...tdS, fontSize: 11, color: '#666' }} onClick={e => e.stopPropagation()}>
          {isDraft ? (
            <input key={po.order_date || 'none-od'} type="date" defaultValue={po.order_date || ''} onBlur={e => update('order_date', e.target.value || null)} style={{ fontSize: 11, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: 110 }} />
          ) : (
            fmtDate(po.order_date)
          )}
        </td>
        {/* ETA column — hidden on the Completed POs tab */}
        {!isComplete && (
          <td style={tdS} onClick={e => e.stopPropagation()}>
            {isDraft ? (
              <input key={po.eta || 'none'} type="date" defaultValue={po.eta || ''} onBlur={e => update('eta', e.target.value)} style={{ fontSize: 11, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: 110 }} />
            ) : (
              <span style={{ fontSize: 11, color: '#444' }}>{fmtDate(po.eta) || '—'}</span>
            )}
          </td>
        )}
        {/* PO Value column — shown in both open and completed views (round 21).
            User asked for the per-PO dollar amount on the Completed tab but
            explicitly NOT a combined total at the bottom of each section.
            Round 26 — editable in Draft mode (same pattern as Order Date and
            ETA above) so users can correct the value before committing.
            Read-only otherwise. */}
        <td style={{ ...tdS, fontSize: 11 }} onClick={e => e.stopPropagation()}>
          {isDraft ? (
            <input
              key={po.po_value ?? 'none-pv'}
              type="number"
              step="0.01"
              defaultValue={po.po_value ?? ''}
              onBlur={e => update('po_value', e.target.value ? +e.target.value : null)}
              style={{ fontSize: 11, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: 90 }}
              placeholder="0.00"
            />
          ) : (
            fmtMoney(po.po_value)
          )}
        </td>
        <td style={{ ...tdS, minWidth: 70, textAlign: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#0C447C' }}>
            {totalBoxes > 0 ? totalBoxes : (po.box_count || '—')}
          </span>
        </td>
        <td style={{ ...tdS, minWidth: 80, textAlign: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#0C447C' }}>
            {displayContainerCount} container{displayContainerCount > 1 ? 's' : ''}
          </span>
        </td>
        {/* Notes column — hidden on the Completed POs tab */}
        {!isComplete && (
          <td style={{ ...tdS, minWidth: 160, verticalAlign: 'top', padding: '8px' }} onClick={e => e.stopPropagation()}>
            <PONotesCell po={po} upsertPO={upsertPO} readOnly={isComplete} />
          </td>
        )}
        <td style={{ ...tdS, minWidth: 190 }} onClick={e => e.stopPropagation()}>
          <PODocsCell poId={po.id} />
        </td>
        {/* Last column: ETA in open view, Date Received + "Delivered" badge in completed view */}
        {isComplete ? (
          <td style={{ ...tdS, fontWeight: 700, minWidth: 130, background: '#EAF3DE', color: '#27500A', border: '1px solid #97C459' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase' }}>✓ Delivered</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>{receivedText}</div>
              {/* Round 22 — surface the original order date next to the
                  Delivered badge so the full timeline is visible at a glance. */}
              {po.order_date && (
                <div style={{ fontSize: 10, marginTop: 4, fontWeight: 500, color: '#3a6a18' }}>
                  Ordered: {fmtDate(po.order_date)}
                </div>
              )}
            </div>
          </td>
        ) : (
          /* Round 29 — match BB Receiving's per-container ETA bubbles. When
             a PO has multiple containers we show one colored bubble per
             container (sorted by container_num) with the date, days-until
             subtext and an arrival-window color, instead of a single bubble
             keyed off the earliest ETA. Falls back to the single-bubble
             style when there are no containers. */
          <td style={{ ...tdS, fontWeight: 700, minWidth: 130, padding: '4px 4px', verticalAlign: 'middle' }}>
            {containers.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[...containers].sort((a,b) => (a.container_num||0) - (b.container_num||0)).map(c => {
                  const cDays = daysUntil(c.eta)
                  const cAc = arrivalColor(cDays)
                  return (
                    <div key={c.id} style={{ background: cAc.bg, color: cAc.fc, border: `1px solid ${cAc.border}`, borderRadius: 5, padding: '4px 6px', minWidth: 110, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{c.eta ? fmtTrackDate(c.eta) : 'TBD'}</div>
                      {cDays !== null && c.eta && (
                        <div style={{ fontSize: 9, fontWeight: 400 }}>
                          {cDays < 0 ? `${Math.abs(cDays)}d overdue` : cDays === 0 ? 'Today' : `in ${cDays}d`}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ background: ac.bg, color: ac.fc, border: `1px solid ${ac.border}`, borderRadius: 5, padding: '4px 6px', minWidth: 110, textAlign: 'center' }}>
                <div style={{ fontSize: 11 }}>{dateText}</div>
                {subText && <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1 }}>{subText}</div>}
              </div>
            )}
          </td>
        )}
      </tr>

      {/* Expanded containers panel (only in views that allow expansion) */}
      {effectiveExpanded && allowContainerExpand && (
        <tr>
          <td colSpan={colSpanForExpansion} style={{ padding: '12px 20px 16px', background: '#f0f6fb', borderBottom: '2px solid #b7d0e2' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1F3864' }}>
                Containers for PO #{safeStr(po.id)} — {safeStr(po.supplier)}
                {po.dest && <span style={{ fontWeight: 400, color: '#666', marginLeft: 8 }}>· going to {po.dest}</span>}
              </span>
              <button onClick={addContainer}
                style={{ fontSize: 11, padding: '5px 14px', background: '#1F3864', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>
                + Add Container
              </button>
            </div>
            {loadingContainers && <div style={{ color: '#888', fontSize: 11, fontStyle: 'italic' }}>Loading…</div>}
            {!loadingContainers && containers.length === 0 && (
              <div style={{ color: '#aaa', fontSize: 11, fontStyle: 'italic', padding: '8px 0' }}>
                No containers yet — click "+ Add Container" above (or "+ Split into containers" on the row) to start adding tracking numbers, dests, boxes and per-container receive dates
              </div>
            )}
            {containers.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #d0d7e2', borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      {(() => {
                        // Round 27 — header is "FCL/LCL" on BB tables (where
                        // dock cares about full vs less-than-full container)
                        // and "Boxes" on AWD/FBA tables (where only the
                        // box count matters for inbound counting).
                        const shipHeader = isBB ? 'FCL/LCL' : 'Boxes'
                        const hs = ['Container Name','Tracking #','Carrier','Last Update','Tracking Status','Dest', shipHeader,'Notes','Docs','Est. Receive Date','']
                        return (hideDest ? hs.filter(h => h !== 'Dest') : hs).map(h => (
                          <th key={h} style={{ ...thS, background: '#e8eff7', fontSize: 9 }}>{h}</th>
                        ))
                      })()}
                    </tr>
                  </thead>
                  <tbody>
                    {containers.map(c => (
                      <AWDContainerSubRow
                        key={c.id}
                        container={c}
                        parentPo={po}
                        hideDest={hideDest}
                        isBB={isBB}
                        onUpdate={(updates) => updateContainer(c.id, updates)}
                        onDelete={() => deleteContainer(c.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// AWDPOTable — shared expandable-row table, reusable across tabs.
// tableIds filters which PO tables to include; destOptions sets the Dest
// dropdown options; showCompleted flips the filter to only include Completed
// POs (used by the Completed POs tab) and rewrites the ETA/Date Received columns.
// allowContainerExpand disables the expand-on-click behavior (used by the
// Completed POs tab where Tony doesn't want to re-edit container info).
export function AWDPOTable({
  pos, upsertPO, deletePO, entityFilter,
  tableIds = ['sg-awdfba', 'rt-awd'],
  destOptions = ['AWD', 'FBA', 'RT AWD'],
  showCompleted = false,
  hideDrafts = false,
  // hideDest hides the "Dest" column entirely — used on RT tab's BB section
  // where every PO is going to BB so the column is redundant. AWD/FBA tabs
  // still show it because rows there actually vary.
  hideDest = false,
  allowContainerExpand = true,
  readOnlyStatus = false,
  requireMultipleToExpand = false,
  showModal, closeModal,
  emptyMessage = 'No open POs.',
  // searchQuery — when set, rows are further filtered to those whose PO
  // fields or any container's fields contain the query (case-insensitive).
  // Empty / undefined = no filtering. Container-only matches force-expand
  // the row so the user can see what matched.
  searchQuery = '',
}) {
  // Bulk-load every container for the POs this table renders. Lets us sort
  // by the effective receive date (earliest container eta or fallback to the
  // PO's eta) — which is what the AWD/FBA Receiving team actually cares about.
  const [containerMap, setContainerMap] = useState({})

  const tablePosAll = pos
    .filter(p => tableIds.includes(p.table_id))
    .filter(p => !entityFilter || p.entity === entityFilter)
    .filter(p => showCompleted ? p.status === 'Complete' : p.status !== 'Complete')
    // Receiving tabs set hideDrafts so the warehouse only sees POs that
    // have been committed. Draft POs are still visible on the RT / SG
    // tabs where they're edited.
    .filter(p => hideDrafts ? p.status !== 'Draft' : true)
  const idKey = tablePosAll.map(p => p.id).join(',')

  useEffect(() => {
    let cancelled = false
    async function loadAll() {
      if (tablePosAll.length === 0) { setContainerMap({}); return }
      const ids = tablePosAll.map(p => p.id)
      const { data } = await supabase.from('awd_containers').select('*').in('po_id', ids).order('container_num')
      if (cancelled) return
      const byPO = {}
      for (const c of (data || [])) {
        if (!byPO[c.po_id]) byPO[c.po_id] = []
        byPO[c.po_id].push(c)
      }
      setContainerMap(byPO)
    }
    loadAll()
    return () => { cancelled = true }
  }, [idKey])

  // Helper: earliest eta across containers (or fall back to PO's eta).
  const effectiveEta = (p) => {
    const cs = containerMap[p.id] || []
    let best = null
    for (const c of cs) {
      if (!c.eta) continue
      if (!best || new Date(c.eta) < new Date(best)) best = c.eta
    }
    return best || p.eta || null
  }

  const awdPosSorted = tablePosAll
    .slice()
    .sort((a, b) => {
      if (showCompleted) {
        // Most recent received-date first (falls back to eta / order_date).
        const ad = a.received_date || a.eta || a.order_date || ''
        const bd = b.received_date || b.eta || b.order_date || ''
        if (!ad && !bd) return 0
        if (!ad) return 1
        if (!bd) return -1
        return new Date(bd) - new Date(ad)
      }
      // Open view: soonest effective receive date at the top. Updates
      // automatically as container etas arrive from tracking.
      const ae = effectiveEta(a)
      const be = effectiveEta(b)
      if (!ae && !be) return 0
      if (!ae) return 1
      if (!be) return -1
      return new Date(ae) - new Date(be)
    })

  // Apply free-text search. Empty query passes everything through. We use
  // containerMap (already loaded above) so a tracking number that lives only
  // on a container still surfaces its parent row.
  const awdPos = awdPosSorted.filter(p =>
    searchMatchesPOOrContainers(p, containerMap[p.id], searchQuery)
  )

  const totalVal = awdPos.reduce((s, p) => s + (p.po_value || 0), 0)
  const labelForFooter = showCompleted ? 'completed POs' : 'open POs'

  // Column headers — Notes is dropped on the Completed tab per Tony's
  // round-10 request. ETA is also hidden on the Completed tab. PO Value
  // shows on completed rows too (round 21) so the archive carries the
  // dollar amount per row, just without the combined-total footer.
  // The last column is "Date Received" on the Completed tab and
  // "Est. Receive Date" otherwise.
  const headersFull = showCompleted
    ? ['Supplier','PO #','Entity','Dest','Product','Status','Order Date','PO Value','Boxes','Containers','Docs','Date Received']
    : ['Supplier','PO #','Entity','Dest','Product','Status','Order Date','ETA','PO Value','Boxes','Containers','Notes','Docs','Est. Receive Date']
  const headers = hideDest ? headersFull.filter(h => h !== 'Dest') : headersFull
  const colCount = headers.length

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {headers.map(h => <th key={h} style={thS}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {awdPos.length === 0 && (
            <tr><td colSpan={colCount} style={{ padding: 30, textAlign: 'center', color: '#888', fontSize: 12 }}>
              {normalizeQuery(searchQuery) && awdPosSorted.length > 0
                ? `No POs match "${searchQuery}"`
                : emptyMessage}
            </td></tr>
          )}
          {awdPos.map(p => {
            // Force-expand the row when the search query matches via a
            // container field — that way the user immediately sees which
            // container surfaced the result without an extra click.
            const containerMatch = !!normalizeQuery(searchQuery) &&
              searchMatchesAnyContainer(containerMap[p.id], searchQuery)
            // Round 27 — BB-only tables (sg-bb / rt-bb) split FCL/LCL on
            // their containers; AWD/FBA tables collapse the column to a
            // simple Boxes count. Detect by checking that BB is the only
            // dest option so the same AWDPOTable handles both modes.
            const isBB = destOptions.length === 1 && destOptions[0] === 'BB'
            return (
              <AWDPORow key={p.id} po={p} upsertPO={upsertPO} deletePO={deletePO}
                destOptions={destOptions} showModal={showModal} closeModal={closeModal}
                allowContainerExpand={allowContainerExpand}
                readOnlyStatus={readOnlyStatus}
                hideDest={hideDest}
                isBB={isBB}
                requireMultipleToExpand={requireMultipleToExpand}
                preloadedContainers={containerMap[p.id]}
                forceExpanded={containerMatch} />
            )
          })}
          {awdPos.length > 0 && (
            <tr style={{ background: '#f5f5f5', borderTop: '2px solid #ddd' }}>
              <td colSpan={colCount - 1} style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, textAlign: 'right' }}>
                {awdPos.length} {labelForFooter}{(totalVal && !showCompleted) ? `   |   Total: ${fmtMoney(totalVal)}` : ''}
              </td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// Shared add-PO row used by RT and SG tabs.
// tableId is set by the caller (rt-bb, rt-awd, sg-bb, sg-awdfba) so the right
// section gets the right PO.
export function AddAWDPORow({ tableId, entity, defaultDest, destOptions, suppliers, productOptions = [], upsertPO, label = 'Add a new PO', hideDest = false }) {
  const [row, setRow] = useState({
    supplier: '', id: '', status: 'Committed',
    dest: defaultDest || (destOptions && destOptions[0]) || '',
    order_date: '', eta: '', po_value: '', product_type: '',
  })
  // Round 22 — track which required fields are missing so the user gets a
  // visible red border + inline message instead of a silent no-op.
  // Required = supplier + PO #. Other fields are optional / can be filled in
  // later from the row itself.
  const [errors, setErrors] = useState({})

  // Helper that returns the input style merged with a red error border when
  // the named field is currently flagged. Used inline below so each field
  // can opt in just by passing its key.
  const errBorder = '#E24B4A'
  const errBg = '#FFF4F4'
  const styleFor = (base, key) => errors[key]
    ? { ...base, border: `1.5px solid ${errBorder}`, background: errBg }
    : base
  // Clear a single field's error when the user starts typing/selecting it
  // again — feels more responsive than waiting for next submit.
  const clearError = (key) => {
    if (!errors[key]) return
    setErrors(prev => {
      const next = { ...prev }; delete next[key]; return next
    })
  }

  const submit = () => {
    const errs = {}
    if (!row.supplier) errs.supplier = true
    if (!row.id || !String(row.id).trim()) errs.id = true
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    setErrors({})
    upsertPO({
      id: row.id,
      supplier: row.supplier,
      status: row.status,
      dest: row.dest || defaultDest || '',
      entity,
      table_id: tableId,
      order_date: row.order_date || null,
      eta: row.eta || null,
      po_value: row.po_value ? +row.po_value : null,
      product_type: row.product_type || null,
    })
    setRow({
      supplier: '', id: '', status: 'Committed',
      dest: defaultDest || (destOptions && destOptions[0]) || '',
      order_date: '', eta: '', po_value: '', product_type: '',
    })
  }

  const hasErrors = Object.keys(errors).length > 0

  return (
    <div style={{ marginTop: 10, border: '1px solid #ddd', borderRadius: 8, padding: '10px 12px', background: '#f8f8f6' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#1F3864', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <select
          style={styleFor(addSelS, 'supplier')}
          value={row.supplier}
          onChange={e => { setRow(r => ({...r, supplier: e.target.value})); clearError('supplier') }}>
          <option value=''>Supplier</option>
          {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          style={styleFor(addInpS, 'id')}
          placeholder="PO #"
          value={row.id}
          onChange={e => { setRow(r => ({...r, id: e.target.value})); clearError('id') }} />
        {!hideDest && <select style={addSelS} value={row.dest} onChange={e => setRow(r => ({...r, dest: e.target.value}))}>
          {destOptions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>}
        {productOptions.length > 0 && (
          <select style={addSelS} value={row.product_type} onChange={e => setRow(r => ({...r, product_type: e.target.value}))}>
            <option value=''>Product</option>
            {productOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <select style={addSelS} value={row.status} onChange={e => setRow(r => ({...r, status: e.target.value}))}>
          <option>Draft</option>
          <option>Committed</option>
        </select>
        <input type="date" style={addInpS} value={row.order_date} onChange={e => setRow(r => ({...r, order_date: e.target.value}))} />
        <input type="date" style={addInpS} value={row.eta} onChange={e => setRow(r => ({...r, eta: e.target.value}))} />
        <input type="number" style={{ ...addInpS, width: 100 }} placeholder="Value $" value={row.po_value} onChange={e => setRow(r => ({...r, po_value: e.target.value}))} />
        <button
          style={{ padding: '5px 14px', background: '#1F3864', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 500, cursor: 'pointer' }}
          onClick={submit}
        >
          + Add PO
        </button>
      </div>
      {/* Inline validation message — only shows after a submit attempt that
          had missing required fields. Listing the missing fields by name
          makes it obvious which red box to fill. */}
      {hasErrors && (
        <div style={{ marginTop: 8, fontSize: 11, color: errBorder, fontWeight: 600 }}>
          Please fill out the highlighted field{Object.keys(errors).length > 1 ? 's' : ''}:
          {' '}
          {[
            errors.supplier ? 'Supplier' : null,
            errors.id ? 'PO #' : null,
          ].filter(Boolean).join(', ')}
        </div>
      )}
    </div>
  )
}

// Default export: the AWD/FBA Receiving tab. Add-PO has been removed per
// Tony's round-7 request — new AWD/FBA POs are now added from the SG and RT
// tabs directly (using AddAWDPORow there).
export default function AWDTab({ pos, upsertPO, deletePO, showModal, closeModal, searchQuery = '', setSearchQuery = () => {} }) {
  // Receiving tabs only show committed POs. Drafts are still editable on
  // the RT / SG tabs but the warehouse shouldn't see them.
  const awdPos = pos
    .filter(p => p.table_id === 'sg-awdfba' || p.table_id === 'rt-awd')
    .filter(p => p.status !== 'Complete' && p.status !== 'Draft')

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#4d7aaa,#6c91b9)', borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#000', fontSize: 16, fontWeight: 700, margin: 0 }}>Amazon Receiving</h2>
          <p style={{ color: '#000', fontSize: 11, margin: '2px 0 0' }}>All committed AWD and FBA inbound orders — click a row to expand and manage containers. New POs are added from the RT or SG tabs.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <SearchBox value={searchQuery} onChange={setSearchQuery} />
          <div style={{ background: 'rgba(255,255,255,.35)', borderRadius: 8, padding: '8px 16px', textAlign: 'center' }}>
            <div style={{ color: '#000', fontSize: 20, fontWeight: 700 }}>{awdPos.length}</div>
            <div style={{ color: '#000', fontSize: 10 }}>Open POs</div>
          </div>
        </div>
      </div>

      <AWDPOTable pos={pos} upsertPO={upsertPO} deletePO={deletePO}
        showModal={showModal} closeModal={closeModal}
        readOnlyStatus={true} hideDrafts={true}
        searchQuery={searchQuery} />
    </div>
  )
}

const thS = { background: '#f5f5f3', fontSize: 10, fontWeight: 500, color: '#666', padding: '7px 8px', textAlign: 'center', borderRight: '1px solid #eee', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap', letterSpacing: '.04em', textTransform: 'uppercase' }
const tdS = { padding: '7px 8px', borderRight: '1px solid #eee', fontSize: 12, textAlign: 'center', verticalAlign: 'middle' }
const selS = { fontSize: 11, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 5, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }
const addSelS = { fontSize: 11, padding: '4px 6px', border: '1px solid #ddd', borderRadius: 4, minWidth: 120 }
const addInpS = { fontSize: 11, padding: '4px 6px', border: '1px solid #ddd', borderRadius: 4, minWidth: 110 }
