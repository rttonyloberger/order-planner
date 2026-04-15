import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

export function useStore() {
  const [pos, setPOs] = useState([])
  const [calState, setCalState] = useState({})
  const [rtConfig, setRTConfig] = useState([])
  const [sgConfig, setSGConfig] = useState([])
  const [monthStart, setMonthStart] = useState(new Date(2026, 3, 1))
  const [loading, setLoading] = useState(true)

  // Initial load
  useEffect(() => {
    async function load() {
      const [posRes, calRes, rtRes, sgRes, settingsRes] = await Promise.all([
        supabase.from('purchase_orders').select('*').order('eta', { ascending: true, nullsFirst: false }),
        supabase.from('calendar_state').select('*'),
        supabase.from('rt_config').select('*').order('sort_order'),
        supabase.from('sg_config').select('*').order('sort_order'),
        supabase.from('app_settings').select('*'),
      ])
      if (posRes.data) setPOs(posRes.data)
      if (calRes.data) {
        const map = {}
        calRes.data.forEach(r => { map[r.key] = r })
        setCalState(map)
      }
      if (rtRes.data) setRTConfig(rtRes.data)
      if (sgRes.data) setSGConfig(sgRes.data)
      if (settingsRes.data) {
        const ms = settingsRes.data.find(s => s.key === 'month_start')
        if (ms) setMonthStart(new Date(ms.value + 'T00:00:00'))
      }
      setLoading(false)
    }
    load()
  }, [])

  // Real-time subscriptions
  useEffect(() => {
    const poSub = supabase.channel('po-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, payload => {
        if (payload.eventType === 'INSERT') {
          setPOs(prev => [...prev, payload.new].sort((a, b) => {
            if (!a.eta && !b.eta) return 0
            if (!a.eta) return 1
            if (!b.eta) return -1
            return new Date(a.eta) - new Date(b.eta)
          }))
        } else if (payload.eventType === 'UPDATE') {
          setPOs(prev => prev.map(p => p.id === payload.new.id ? payload.new : p).sort((a, b) => {
            if (!a.eta && !b.eta) return 0
            if (!a.eta) return 1
            if (!b.eta) return -1
            return new Date(a.eta) - new Date(b.eta)
          }))
        } else if (payload.eventType === 'DELETE') {
          setPOs(prev => prev.filter(p => p.id !== payload.old.id))
        }
      })
      .subscribe()

    const calSub = supabase.channel('cal-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_state' }, payload => {
        setCalState(prev => ({
          ...prev,
          [payload.new?.key || payload.old?.key]: payload.eventType === 'DELETE' ? undefined : payload.new
        }))
      })
      .subscribe()

    const cfgSub = supabase.channel('cfg-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rt_config' }, payload => {
        setRTConfig(prev => prev.map(r => r.id === payload.new?.id ? payload.new : r))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sg_config' }, payload => {
        setSGConfig(prev => prev.map(r => r.id === payload.new?.id ? payload.new : r))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(poSub)
      supabase.removeChannel(calSub)
      supabase.removeChannel(cfgSub)
    }
  }, [])

  // Actions
  const upsertPO = useCallback(async (po) => {
    const { error } = await supabase.from('purchase_orders').upsert({
      ...po, updated_at: new Date().toISOString()
    })
    if (error) console.error('upsertPO error:', error)
  }, [])

  const deletePO = useCallback(async (id) => {
    const { error } = await supabase.from('purchase_orders').delete().eq('id', id)
    if (error) console.error('deletePO error:', error)
  }, [])

  const upsertCalState = useCallback(async (key, data) => {
    const { error } = await supabase.from('calendar_state').upsert({
      key, ...data, updated_at: new Date().toISOString()
    })
    if (error) console.error('upsertCalState error:', error)
  }, [])

  const updateRTConfig = useCallback(async (id, changes) => {
    const { error } = await supabase.from('rt_config').update({
      ...changes, updated_at: new Date().toISOString()
    }).eq('id', id)
    if (error) console.error('updateRTConfig error:', error)
  }, [])

  const updateSGConfig = useCallback(async (id, changes) => {
    const { error } = await supabase.from('sg_config').update({
      ...changes, updated_at: new Date().toISOString()
    }).eq('id', id)
    if (error) console.error('updateSGConfig error:', error)
  }, [])

  const updateMonthStart = useCallback(async (date) => {
    const iso = date.toISOString().split('T')[0]
    setMonthStart(date)
    await supabase.from('app_settings').upsert({ key: 'month_start', value: iso, updated_at: new Date().toISOString() })
  }, [])

  return {
    pos, calState, rtConfig, sgConfig, monthStart, loading,
    upsertPO, deletePO, upsertCalState, updateRTConfig, updateSGConfig, updateMonthStart
  }
}
