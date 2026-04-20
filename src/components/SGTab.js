import React from 'react'
import { SGS_COLORS, projectedOrders, shortMonth, TODAY } from '../constants'
import OrderCalendar from './OrderCalendar'
import { AWDPOTable } from './AWDTab'

export default function SGTab({ pos, calState, sgConfig, months, upsertPO, deletePO, upsertCalState, showModal, closeModal }) {
  const products = sgConfig.map(c => ({
    name: c.name,
    last: c.last_order_date,
    freq: c.freq_days
  }))

  return (
    <div>
      <div style={secStyle}>Projected order calendar</div>
      <Legend items={products.map(s => ({ c: (SGS_COLORS[s.name] || {}).b || '#999', l: s.name }))} />
      <OrderCalendar suppliers={products} styleMap={SGS_COLORS} calState={calState} months={months}
        upsertCalState={upsertCalState} isSG={true} pos={pos}
        upsertPO={upsertPO} showModal={showModal} closeModal={closeModal} />
      <CombinedRow products={products} months={months} />

      <div style={bigSecStyle}>SG Big Bend (BB) Open POs and Arrivals</div>
      <p style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
        Click any row to expand and manage containers — each container can have its own tracking number, boxes and estimated receive date.
      </p>
      <ArrivalLegend />
      <AWDPOTable pos={pos} upsertPO={upsertPO} deletePO={deletePO}
        showModal={showModal} closeModal={closeModal}
        tableIds={['sg-bb']} destOptions={['BB']} entityFilter="SG" />

      <div style={bigSecStyle}>SG AWD and FBA Open POs and Arrivals</div>
      <p style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
        Click any row to expand and manage containers — each container can have its own tracking number, boxes, destination and estimated receive date.
      </p>
      <ArrivalLegend />
      {/* Shared AWD/FBA table, filtered to SG entity */}
      <AWDPOTable pos={pos} upsertPO={upsertPO} deletePO={deletePO}
        showModal={showModal} closeModal={closeModal}
        tableIds={['sg-awdfba']} destOptions={['AWD', 'FBA']} entityFilter="SG" />
    </div>
  )
}

function CombinedRow({ products, months }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: 8, marginTop: 6, marginBottom: 4 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...thS, textAlign: 'left', paddingLeft: 12, minWidth: 175, borderRight: '2px solid #ddd' }}>Combined order day</th>
            {months.map(m => {
              const isCur = m.getMonth() === TODAY.getMonth() && m.getFullYear() === TODAY.getFullYear()
              return <th key={m.getTime()} style={{ ...thS, background: isCur ? '#E6F1FB' : undefined, color: isCur ? '#0C447C' : undefined }}>{shortMonth(m)}</th>
            })}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ fontWeight: 600, fontSize: 11, padding: '8px 10px 8px 12px', background: '#FFF2CC', color: '#633806', borderBottom: '2px solid #EF9F27', borderRight: '2px solid #ddd' }}>NW + WB + WV when due</td>
            {months.map(m => {
              const all = new Set(), info = []
              products.forEach(p => {
                const ords = projectedOrders(p.last ? new Date(p.last) : null, p.freq, months)
                ;(ords[m.getTime()] || []).forEach(d => {
                  all.add(d.getTime())
                  info.push({ t: d.getTime(), abbr: p.name === 'Non-Woven' ? 'NW' : p.name === 'Weed Barrier' ? 'WB' : 'WV' })
                })
              })
              if (!all.size) return <td key={m.getTime()} style={{ ...mcS, background: '#f9f9f7' }} />
              const lines = [...all].sort().map(t => {
                const d = new Date(t)
                const ab = [...new Set(info.filter(x => x.t === t).map(x => x.abbr))]
                return `${d.getMonth()+1}/${d.getDate()} (${ab.join('+')})`
              })
              return <td key={m.getTime()} style={{ ...mcS, background: '#FFF2CC', color: '#633806', fontSize: 10, lineHeight: 1.7 }}>{lines.map((l,i) => <div key={i}>{l}</div>)}</td>
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Legend({ items }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      {items.map(item => (
        <div key={item.l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#666' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.c }} />{item.l}
        </div>
      ))}
    </div>
  )
}

function ArrivalLegend() {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      {[['#639922','Arriving in 30 days or less'],['#BA7517','31 to 60 days'],['#378ADD','More than 60 days'],['#E24B4A','Overdue']].map(([c,l]) => (
        <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#666' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />{l}
        </div>
      ))}
    </div>
  )
}

const thS = { background: '#f5f5f3', fontSize: 10, fontWeight: 500, color: '#666', padding: '7px 8px', textAlign: 'center', borderRight: '1px solid #eee', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap', letterSpacing: '.04em', textTransform: 'uppercase' }
const mcS = { textAlign: 'center', padding: '5px 4px', minWidth: 100, fontSize: 11, fontWeight: 700, lineHeight: 2.0, verticalAlign: 'top', height: 90, borderBottom: '2px solid #EF9F27' }
const secStyle = { fontSize: 10, fontWeight: 500, letterSpacing: '.08em', color: '#666', textTransform: 'uppercase', margin: '22px 0 8px', paddingBottom: 5, borderBottom: '1.5px solid #ddd' }
const bigSecStyle = { fontSize: 14, fontWeight: 700, color: '#1a1a1a', marginTop: 28, paddingBottom: 7, borderBottom: '2px solid #1F3864', marginBottom: 12 }
