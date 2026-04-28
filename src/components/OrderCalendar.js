import React, { useState, useEffect } from 'react'
import { projectedOrders, shortMonth, TODAY, SUPP_DESTS, SG_PRODUCTS, fmtDate } from '../constants'

// Round 23 (revised round 24) — per-cell calendar notes.
//
// Storage: localStorage. The Supabase calendar_state table only has the
// columns the checkbox/deleted slots use, so writing a `note` column to it
// would silently fail (Supabase rejects unknown columns and the upsert
// error went to console only — that's why notes were "going into the abyss"
// on the first attempt). localStorage is per-device but unblocks the
// feature without requiring a SQL migration. If Tony later wants
// cross-device sync, run:
//   ALTER TABLE calendar_state ADD COLUMN note TEXT;
// and we can swap the localStorage calls for upsertCalState.
//
// Per entity (rt | sg) we store ONE JSON object under op.cnotes.<entity>:
//   { "<rowName>|<isoDate>": "<note text>", ... }
// rowName = supplier name on RT, product name on SG.
const cnotesStorageKey = (entityKey) => `op.cnotes.${entityKey}`
const cnoteInnerKey = (rowName, isoDate) => `${rowName}|${isoDate}`
function parseCnoteInner(k) {
  // rowName itself can contain a pipe in theory — split off the date from
  // the end and treat everything before it as rowName.
  const parts = k.split('|')
  if (parts.length < 2) return null
  const isoDate = parts[parts.length - 1]
  const rowName = parts.slice(0, -1).join('|')
  return { rowName, isoDate }
}

