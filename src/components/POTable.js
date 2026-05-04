import React, { useState } from 'react'
import { SUPP_COLORS, SG_PRODUCTS, RT_PRODUCTS, daysUntil, arrivalColor, fmtDate, fmtMoney } from '../constants'
import PODocsCell from './PODocsCell'
import PONotesCell from './PONotesCell'

// NOTE: Tracking columns were removed from this table on purpose. The
// BB Receiving tab is the single source of truth for tracking numbers,
// carriers, last-update, and per-container status. Having it on the
// RT tab too just caused double-entry and confused the team.

// Today's ISO (YYYY-MM-DD) for defaulting the "Date Received" popup.
function todayIso() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// Date-received form for the Complete modal. `dateRef.current` holds the
// chosen date; the surrounding handleStatus reads it on confirm.
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

export default function POTable({ tableId, pos, isSG, showShip, upsertPO, deletePO, showModal, closeModal }) {
  const rows = pos
    .filter(p => p.table_id === tableId)
    .filter(p => p.status !== 'Complete')
    .sort((a, b) => {
      if (!a.eta && !b.eta) return 0
      if (!a.eta) return 1
      if (!b.eta) return -1
      return new Date(a.eta) - new Date(b.eta)
    })
  // PO value is FACE VALUE — counted once per PO. Containers do not
  // multiply value (round 34). This sums the PO list, not containers.
  const total = rows.reduce((s, p) => s + (p.po_value || 0), 0)

  const update = (p, field, val) => upsertPO({ ...p, [field]: val ?? null })

  const handleStatus = (p, val) => {
    if (val === 'Delete') {
      showModal({
        title: 'Delete this PO?',
        body: `PO #${p.id} will be permanently deleted.`,
        confirmLabel: 'Yes, delete',
        danger: true,
        onConfirm: () => { deletePO(p.id); closeModal() }
      })
    } else if (val === 'Complete') {
      // Prompt for the actual date the PO was received before archiving it.
      const dateRef = { current: p.received_date || todayIso() }
      showModal({
        title: 'Mark as Complete',
        confirmLabel: 'Mark as Received',
        children: <DateReceivedForm dateRef={dateRef} poId={p.id} />,
        onConfirm: () => {
          upsertPO({ ...p, status: 'Complete', received_date: dateRef.current || todayIso() })
          closeModal()
        }
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

  // Column count tracker so footer/add-row colspans line up correctly.
  // Fixed columns: Supplier, PO #, Status, Dest, Order Date, ETA, PO Value,
  //                Notes, Docs, Est. Receive Date  (10)
  // Optional:     + Product (if isSG), + FCL/LCL (if showShip)
  const columnCount = 10 + (isSG ? 1 : 0) + (showShip ? 1 : 0)

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
              {showShip && <th style={thS}>FCL / LCL</th>}
              <th style={{ ...thS, minWidth: 160 }}>Notes</th>
              <th style={{ ...thS, minWidth: 200 }}>Docs</th>
              <th style={thS}>Est. Receive Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const sc = SUPP_COLORS[p.supplier] || { bg: '#f5f5f5', fc: '#333', b: '#ccc' }
              const days = daysUntil(p.eta)
              const ac = arrivalColor(days)
              const etaDateStr = p.eta ? (() => { const [y,m,d] = p.eta.split('-'); return `${parseInt(m)}/${parseInt(d)}/${y}` })() : 'TBD'
              const subText = days === null ? '' : days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `in ${days}d`
              const isDraft = (p.status || 'Draft') === 'Draft'
              const sc2 = statusColor(p.status)
              const db = p.dest === 'AWD' || p.dest === 'RT AWD' ? { bg: '#E6F1FB', fc: '#0C447C' } : p.dest === 'FBA' ? { bg: '#EEEDFE', fc: '#3C3489' } : { bg: '#F1EFE8', fc: '#444441' }

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
                    <input key={p.eta || 'none'} type="date" defaultValue={p.eta || ''} onBlur={e => update(p, 'eta', e.target.value)} style={dateInputS} />
                  </td>
                  <td style={{ ...tdS, fontSize: 11 }}>
                    {isDraft
                      ? <input type="number" defaultValue={p.po_value || ''} onBlur={e => update(p, 'po_value', e.target.value ? +e.target.value : null)} style={numInputS} placeholder="0.00" />
                      : fmtMoney(p.po_value)}
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
                  {/* Notes — free-form per-PO text. Same notes appear on BB Receiving. */}
                  <td style={{ ...tdS, minWidth: 160, verticalAlign: 'top', padding: '8px' }}>
                    <PONotesCell po={p} upsertPO={upsertPO} />
                  </td>
                  {/* Docs — attach/preview docs tied to the PO (packing lists, invoices, etc). */}
                  <td style={{ ...tdS, minWidth: 200, verticalAlign: 'top', padding: '8px' }}>
                    <PODocsCell poId={p.id} />
                  </td>
                  {/* Est. Receive Date — always displays the actual date plus a small "in Xd / Xd overdue" helper. */}
                  <td style={{ ...tdS, fontWeight: 700, minWidth: 110, background: ac.bg, color: ac.fc, border: `1px solid ${ac.border}` }}>
                    <div>
                      <div style={{ fontSize: 11 }}>{etaDateStr}</div>
                      {p.eta && subText && <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1 }}>{subText}</div>}
                    </div>
                  </td>
                </tr>
              )
            })}
            <tr style={{ background: '#f5f5f3', borderTop: '2px solid #ddd' }}>
              <td colSpan={columnCount - 1} style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, textAlign: 'right' }}>
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
              {showShip && <td style={tdS} />}
              <td style={tdS} />
              <td style={tdS} />
              <td style={tdS}><button style={{ padding: '5px 10px', background: '#1F3864', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 500, cursor: 'pointer' }} onClick={submitAdd}>+ Add</button></td>
            </tr>
          </tbody>
        </table>
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
