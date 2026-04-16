import React, { useState } from 'react'
import { SUPP_DESTS } from '../constants'

export default function ControlTab({ rtConfig, sgConfig, updateRTConfig, updateSGConfig, showModal, closeModal }) {
  const [saved, setSaved] = useState(null)

  const handleApply = (label) => {
    setSaved(label)
    setTimeout(() => setSaved(null), 2000)
    showModal({
      title: 'Changes saved',
      body: `${label} configuration updated. The calendar will reflect new projected order dates.`,
      confirmLabel: 'OK',
      onConfirm: closeModal
    })
  }

  const dTag = (d) => {
    const s = d === 'AWD' ? { bg: '#E6F1FB', fc: '#0C447C' } : { bg: '#F1EFE8', fc: '#444441' }
    return <span key={d} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, background: s.bg, color: s.fc, fontWeight: 600, marginRight: 3 }}>{d}</span>
  }

  return (
    <div>
      {/* RT Config */}
      <div style={sectionStyle}>
        <h3 style={h3Style}>RT Supplier Configuration</h3>
        <p style={descStyle}>Edit any value — changes save instantly and update the RT order calendar.</p>
        <div style={tblWrap}>
          <table style={tblStyle}>
            <thead>
              <tr>
                {['Supplier','Lead Time (days)','Order Freq (days)','Safety Stock (days)','Last Order Date','Destinations'].map((h,i) => (
                  <th key={h} style={{ ...thStyle, fontWeight: i === 2 ? 800 : 600, textDecoration: i === 2 ? 'underline' : 'none', textUnderlineOffset: i === 2 ? 3 : 0 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rtConfig.map((c, i) => (
                <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8f8f6' }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{c.name}</td>
                  <td style={tdStyle}><input style={inputStyle} type="number" defaultValue={c.lead_days} onBlur={e => updateRTConfig(c.id, { lead_days: +e.target.value })} /></td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}><input style={{ ...inputStyle, fontWeight: 700 }} type="number" defaultValue={c.freq_days} onBlur={e => updateRTConfig(c.id, { freq_days: +e.target.value })} /></td>
                  <td style={tdStyle}><input style={inputStyle} type="number" defaultValue={c.safety_days} onBlur={e => updateRTConfig(c.id, { safety_days: +e.target.value })} /></td>
                  <td style={tdStyle}><input style={{ ...inputStyle, width: 124 }} type="date" defaultValue={c.last_order_date || ''} onBlur={e => updateRTConfig(c.id, { last_order_date: e.target.value || null })} /></td>
                  <td style={tdStyle}>{(SUPP_DESTS[c.name] || []).map(d => dTag(d))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button style={applyBtn} onClick={() => handleApply('RT')}>Apply Changes to RT Calendar</button>
        <p style={noteStyle}>Order Freq controls how often projected order dates appear. Last Order Date is the baseline future dates are calculated from.</p>
      </div>

      {/* SG Config */}
      <div style={sectionStyle}>
        <h3 style={h3Style}>SG Product Configuration — CNBM INTERNATIONAL</h3>
        <p style={descStyle}>Edit any value — changes save instantly and update the SG order calendar.</p>
        <div style={tblWrap}>
          <table style={tblStyle}>
            <thead>
              <tr>
                {['Product','Lead Time (days)','Order Freq (days)','Safety Stock (days)','Last Order Date'].map((h,i) => (
                  <th key={h} style={{ ...thStyle, fontWeight: i === 2 ? 800 : 600, textDecoration: i === 2 ? 'underline' : 'none', textUnderlineOffset: i === 2 ? 3 : 0 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sgConfig.map((c, i) => (
                <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8f8f6' }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{c.name}</td>
                  <td style={tdStyle}><input style={inputStyle} type="number" defaultValue={c.lead_days} onBlur={e => updateSGConfig(c.id, { lead_days: +e.target.value })} /></td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}><input style={{ ...inputStyle, fontWeight: 700 }} type="number" defaultValue={c.freq_days} onBlur={e => updateSGConfig(c.id, { freq_days: +e.target.value })} /></td>
                  <td style={tdStyle}><input style={inputStyle} type="number" defaultValue={c.safety_days} onBlur={e => updateSGConfig(c.id, { safety_days: +e.target.value })} /></td>
                  <td style={tdStyle}><input style={{ ...inputStyle, width: 124 }} type="date" defaultValue={c.last_order_date || ''} onBlur={e => updateSGConfig(c.id, { last_order_date: e.target.value || null })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button style={applyBtn} onClick={() => handleApply('SG')}>Apply Changes to SG Calendar</button>
        <p style={noteStyle}>Non-Woven, Weed Barrier, and Woven each have independent frequencies. Update Last Order Date after placing a new order.</p>
      </div>

      {/* How it works */}
      <div style={{ background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 10, padding: '18px 20px' }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>How This Works</h4>
        <p style={{ fontSize: 12, color: '#444', lineHeight: 1.8 }}>
          The order calendar is built by taking the <strong>Last Order Date</strong> for each supplier or product, then adding the <strong>Order Frequency</strong> repeatedly to project future order dates. All changes are saved in real time and all team members see the same data immediately.
          <br /><br />
          <strong>Lead Time</strong> is how long goods take to arrive after an order is placed. <strong>Safety Stock</strong> is a buffer in days used when calculating urgency.
        </p>
      </div>
    </div>
  )
}

const sectionStyle = { marginBottom: 32 }
const h3Style = { fontSize: 14, fontWeight: 700, color: '#1F3864', marginBottom: 4, paddingBottom: 6, borderBottom: '2px solid #1F3864' }
const descStyle = { fontSize: 11, color: '#666', marginBottom: 12 }
const tblWrap = { overflowX: 'auto', border: '1px solid #ddd', borderRadius: 8, marginBottom: 4 }
const tblStyle = { borderCollapse: 'collapse', width: '100%' }
const thStyle = { background: '#1F3864', color: '#fff', fontSize: 11, padding: '8px 10px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,.3)', borderBottom: '2px solid rgba(255,255,255,.2)' }
const tdStyle = { padding: '7px 10px', fontSize: 12, borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #eee', verticalAlign: 'middle' }
const inputStyle = { fontSize: 12, padding: '4px 7px', border: '1px solid #ccc', borderRadius: 5, width: 80, fontFamily: 'inherit' }
const applyBtn = { padding: '8px 18px', background: '#1E6B3C', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', marginTop: 14 }
const noteStyle = { fontSize: 10, color: '#888', marginTop: 8, fontStyle: 'italic' }
