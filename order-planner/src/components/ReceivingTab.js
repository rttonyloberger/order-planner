import React from 'react'
import { SUPP_COLORS, SG_PRODUCTS, RT_PRODUCTS, daysUntil, arrivalColor, fmtDate, fmtMoney, TODAY } from '../constants'

export default function ReceivingTab({ pos, upsertPO, showModal, closeModal }) {
  const bbPos = pos.filter(p => p.dest === 'BB' && p.status !== 'Complete')
    .sort((a, b) => {
      if (!a.eta && !b.eta) return 0
      if (!a.eta) return 1
      if (!b.eta) return -1
      return new Date(a.eta) - new Date(b.eta)
    })

  const arriving30 = bbPos.filter(p => { const d = daysUntil(p.eta); return d !== null && d >= 0 && d <= 30 }).length
  const overdue = bbPos.filter(p => { const d = daysUntil(p.eta); return d !== null && d < 0 }).length
  const totalVal = bbPos.reduce((s, p) => s + (p.po_value || 0), 0)

  const updateField = (po, field, val) => {
    upsertPO({ ...po, [field]: val || null })
  }

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#5C2E00,#7B3F00)', borderRadius: 10, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0 }}>Big Bend Receiving</h2>
          <p style={{ color: '#FFCC99', fontSize: 11, margin: '2px 0 0' }}>All open inbound shipments to Big Bend — RT and SG combined, sorted by arrival</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[{ num: bbPos.length, lbl: 'Open POs' }, { num: arriving30, lbl: 'Arriving ≤30d' }, { num: overdue, lbl: 'Overdue' }].map(s => (
            <div key={s.lbl} style={{ background: 'rgba(255,255,255,.15)', borderRadius: 8, padding: '8px 16px', textAlign: 'center', minWidth: 80 }}>
              <div style={{ color: '#fff', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{s.num}</div>
              <div style={{ color: '#FFCC99', fontSize: 10, marginTop: 3 }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {bbPos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>No open BB shipments</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: 8 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                {['Supplier','PO #','Entity','Product','Status','Order Date','ETA','PO Value','Tracking','FCL / LCL','Days Away'].map(h => (
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
                return (
                  <tr key={p.id} style={{ background: sc.bg + '18' }}>
                    <td style={{ ...tdStyle, fontWeight: 700, background: sc.bg, color: sc.fc, borderLeft: `3px solid ${sc.b}`, minWidth: 140, textAlign: 'left' }}>{p.supplier}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, color: '#666' }}>#{p.id}</td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: p.entity === 'RT' ? '#E6F1FB' : '#EAF3DE', color: p.entity === 'RT' ? '#0C447C' : '#27500A' }}>{p.entity}</span>
                    </td>
                    <td style={{ ...tdStyle, minWidth: 130 }}>
                      <select style={selStyle} value={p.product_type || ''} onChange={e => updateField(p, 'product_type', e.target.value)}>
                        <option value=''>-- Select --</option>
                        {opts.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 600, background: p.status === 'Committed' ? '#E6F1FB' : '#FAEEDA', color: p.status === 'Committed' ? '#0C447C' : '#633806' }}>{p.status}</span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11, color: '#666' }}>{fmtDate(p.order_date)}</td>
                    <td style={tdStyle}>
                      <input type="date" defaultValue={p.eta || ''} onBlur={e => updateField(p, 'eta', e.target.value)} style={{ fontSize: 11, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: 110, cursor: 'pointer' }} />
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>{fmtMoney(p.po_value)}</td>
                    <td style={{ ...tdStyle, minWidth: 130 }}>
                      {p.tracking_url
                        ? <><a href={p.tracking_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#0C447C' }}>Track shipment</a><br /><span style={{ fontSize: 9, color: '#C00000', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => updateField(p, 'tracking_url', '')}>remove</span></>
                        : <input type="text" placeholder="Paste tracking URL" style={{ fontSize: 10, padding: '3px 5px', border: '1px solid #ddd', borderRadius: 4, width: '100%' }} onBlur={e => e.target.value && updateField(p, 'tracking_url', e.target.value)} />
                      }
                    </td>
                    <td style={{ ...tdStyle, minWidth: 120 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <select style={smallSelStyle} value={p.ship_mode || ''} onChange={e => updateField(p, 'ship_mode', e.target.value)}>
                          <option value=''>--</option>
                          <option value='FCL'>FCL</option>
                          <option value='LCL'>LCL</option>
                        </select>
                        {p.ship_mode === 'FCL' && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#E6F1FB', color: '#0C447C' }}>FCL</span>}
                        {p.ship_mode === 'LCL' && <>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#EEEDFE', color: '#3C3489' }}>LCL</span>
                          <input type="number" placeholder="# boxes" defaultValue={p.box_count || ''} onBlur={e => updateField(p, 'box_count', e.target.value ? +e.target.value : null)} style={{ fontSize: 10, padding: '2px 5px', border: '1px solid #ddd', borderRadius: 4, width: 65 }} />
                        </>}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700, minWidth: 80, background: ac.bg, color: ac.fc, border: `1px solid ${ac.border}` }}>{dTxt}</td>
                  </tr>
                )
              })}
              <tr style={{ background: '#f5f5f5', borderTop: '2px solid #ddd' }}>
                <td colSpan={10} style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, textAlign: 'right' }}>
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
