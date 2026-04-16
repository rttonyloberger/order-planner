import React, { useState, useCallback, useEffect } from 'react'
import { supabase } from './supabase'
import { useStore } from './useStore'
import { buildMonths, shortMonth, TODAY } from './constants'
import ControlTab from './components/ControlTab'
import ReceivingTab from './components/ReceivingTab'
import RTTab from './components/RTTab'
import SGTab from './components/SGTab'
import Modal from './components/Modal'
import LoginPage from './components/LoginPage'

const TABS = ['Control', 'Receiving', 'RT', 'SG']
const TAB_COLORS = {
  Control:   { base: '#375623', active: '#1E6B3C' },
  Receiving: { base: '#7B3F00', active: '#5C2E00' },
  RT:        { base: '#4472C4', active: '#1F3864' },
  SG:        { base: '#4472C4', active: '#1F3864' },
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading, null = not logged in

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Loading state
  if (session === undefined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: 40, height: 40, border: '3px solid #1F3864', borderTop: '3px solid transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // Not logged in
  if (!session) return <LoginPage />

  // Logged in
  return <MainApp session={session} />
}

function MainApp({ session }) {
  const store = useStore()
  const [activeTab, setActiveTab] = useState('Control')
  const [modal, setModal] = useState(null)

  const months = buildMonths(store.monthStart)
  const showModal = useCallback((m) => setModal(m), [])
  const closeModal = useCallback(() => setModal(null), [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const rollFwd = () => showModal({
    title: 'Roll to next month?',
    body: `Drop ${shortMonth(months[0])} and add the next month to the calendar.`,
    confirmLabel: 'Yes, next month',
    onConfirm: () => {
      const next = new Date(store.monthStart.getFullYear(), store.monthStart.getMonth() + 1, 1)
      store.updateMonthStart(next)
      closeModal()
    }
  })

  const rollBack = () => showModal({
    title: 'Go back to last month?',
    body: 'Restore the previous month to the calendar.',
    confirmLabel: 'Yes, last month',
    amber: true,
    onConfirm: () => {
      const prev = new Date(store.monthStart.getFullYear(), store.monthStart.getMonth() - 1, 1)
      store.updateMonthStart(prev)
      closeModal()
    }
  })

  if (store.loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: 40, height: 40, border: '3px solid #1F3864', borderTop: '3px solid transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#555', fontSize: 14 }}>Loading order planner…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: 13, color: '#1a1a1a', background: '#f8f8f6', minHeight: '100vh' }}>
      {/* Top nav bar */}
      <div style={{ background: '#1F3864', padding: '8px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Order Planner</span>
          <span style={{ color: '#8BA4CC', fontSize: 11 }}>RT & SG</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#8BA4CC', fontSize: 11 }}>{session.user.email}</span>
          <button onClick={handleSignOut} style={{ padding: '4px 12px', background: 'rgba(255,255,255,.1)', color: '#fff', border: '1px solid rgba(255,255,255,.2)', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ padding: '0 24px', background: '#f8f8f6' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 16 }}>
          <div style={{ display: 'flex', borderBottom: '2px solid #1F3864' }}>
            {TABS.map(tab => {
              const c = TAB_COLORS[tab]
              const isActive = activeTab === tab
              return (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  padding: '10px 22px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  color: '#fff', background: isActive ? c.active : c.base,
                  border: `1px solid #1F3864`, borderBottom: 'none',
                  borderRadius: '6px 6px 0 0', marginRight: 4, userSelect: 'none',
                }}>
                  {tab}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 2 }}>
            {(activeTab === 'RT' || activeTab === 'SG') && (
              <>
                <button onClick={rollBack} style={rollBtnStyle}>Last Month</button>
                <button onClick={rollFwd} style={rollBtnStyle}>Next Month</button>
              </>
            )}
          </div>
        </div>
        <div style={{ borderBottom: '2px solid #1F3864', marginBottom: 18 }} />
      </div>

      {/* Tab content */}
      <div style={{ padding: '0 24px 60px' }}>
        {activeTab === 'Control' && (
          <ControlTab rtConfig={store.rtConfig} sgConfig={store.sgConfig}
            updateRTConfig={store.updateRTConfig} updateSGConfig={store.updateSGConfig}
            showModal={showModal} closeModal={closeModal} />
        )}
        {activeTab === 'Receiving' && (
          <ReceivingTab pos={store.pos} upsertPO={store.upsertPO} deletePO={store.deletePO}
            showModal={showModal} closeModal={closeModal} />
        )}
        {activeTab === 'RT' && (
          <RTTab pos={store.pos} calState={store.calState} rtConfig={store.rtConfig}
            months={months} upsertPO={store.upsertPO} deletePO={store.deletePO}
            upsertCalState={store.upsertCalState} showModal={showModal} closeModal={closeModal} />
        )}
        {activeTab === 'SG' && (
          <SGTab pos={store.pos} calState={store.calState} sgConfig={store.sgConfig}
            months={months} upsertPO={store.upsertPO} deletePO={store.deletePO}
            upsertCalState={store.upsertCalState} showModal={showModal} closeModal={closeModal} />
        )}
      </div>

      {modal && <Modal {...modal} onClose={closeModal} />}
    </div>
  )
}

const rollBtnStyle = {
  padding: '9px 14px', background: '#444', color: '#fff', border: 'none',
  borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', marginLeft: 8
}
