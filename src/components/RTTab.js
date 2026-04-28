import React from 'react'
import { SUPP_COLORS, RT_PRODUCTS } from '../constants'
import OrderCalendar from './OrderCalendar'
import { AWDPOTable, AddAWDPORow } from './AWDTab'
import SearchBox from './SearchBox'
import NotesPanel from './NotesPanel'

// Suppliers list used by the RT add-PO rows. Matches the list in SGTab
// so both BB and AWD add-rows offer the same dropdown.
const RT_SUPPLIERS = ['Dongyang Shanye Fishing','I-Lure','Sourcepro','WEIGHT CO','JXL','Weihai Huayue Sports','XINGTAI XIOU IMPORT']

export default function RTTab({ pos, calState, rtConfig, months, upsertPO, deletePO, upsertCalState, showModal, closeModal, searchQuery = '', setSearchQuery = () => {} }) {
  const suppliers = rtConfig.map(c => ({
    name: c.name,
    last: c.last_order_date,
    freq: c.freq_days
  }))

  return (
    <div>
      {/* Search bar — filters both the BB and AWD/FBA AWDPOTable instances
          on this tab. Sits above the calendar so it's easy to find. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 6 }}>
        <SearchBox value={searchQuery} onChange={setSearchQuery} />
      </div>

      <div style={secStyle}>Projected order calendar</div>
      <Legend items={suppliers.map(s => ({ c: (SUPP_COLORS[s.name] || {}).b || '#999', l: s.name }))} />
      <OrderCalendar suppliers={suppliers} styleMap={SUPP_COLORS} calState={calState} months={months}
        upsertCalState={upsertCalState} isSG={false} pos={pos}
        upsertPO={upsertPO} showModal={showModal} closeModal={closeModal} />

      {/* Free-form notes panel below the calendar — Tony uses this to jot
          context like "in 2 months we want to place a BUNCH of lead jigs".
          Persists in localStorage on this device. */}
      <NotesPanel storageKey="op.notes.rt" label="RT Notes" />

      <div style={bigSecStyle}>RT Big Bend (BB) Open POs and Arrivals</div>
      <p style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
        Click any row to expand and manage containers — each container can have its own tracking number, boxes, FCL/LCL split and estimated receive date. Matches what you see on the BB Receiving tab.
      </p>
      <ArrivalLegend />
      {/* Use the same expandable AWDPOTable as SG/AWD tabs so all container
          info (LCL box counts, per-container tracking, per-container ETAs)
          entered on the BB Receiving tab is visible here too. hideDest drops
          the Dest column because every row here is already BB. */}
      <AWDPOTable pos={pos} upsertPO={upsertPO} deletePO={deletePO}
        showModal={showModal} closeModal={closeModal}
        tableIds={['rt-bb']} destOptions={['BB']} entityFilter="RT" hideDest={true}
        searchQuery={searchQuery} />
      <AddAWDPORow
        tableId="rt-bb"
        entity="RT"
        defaultDest="BB"
        destOptions={['BB']}
        suppliers={RT_SUPPLIERS}
        productOptions={RT_PRODUCTS}
        upsertPO={upsertPO}
        label="Add a new RT BB PO"
        hideDest={true}
      />

      <div style={bigSecStyle}>RT AWD and FBA Open POs and Arrivals</div>
      <p style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
        Click any row to expand and manage containers — each container can have its own tracking number, boxes and estimated receive date.
      </p>
      <ArrivalLegend />
      {/* Same expandable row+containers table as SG / AWD/FBA tab, filtered to RT. */}
      <AWDPOTable pos={pos} upsertPO={upsertPO} deletePO={deletePO}
        showModal={showModal} closeModal={closeModal}
        tableIds={['rt-awd']} destOptions={['RT AWD']} entityFilter="RT"
        searchQuery={searchQuery} />
      <AddAWDPORow
        tableId="rt-awd"
        entity="RT"
        defaultDest="RT AWD"
        destOptions={['RT AWD']}
        suppliers={RT_SUPPLIERS}
        productOptions={RT_PRODUCTS}
        upsertPO={upsertPO}
        label="Add a new RT AWD PO"
      />
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
