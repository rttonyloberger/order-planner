import React from 'react'
import { AWDPOTable } from './AWDTab'
import SearchBox from './SearchBox'

// Completed POs tab — ongoing archive grouped by entity then receiving type.
// Uses AWDPOTable with showCompleted=true so all four groups reuse the same
// expandable row + containers layout (including BB, which used to be flat).
export default function CompletedTab({ pos, upsertPO, deletePO, showModal, closeModal, searchQuery = '', setSearchQuery = () => {} }) {
  const countCompleted = (tableIds, entity) =>
    pos.filter(p =>
      p.status === 'Complete' &&
      tableIds.includes(p.table_id) &&
      (!entity || p.entity === entity)
    ).length

  const rtBbCount = countCompleted(['rt-bb'], 'RT')
  const rtAwdCount = countCompleted(['rt-awd'], 'RT')
  const sgBbCount = countCompleted(['sg-bb'], 'SG')
  const sgAwdCount = countCompleted(['sg-awdfba'], 'SG')
  const totalCount = rtBbCount + rtAwdCount + sgBbCount + sgAwdCount

  // showCompleted flips the filter + column layout.
  // allowContainerExpand + requireMultipleToExpand: completed POs ARE
  // expandable, but only when they actually have more than one container
  // (Round 9 — single-container / zero-container completed POs stay flat,
  //  so they just look like one line without the clickable dropdown).
  // searchQuery threads through to all four AWDPOTable instances so the
  // archive can be searched by PO #, supplier, tracking number, notes, etc.
  const commonProps = { pos, upsertPO, deletePO, showModal, closeModal, showCompleted: true, allowContainerExpand: true, requireMultipleToExpand: true, searchQuery }

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#4d8090,#5e94a6)', borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ color: '#000', fontSize: 16, fontWeight: 700, margin: 0 }}>Completed POs</h2>
          <p style={{ color: '#000', fontSize: 11, margin: '2px 0 0' }}>Running archive of POs marked Complete across RT and SG. Ongoing — new completions drop in automatically.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <SearchBox value={searchQuery} onChange={setSearchQuery} />
          <div style={{ background: 'rgba(255,255,255,.35)', borderRadius: 8, padding: '8px 16px', textAlign: 'center' }}>
            <div style={{ color: '#000', fontSize: 20, fontWeight: 700 }}>{totalCount}</div>
            <div style={{ color: '#000', fontSize: 10 }}>Completed POs</div>
          </div>
        </div>
      </div>

      {/* RT */}
      <GroupHeader entity="RT" color="#0C447C" />

      <SubHeader label="RT BB Received" count={rtBbCount} />
      <AWDPOTable {...commonProps}
        tableIds={['rt-bb']} destOptions={['BB']} entityFilter="RT"
        emptyMessage="No completed RT BB POs yet." />

      <SubHeader label="RT AWD Received" count={rtAwdCount} />
      <AWDPOTable {...commonProps}
        tableIds={['rt-awd']} destOptions={['RT AWD']} entityFilter="RT"
        emptyMessage="No completed RT AWD POs yet." />

      {/* SG */}
      <GroupHeader entity="SG" color="#27500A" />

      <SubHeader label="SG BB Received" count={sgBbCount} />
      <AWDPOTable {...commonProps}
        tableIds={['sg-bb']} destOptions={['BB']} entityFilter="SG"
        emptyMessage="No completed SG BB POs yet." />

      <SubHeader label="SG AWD/FBA Received" count={sgAwdCount} />
      <AWDPOTable {...commonProps}
        tableIds={['sg-awdfba']} destOptions={['AWD', 'FBA']} entityFilter="SG"
        emptyMessage="No completed SG AWD/FBA POs yet." />
    </div>
  )
}

function GroupHeader({ entity, color }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color, margin: '26px 0 10px', paddingBottom: 6, borderBottom: `2px solid ${color}`, letterSpacing: '.03em' }}>
      {entity}
    </div>
  )
}

function SubHeader({ label, count }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#555', margin: '14px 0 6px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
      {label}
      <span style={{ marginLeft: 8, fontSize: 10, background: '#f0f0f0', color: '#666', padding: '1px 8px', borderRadius: 10, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
        {count} completed
      </span>
    </div>
  )
}
