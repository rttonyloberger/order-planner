import React from 'react'
import { SUPP_COLORS, SUPP_DESTS } from '../constants'
import OrderCalendar from './OrderCalendar'
import POTable from './POTable'

export default function RTTab({ pos, calState, rtConfig, months, upsertPO, deletePO, upsertCalState, showModal, closeModal }) {
  const suppliers = rtConfig.map(c => ({
    name: c.name,
    last: c.last_order_date,
    freq: c.freq_days
  }))

  return (
    <div>
      <div style={secStyle}>Projected order calendar</div>
      <Legend items={suppliers.map(s => ({ c: (SUPP_COLORS[s.name] || {}).b || '#999', l: s.name }))} />
      <OrderCalendar suppliers={suppliers} styleMap={SUPP_COLORS} calState={calState} months={months}
        upsertCalState={upsertCalState} isSG={false} pos={pos}
        upsertPO={upsertPO} showModal={showModal} closeModal={closeModal} />

      <div style={bigSecStyle}>RT Big Bend (BB) Open POs and Arrivals</div>
      <POTable tableId="rt-bb" pos={pos} isSG={false} showShip={true}
        upsertPO={upsertPO} deletePO={deletePO} showModal={showModal} closeModal={closeModal} />

      <div style={bigSecStyle}>RT AWD Open POs and Arrivals</div>
      <ArrivalLegend />
      <POTable tableId="rt-awd" pos={pos} isSG={false} showShip={false}
        upsertPO={upsertPO} deletePO={deletePO} showModal={showModal} closeModal={closeModal} />
    </div>
  )
}

function Legend({ items }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      {items.map(item => (
        <div key={item.l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#666' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.c, flexShrink: 0 }} />
          {item.l}
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

const secStyle = { fontSize: 10, fontWeight: 500, letterSpacing: '.08em', color: '#666', textTransform: 'uppercase', margin: '22px 0 8px', paddingBottom: 5, borderBottom: '1.5px solid #ddd', display: 'flex', alignItems: 'center', gap: 6 }
const bigSecStyle = { fontSize: 14, fontWeight: 700, color: '#1a1a1a', marginTop: 28, paddingBottom: 7, borderBottom: '2px solid #1F3864', marginBottom: 12 }
