import React from 'react'
import { projectedOrders, shortMonth, TODAY, SUPP_DESTS } from '../constants'

export default function OrderCalendar({ suppliers, styleMap, calState, months, upsertCalState, isSG, pos }) {
  const today = TODAY

  const togSlot = async (key, isSGSlot) => {
    const current = calState[key]
    await upsertCalState(key, { checked: !current?.checked, deleted: current?.deleted || false })
  }

  const delSlot = async (key, label, showModal, closeModal) => {
    showModal({
      title: 'Skip this projected date?',
      body: `${label} will be removed from the calendar. Does not affect placed POs.`,
      confirmLabel: 'Yes, skip',
      danger: true,
      onConfirm: async () => {
        await upsertCalState(key, { checked: false, deleted: true })
        closeModal()
      }
    })
  }

  // For SG: find added POs matching this product by product_type
  const addedForSGProd = (prodName) => {
    return pos.filter(p =>
      (p.table_id === 'sg-awdfba' || p.table_id === 'sg-bb') &&
      p.product_type === prodName &&
      p.status !== 'Complete'
    )
  }

  // For RT: find added POs for supplier
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
                                  <button onClick={() => togSlot(awdKey, true)} style={ckBtnStyle(awdState?.checked)}>{awdState?.checked ? '✓' : ''}</button>
                                  <button onClick={() => upsertCalState(awdKey, { checked: false, deleted: true })} style={delBtnStyle}>✕</button>
                                </div>
                              )}
                              {!bbState?.deleted && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center', marginBottom: 3 }}>
                                  <span style={{ width: 28, display: 'inline-block' }}></span>
                                  {dTag('BB')}
                                  <button onClick={() => togSlot(bbKey, true)} style={ckBtnStyle(bbState?.checked)}>{bbState?.checked ? '✓' : ''}</button>
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
                                <button onClick={() => togSlot(key, false)} style={ckBtnStyle(slot?.checked)}>{slot?.checked ? '✓' : ''}</button>
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
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const thS = { background: '#f5f5f3', fontSize: 10, fontWeight: 500, color: '#666', padding: '7px 8px', textAlign: 'center', borderRight: '1px solid #eee', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap', letterSpacing: '.04em', textTransform: 'uppercase' }
const ckBtnStyle = (done) => ({ background: done ? '#EAF3DE' : 'none', border: done ? '1.5px solid #639922' : '1.5px solid #B4B2A9', borderRadius: 4, width: 20, height: 20, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#27500A', verticalAlign: 'middle', marginLeft: 2, flexShrink: 0 })
const delBtnStyle = { background: 'none', border: 'none', fontSize: 10, color: '#B4B2A9', cursor: 'pointer', padding: '0 1px', opacity: .6, lineHeight: 1 }