export default function OrderCalendar({
  suppliers, styleMap, calState, months, upsertCalState, isSG, pos,
  // new props — required for the "create PO" popup that opens when a slot is checked off.
  upsertPO, showModal, closeModal,
}) {
  const today = TODAY
  const entityKey = isSG ? 'sg' : 'rt'

  // List of selectable rows for the note modal — products on SG, suppliers on RT.
  const noteRowOptions = suppliers.map(s => s.name)

  // Live note state, hydrated from localStorage on mount.
  const [notesMap, setNotesMap] = useState({})
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(cnotesStorageKey(entityKey))
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') setNotesMap(parsed)
      }
    } catch {}
  }, [entityKey])

  // Persist the map back to localStorage every time it changes. setNotesMap
  // is the single source of truth — readers below use notesMap directly.
  const writeNotesMap = (next) => {
    setNotesMap(next)
    try { window.localStorage.setItem(cnotesStorageKey(entityKey), JSON.stringify(next)) } catch {}
  }

  // Build the array of live notes for the cells to filter by month/row.
  const allNotes = Object.entries(notesMap)
    .map(([innerKey, text]) => {
      const parsed = parseCnoteInner(innerKey)
      if (!parsed) return null
      return { ...parsed, text }
    })
    .filter(Boolean)

  // Open the note modal. preset can include {rowName, isoDate, text} when
  // editing an existing note so the form starts pre-filled. Editing mode
  // also adds an explicit Delete button to the modal footer (Round 25).
  const openNoteModal = (preset = {}) => {
    let formState = {
      rowName: preset.rowName || '',
      isoDate: preset.isoDate || '',
      text: preset.text || '',
    }
    const editing = !!preset.editing
    const modalOpts = {
      title: editing ? 'Edit calendar note' : 'Add calendar note',
      body: editing
        ? 'Update the note attached to this calendar cell, or use Delete to remove it.'
        : 'Pick a supplier and a date — your note will pin to that cell on the calendar.',
      confirmLabel: editing ? 'Save changes' : 'Add note',
      onConfirm: () => {
        if (!formState.rowName || !formState.isoDate) return
        const innerKey = cnoteInnerKey(formState.rowName, formState.isoDate)
        const trimmed = (formState.text || '').trim()
        const next = { ...notesMap }
        if (!trimmed) delete next[innerKey]
        else next[innerKey] = trimmed
        writeNotesMap(next)
        closeModal()
      },
      children: (
        <CalendarNoteForm
          rows={noteRowOptions}
          initial={formState}
          isSG={isSG}
          editing={editing}
          onChange={(patch) => { formState = { ...formState, ...patch } }}
        />
      ),
    }
    if (editing) {
      // Round 25 — explicit delete button when editing. Targets the original
      // preset key so renaming the row/date in the form (which is locked in
      // edit mode anyway) can't desync the delete from the note shown.
      modalOpts.onDelete = () => {
        const innerKey = cnoteInnerKey(preset.rowName, preset.isoDate)
        const next = { ...notesMap }
        delete next[innerKey]
        writeNotesMap(next)
        closeModal()
      }
      modalOpts.deleteLabel = 'Delete note'
    }
    showModal(modalOpts)
  }

  // Open the Create-PO modal when the user clicks the green checkmark on a
  // projected-order slot. If the slot is already checked, clicking again just
  // un-checks it (toggle behaviour).
  const togSlot = async (key, meta) => {
    const current = calState[key]

    // Already checked → treat as toggle-off. No modal.
    if (current?.checked) {
      await upsertCalState(key, { checked: false, deleted: current?.deleted || false })
      return
    }

    // Not yet checked → show the Create-PO popup.
    if (!showModal) {
      // Fallback if no modal system available
      await upsertCalState(key, { checked: true, deleted: false })
      return
    }

    openCreatePOModal(key, meta)
  }

  const openCreatePOModal = (key, meta) => {
    // meta: { supplier, productName, isoDate, dest, isSG }
    const { supplier, productName, isoDate, dest, isSG: slotIsSG } = meta

    // Destination options depend on entity
    const destOpts = slotIsSG ? ['AWD', 'FBA', 'BB'] : ['BB', 'AWD', 'RT AWD']

    const initial = {
      poId: '',
      eta: '',
      poValue: '',
      productType: slotIsSG ? (productName || '') : '',
      dest: dest || destOpts[0],
      shipMode: '',
    }

    // Store form state on the modal object via a wrapping component — we render
    // the form inside `children`. We use a closure `formState` to capture the
    // latest values when Confirm is clicked.
    let formState = { ...initial }

    const handleConfirm = async () => {
      if (!formState.poId) return
      const entity = slotIsSG ? 'SG' : 'RT'
      const tableId = slotIsSG
        ? (formState.dest === 'BB' ? 'sg-bb' : 'sg-awdfba')
        : (formState.dest === 'BB' ? 'rt-bb' : 'rt-awd')

      await upsertPO({
        id: formState.poId,
        supplier: supplier,
        status: 'Committed',
        dest: formState.dest,
        entity,
        table_id: tableId,
        order_date: isoDate,
        eta: formState.eta || null,
        po_value: formState.poValue ? +formState.poValue : null,
        product_type: slotIsSG ? (formState.productType || productName) : null,
        ship_mode: formState.shipMode || null,
      })
      await upsertCalState(key, { checked: true, deleted: false })
      closeModal()
    }

    showModal({
      title: 'Create PO for this scheduled order?',
      body: `${supplier}${productName ? ' — ' + productName : ''} · order date ${formatIso(isoDate)}`,
      confirmLabel: 'Create PO',
      onConfirm: handleConfirm,
      children: (
        <CreatePOForm
          initial={initial}
          destOpts={destOpts}
          isSG={slotIsSG}
          onChange={(v) => { formState = { ...formState, ...v } }}
        />
      ),
    })
  }

  const addedForSGProd = (prodName) => {
    return pos.filter(p =>
      (p.table_id === 'sg-awdfba' || p.table_id === 'sg-bb') &&
      p.product_type === prodName &&
      p.status !== 'Complete'
    )
  }

  const addedForRTSupp = (suppName) => {
    return pos.filter(p =>
      (p.table_id === 'rt-awd' || p.table_id === 'rt-bb') &&
      p.supplier === suppName &&
      p.status !== 'Complete'
    )
  }

  const dTag = (dest) => {
    const lbl = dest === 'AWD' || dest === 'RT AWD' ? 'AWD' : dest === 'FBA' ? 'FBA' : 'BB'
    const s = lbl === 'AWD' ? { bg: '#E6F1FB', fc: '#0C447C' } : lbl === 'FBA' ? { bg: '#EEEDFE', fc: '#3C3489' } : { bg: '#F1EFE8', fc: '#444441' }
    return <span key={lbl + Math.random()} style={{ display: 'inline-block', fontSize: 9, padding: '1px 5px', borderRadius: 8, fontWeight: 600, marginLeft: 2, verticalAlign: 'middle', background: s.bg, color: s.fc }}>{lbl}</span>
  }

  return (
    <div>
      {/* Round 23 — "+ Add Calendar Note" affordance. Sits directly above the
          calendar so it's findable without taking space inside cells. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button
          onClick={() => openNoteModal()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 6,
            background: '#E6F1FB', border: '1.5px solid #378ADD',
            color: '#0C447C', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
          title="Pin a note to a specific cell on this calendar"
        >
          <span style={{ fontSize: 13, lineHeight: 1 }}>📝</span> Add Calendar Note
        </button>
      </div>
    <div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: 8, marginBottom: 4 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...thS, textAlign: 'left', paddingLeft: 12, minWidth: 175, borderRight: '2px solid #ddd' }}>
              {isSG ? 'Product' : 'Supplier'}
            </th>
            {months.map(m => {
              const isCur = m.getMonth() === today.getMonth() && m.getFullYear() === today.getFullYear()
              return <th key={m.getTime()} style={{ ...thS, minWidth: 100, background: isCur ? '#E6F1FB' : undefined, color: isCur ? '#0C447C' : undefined }}>{shortMonth(m)}</th>
            })}
          </tr>
        </thead>
        <tbody>
          {suppliers.map(s => {
            const st = styleMap[s.name] || { bg: '#f5f5f5', fc: '#333', b: '#ccc' }
            const ords = projectedOrders(s.last ? new Date(s.last) : null, s.freq, months)
            const added = isSG ? addedForSGProd(s.name) : addedForRTSupp(s.name)

            return (
              <tr key={s.name}>
                <td style={{ fontWeight: 700, fontSize: 12, padding: '8px 10px 8px 12px', whiteSpace: 'nowrap', borderRight: '2px solid #ddd', textAlign: 'left', verticalAlign: 'middle', background: st.bg, color: st.fc, borderBottom: `2px solid ${st.b}` }}>
                  {s.name}
                </td>
                {months.map(m => {
                  const dates = ords[m.getTime()] || []
                  const monthAdded = added.filter(p => {
                    const od = p.order_date ? new Date(p.order_date + 'T00:00:00') : null
                    if (!od) return false
                    const end = new Date(m.getFullYear(), m.getMonth() + 1, 0)
                    return od >= m && od <= end
                  })
                  const hasContent = dates.length > 0 || monthAdded.length > 0
                  return (
                    <td key={m.getTime()} style={{ textAlign: 'center', padding: '5px 4px', minWidth: 100, fontSize: 11, fontWeight: 700, lineHeight: 2.0, verticalAlign: 'top', height: 90, background: hasContent ? st.bg : '#f9f9f7', color: st.fc, borderBottom: `${hasContent ? 2 : 1}px solid ${hasContent ? st.b : st.b + '33'}` }}>
                      {isSG ? (
                        // SG: AWD/FBA + BB slots per projected date
                        dates.map(d => {
                          const isoD = d.toISOString().split('T')[0]
                          const disp = `${d.getMonth()+1}/${d.getDate()}`
                          const awdKey = `sg|${s.name}|${isoD}|awdfba`
                          const bbKey = `sg|${s.name}|${isoD}|bb`
                          const awdState = calState[awdKey]
                          const bbState = calState[bbKey]
                          if (awdState?.deleted && bbState?.deleted) return null
                          return (
                            <div key={isoD}>
                              {!awdState?.deleted && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center', marginBottom: 3 }}>
                                  <span style={{ fontWeight: 700, fontSize: 11, textDecoration: awdState?.checked ? 'line-through' : 'none' }}>{disp}</span>
                                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, fontWeight: 600, marginLeft: 2, background: '#EBF3FB', color: '#2E4D7B' }}>AWD/FBA</span>
                                  <button
                                    onClick={() => togSlot(awdKey, { supplier: 'CNBM INTERNATIONAL', productName: s.name, isoDate: isoD, dest: 'AWD', isSG: true })}
                                    style={ckBtnStyle(awdState?.checked)}
                                  >{awdState?.checked ? '✓' : ''}</button>
                                  <button onClick={() => upsertCalState(awdKey, { checked: false, deleted: true })} style={delBtnStyle}>✕</button>
                                </div>
                              )}
                              {!bbState?.deleted && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center', marginBottom: 3 }}>
                                  <span style={{ width: 28, display: 'inline-block' }}></span>
                                  {dTag('BB')}
                                  <button
                                    onClick={() => togSlot(bbKey, { supplier: 'CNBM INTERNATIONAL', productName: s.name, isoDate: isoD, dest: 'BB', isSG: true })}
                                    style={ckBtnStyle(bbState?.checked)}
                                  >{bbState?.checked ? '✓' : ''}</button>
                                  <button onClick={() => upsertCalState(bbKey, { checked: false, deleted: true })} style={delBtnStyle}>✕</button>
                                </div>
                              )}
                            </div>
                          )
                        })
                      ) : (
                        // RT: one slot per known dest per projected date
                        dates.map(d => {
                          const isoD = d.toISOString().split('T')[0]
                          const disp = `${d.getMonth()+1}/${d.getDate()}`
                          const knownDests = SUPP_DESTS[s.name] || []
                          return knownDests.map((dest, di) => {
                            const key = `rt|${s.name}|${isoD}|${dest}`
                            const slot = calState[key]
                            if (slot?.deleted) return null
                            return (
                              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center', marginBottom: 3 }}>
                                {di === 0 ? <span style={{ fontWeight: 700, fontSize: 11, textDecoration: slot?.checked ? 'line-through' : 'none' }}>{disp}</span> : <span style={{ width: 28 }} />}
                                {dTag(dest)}
                                <button
                                  onClick={() => togSlot(key, { supplier: s.name, productName: null, isoDate: isoD, dest, isSG: false })}
                                  style={ckBtnStyle(slot?.checked)}
                                >{slot?.checked ? '✓' : ''}</button>
                                <button onClick={() => upsertCalState(key, { checked: false, deleted: true })} style={delBtnStyle}>✕</button>
                              </div>
                            )
                          })
                        })
                      )}
                      {/* Added POs off projected dates */}
                      {monthAdded.filter(p => {
                        const od = p.order_date
                        return !dates.some(d => d.toISOString().split('T')[0] === od)
                      }).map(p => {
                        const key = `added-po|${p.id}`
                        const slot = calState[key]
                        const od = p.order_date ? new Date(p.order_date + 'T00:00:00') : null
                        const disp = od ? `${od.getMonth()+1}/${od.getDate()}` : '?'
                        return (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center', marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, fontSize: 11 }}>{disp}</span>
                            {dTag(p.dest)}
                            <button onClick={() => upsertCalState(key, { checked: !(slot?.checked ?? true), deleted: false })} style={ckBtnStyle(slot?.checked ?? true)}>{(slot?.checked ?? true) ? '✓' : ''}</button>
                          </div>
                        )
                      })}
                      {/* Round 23 — calendar notes pinned to this row in this
                          month. Each badge shows 📝 + truncated preview, full
                          text exposed via the native title tooltip on hover.
                          Click a badge to edit/delete in the same modal. */}
                      {(() => {
                        const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0)
                        const cellNotes = allNotes.filter(n => {
                          if (n.rowName !== s.name) return false
                          const [yy, mm, dd] = n.isoDate.split('-').map(Number)
                          if (!yy || !mm || !dd) return false
                          const nd = new Date(yy, mm - 1, dd)
                          return nd >= m && nd <= monthEnd
                        })
                        if (!cellNotes.length) return null
                        return (
                          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center' }}>
                            {cellNotes.map(({ rowName, isoDate, text }) => (
                              <NoteBadge
                                key={isoDate}
                                rowName={rowName}
                                isoDate={isoDate}
                                text={text}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openNoteModal({ rowName, isoDate, text, editing: true })
                                }}
                              />
                            ))}
                          </div>
                        )
                      })()}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    </div>
  )
}

