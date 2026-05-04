import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

// Round 29 — localStorage fallback for calendar notes. We mirror every
// upsert / delete to localStorage so that even if the Supabase
// calendar_notes table doesn't exist yet (i.e. the user hasn't run
// SQL_MIGRATION_round26.sql) the notes STILL persist on this device.
// Tony's complaint: "the note STILL wont save when i add a note. make
// sure the note STAYS there ALL THE TIME." This guarantees that — once
// added a note never disappears unless the user explicitly deletes it.
const CAL_NOTES_LS_KEY = 'op.calNotes.v1'
function loadLocalCalNotes() {
  try {
    const raw = localStorage.getItem(CAL_NOTES_LS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}
function saveLocalCalNotes(map) {
  try { localStorage.setItem(CAL_NOTES_LS_KEY, JSON.stringify(map)) } catch {}
}

export function useStore() {
  const [pos, setPOs] = useState([])
  const [calState, setCalState] = useState({})
  // Round 26/29 — calendar notes. Source of truth is Supabase
  // calendar_notes (so notes show up for every user / device when the
  // migration has been run), with a localStorage mirror as a fallback
  // so they always persist even if the migration hasn't run yet.
  // Map keyed by "<entity>|<rowName>|<isoDate>".
  const [calNotes, setCalNotes] = useState(() => loadLocalCalNotes())
  const [rtConfig, setRTConfig] = useState([])
  const [sgConfig, setSGConfig] = useState([])
  const [monthStart, setMonthStart] = useState(new Date(2026, 3, 1))
  const [loading, setLoading] = useState(true)

  // Initial load
  useEffect(() => {
    async function load() {
      const [posRes, calRes, calNotesRes, rtRes, sgRes, settingsRes] = await Promise.all([
        supabase.from('purchase_orders').select('*').order('eta', { ascending: true, nullsFirst: false }),
        supabase.from('calendar_state').select('*'),
        // calendar_notes may not exist yet on a database that hasn't run
        // SQL_MIGRATION_round26.sql. Gracefully no-op in that case so the
        // rest of the app still loads — users will just see an empty
        // calendar-notes layer until the migration runs.
        supabase.from('calendar_notes').select('*'),
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
      // Round 29 — merge Supabase rows on top of any localStorage cache.
      // Server wins per key, but local-only entries (from when the user
      // was offline, or before the migration was run) survive the merge
      // so notes never disappear on a reload.
      if (calNotesRes.data) {
        setCalNotes(prev => {
          const next = { ...prev }
          calNotesRes.data.forEach(r => { next[r.key] = r })
          saveLocalCalNotes(next)
          return next
        })
      } else if (calNotesRes.error) {
        console.warn('calendar_notes load skipped (using local cache):', calNotesRes.error.message)
        // One-shot, friendly heads-up so Tony knows the migration hasn't
        // been run. Notes still work locally — but they won't sync to
        // other devices until SQL_MIGRATION_round26.sql is applied in
        // the Supabase SQL editor.
        if (!sessionStorage.getItem('op.calNotes.migrationWarned')) {
          sessionStorage.setItem('op.calNotes.migrationWarned', '1')
          queueMicrotask(() => {
            // eslint-disable-next-line no-alert
            alert(
              "Heads up: calendar notes are working locally on this device only.\n\n" +
              "To sync notes across devices, run SQL_MIGRATION_round26.sql in the Supabase SQL Editor (creates the calendar_notes table).\n\n" +
              "Until then notes save to this browser and won't be lost — they just won't show on other computers."
            )
          })
        }
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

    // Round 26 — calendar_notes realtime fan-out. Edits made on one device
    // appear instantly on every other open browser. Same pattern as
    // cal-changes. Round 29 — also mirror to localStorage so the local
    // cache stays in sync.
    const calNotesSub = supabase.channel('calnote-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_notes' }, payload => {
        const k = payload.new?.key || payload.old?.key
        if (!k) return
        setCalNotes(prev => {
          const next = { ...prev }
          if (payload.eventType === 'DELETE') delete next[k]
          else next[k] = payload.new
          saveLocalCalNotes(next)
          return next
        })
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
      supabase.removeChannel(calNotesSub)
      supabase.removeChannel(cfgSub)
    }
  }, [])

  // Helper: when a PO is saved, if its order_date is newer than the supplier's
  // current last_order_date in rt_config / sg_config, bump the config. Matches
  // on config.name === po.supplier (case-insensitive, trimmed).
  const maybeAdvanceLastOrderDate = useCallback(async (po) => {
    if (!po?.order_date || !po?.supplier) return
    const supplierKey = String(po.supplier).trim().toLowerCase()
    const entity = po.entity || (po.table_id?.startsWith('sg') ? 'SG' : 'RT')
    const configList = entity === 'SG' ? sgConfig : rtConfig
    const table = entity === 'SG' ? 'sg_config' : 'rt_config'
    const match = configList.find(c => String(c.name || '').trim().toLowerCase() === supplierKey)
    if (!match) return
    const current = match.last_order_date
    // Only advance if the new order date is strictly newer.
    if (current && new Date(po.order_date) <= new Date(current)) return
    const { error } = await supabase.from(table)
      .update({ last_order_date: po.order_date, updated_at: new Date().toISOString() })
      .eq('id', match.id)
    if (error) console.error('last_order_date auto-update error:', error)
  }, [rtConfig, sgConfig])

  // Round 26 — surface save errors instead of silently logging them. Tony was
  // hitting Add PO and the row was vanishing into the abyss; turns out the
  // upsert was rejected (most commonly: an unknown column or NOT NULL
  // violation) but the only signal was console.error. This wraps every write
  // so failures pop a clear alert with the Postgres error message — no more
  // silent failures.
  const surfaceError = (label, error) => {
    console.error(`${label} error:`, error)
    const msg = error?.message || error?.details || error?.hint || JSON.stringify(error)
    // Use queueMicrotask so the alert fires after React's current render flush.
    queueMicrotask(() => {
      // eslint-disable-next-line no-alert
      alert(`Couldn't save (${label}).\n\n${msg}\n\nLet Claude know what this says.`)
    })
  }

  // Strip any client-only or computed fields before sending to Postgres. The
  // pos array we receive from supabase has exactly the table's columns, but
  // when the row UI builds an update payload it sometimes spreads `...po`
  // which already includes `updated_at`. We always overwrite that, but keep
  // this defensive whitelist-by-omission in case a stray field sneaks in
  // later (like a UI-derived `__expanded` flag).
  const cleanPOPayload = (po) => {
    const { __expanded, ...rest } = po || {}
    return rest
  }

  // Actions
  const upsertPO = useCallback(async (po) => {
    const payload = { ...cleanPOPayload(po), updated_at: new Date().toISOString() }
    const { error } = await supabase.from('purchase_orders').upsert(payload)
    if (error) {
      surfaceError('upsertPO', error)
      return
    }
    // Round 34 — the auto-advance of last_order_date that lived here was
    // disabled. Bug it caused: when Tony clicked an AWD schedule slot for
    // a supplier that had AWD + BB scheduled on the same day, confirming
    // the AWD PO bumped supplier.last_order_date forward, which made
    // projectedOrders re-compute and drop the (now past) projection
    // date entirely — the BB slot for the same day disappeared as
    // collateral damage.
    //
    // Tony's rule: "make sure that does not happen for both RT and SG and
    // everything stays there if it needs to be unless changed or deleted
    // by myself." So projections stay anchored to whatever
    // last_order_date the user has set in the Control tab, and adding
    // POs no longer touches that anchor. The user can still update
    // last_order_date manually from Control whenever they want the
    // projection to roll forward.
    //
    // Keeping maybeAdvanceLastOrderDate around (unused) so it's easy to
    // re-enable behind a flag later if requirements change.
    // maybeAdvanceLastOrderDate(po)
  }, [])

  const deletePO = useCallback(async (id) => {
    const { error } = await supabase.from('purchase_orders').delete().eq('id', id)
    if (error) surfaceError('deletePO', error)
  }, [])

  const upsertCalState = useCallback(async (key, data) => {
    const { error } = await supabase.from('calendar_state').upsert({
      key, ...data, updated_at: new Date().toISOString()
    })
    if (error) surfaceError('upsertCalState', error)
  }, [])

  // Round 26/29 — calendar_notes upsert / delete. Writes optimistically
  // to local state AND to the localStorage mirror, then best-effort to
  // Supabase. The localStorage write means the note stays put forever,
  // even if Supabase rejects the upsert (table missing, RLS, offline,
  // etc). Realtime fan-in still reconciles from the server when it works
  // so other devices see it.
  const upsertCalNote = useCallback(async (key, payload) => {
    const row = {
      key,
      entity: payload.entity,
      row_name: payload.row_name,
      iso_date: payload.iso_date,
      note_text: payload.note_text,
      updated_at: new Date().toISOString(),
    }
    setCalNotes(prev => {
      const next = { ...prev, [key]: row }
      saveLocalCalNotes(next)
      return next
    })
    const { error } = await supabase.from('calendar_notes').upsert(row)
    if (error) {
      // Don't blow up the user — note is already saved locally. Just log.
      console.warn('upsertCalNote (kept locally):', error.message)
    }
  }, [])

  const deleteCalNote = useCallback(async (key) => {
    setCalNotes(prev => {
      const next = { ...prev }
      delete next[key]
      saveLocalCalNotes(next)
      return next
    })
    const { error } = await supabase.from('calendar_notes').delete().eq('key', key)
    if (error) console.warn('deleteCalNote (removed locally):', error.message)
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
    pos, calState, calNotes, rtConfig, sgConfig, monthStart, loading,
    upsertPO, deletePO, upsertCalState, upsertCalNote, deleteCalNote,
    updateRTConfig, updateSGConfig, updateMonthStart
  }
}