// Round 26 — hover-popup badge for calendar notes. Replaces the native
// `title` tooltip (which was small, slow to appear, and styled by the OS)
// with a custom React tooltip that renders a sticky-note-style bubble next
// to the badge while the cursor is over it. Click still routes to the
// edit/delete modal via the `onClick` prop.
function NoteBadge({ rowName, isoDate, text, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <span
      style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClick}
        aria-label={`Edit note for ${rowName} on ${isoDate}`}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: '50%',
          background: '#E6F1FB', border: '1.5px solid #378ADD',
          color: '#0C447C', fontSize: 12, cursor: 'pointer', padding: 0,
        }}
      >
        📝
      </button>
      {hovered && text && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            minWidth: 180,
            maxWidth: 260,
            padding: '8px 10px',
            background: '#FFF8DC',
            border: '1.5px solid #BA7517',
            borderRadius: 6,
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
            fontSize: 11,
            fontWeight: 500,
            color: '#3a2a08',
            textAlign: 'left',
            lineHeight: 1.4,
            whiteSpace: 'normal',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 10, color: '#633806', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
            {fmtDate(isoDate)}
          </div>
          <div>{text}</div>
        </div>
      )}
    </span>
  )
}

// Round 23 — form rendered inside the calendar-note modal. Two required
// fields (row + date) plus a freeform textarea. When `editing`, the row +
// date are presented read-only so the user is clearly editing the note that
// they clicked on rather than retargeting it.
function CalendarNoteForm({ rows, initial, isSG, editing, onChange }) {
  const [rowName, setRowName] = useState(initial.rowName || '')
  const [isoDate, setIsoDate] = useState(initial.isoDate || '')
  const [text, setText] = useState(initial.text || '')

  const push = (patch) => {
    const next = { rowName, isoDate, text, ...patch }
    onChange(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ ...labelS, flex: 1 }}>
          {isSG ? 'Product' : 'Supplier'} <span style={{ color: '#A32D2D' }}>*</span>
          {editing ? (
            <input value={rowName} disabled style={{ ...inputS, background: '#f5f5f3', color: '#444' }} />
          ) : (
            <select
              value={rowName}
              onChange={e => { setRowName(e.target.value); push({ rowName: e.target.value }) }}
              style={inputS}
              autoFocus
            >
              <option value=''>-- Select --</option>
              {rows.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </label>
        <label style={{ ...labelS, flex: 1 }}>
          Date <span style={{ color: '#A32D2D' }}>*</span>
          {editing ? (
            <input value={isoDate} disabled style={{ ...inputS, background: '#f5f5f3', color: '#444' }} />
          ) : (
            <input
              type="date"
              value={isoDate}
              onChange={e => { setIsoDate(e.target.value); push({ isoDate: e.target.value }) }}
              style={inputS}
            />
          )}
        </label>
      </div>
      <label style={labelS}>
        Note
        <textarea
          value={text}
          onChange={e => { setText(e.target.value); push({ text: e.target.value }) }}
          placeholder={editing ? 'Clear this and save to delete the note.' : 'e.g. Place a BIG order of lead jigs here for February shipment'}
          rows={4}
          style={{ ...inputS, fontFamily: 'inherit', resize: 'vertical' }}
          autoFocus={editing}
        />
      </label>
      <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>
        Notes pin to a specific cell. Hover the 📝 badge on the calendar to read.
      </div>
    </div>
  )
}

// Small controlled form used inside the Create-PO modal.
function CreatePOForm({ initial, destOpts, isSG, onChange }) {
  const [poId, setPoId] = useState(initial.poId)
  const [eta, setEta] = useState(initial.eta)
  const [poValue, setPoValue] = useState(initial.poValue)
  const [productType, setProductType] = useState(initial.productType)
  const [dest, setDest] = useState(initial.dest)
  const [shipMode, setShipMode] = useState(initial.shipMode)

  const push = (patch) => {
    const next = { poId, eta, poValue, productType, dest, shipMode, ...patch }
    onChange(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
      <label style={labelS}>
        PO # <span style={{ color: '#A32D2D' }}>*</span>
        <input
          value={poId}
          onChange={e => { setPoId(e.target.value); push({ poId: e.target.value }) }}
          placeholder="e.g. SG-10421"
          style={inputS}
          autoFocus
        />
      </label>

      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ ...labelS, flex: 1 }}>
          Destination
          <select value={dest} onChange={e => { setDest(e.target.value); push({ dest: e.target.value }) }} style={inputS}>
            {destOpts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label style={{ ...labelS, flex: 1 }}>
          Estimated Receive Date
          <input type="date" value={eta} onChange={e => { setEta(e.target.value); push({ eta: e.target.value }) }} style={inputS} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ ...labelS, flex: 1 }}>
          PO Value ($)
          <input
            type="number"
            value={poValue}
            onChange={e => { setPoValue(e.target.value); push({ poValue: e.target.value }) }}
            placeholder="0.00"
            style={inputS}
          />
        </label>
        {isSG && (
          <label style={{ ...labelS, flex: 1 }}>
            Product
            <select value={productType} onChange={e => { setProductType(e.target.value); push({ productType: e.target.value }) }} style={inputS}>
              <option value=''>-- Select --</option>
              {SG_PRODUCTS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        )}
        {!isSG && (
          <label style={{ ...labelS, flex: 1 }}>
            Ship Mode
            <select value={shipMode} onChange={e => { setShipMode(e.target.value); push({ shipMode: e.target.value }) }} style={inputS}>
              <option value=''>--</option>
              <option value='FCL'>FCL</option>
              <option value='LCL'>LCL</option>
            </select>
          </label>
        )}
      </div>

      <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>
        The slot will be checked off once the PO is created. You can edit the rest of the details (tracking #, boxes, etc.) on the corresponding tab.
      </div>
    </div>
  )
}

function formatIso(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${parseInt(m)}/${parseInt(d)}/${y}`
}

const thS = { background: '#f5f5f3', fontSize: 10, fontWeight: 500, color: '#666', padding: '7px 8px', textAlign: 'center', borderRight: '1px solid #eee', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap', letterSpacing: '.04em', textTransform: 'uppercase' }
const ckBtnStyle = (done) => ({ background: done ? '#EAF3DE' : 'none', border: done ? '1.5px solid #639922' : '1.5px solid #B4B2A9', borderRadius: 4, width: 20, height: 20, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#27500A', verticalAlign: 'middle', marginLeft: 2, flexShrink: 0 })
const delBtnStyle = { background: 'none', border: 'none', fontSize: 10, color: '#B4B2A9', cursor: 'pointer', padding: '0 1px', opacity: .6, lineHeight: 1 }
const labelS = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#555', fontWeight: 600 }
const inputS = { fontSize: 12, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 5, fontFamily: 'inherit', background: '#fff' }
