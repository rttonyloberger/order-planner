import React, { useEffect, useRef, useState } from 'react'

// Round 22 — small free-form notes panel that lives below the calendar on
// the RT and SG tabs. Tony wanted somewhere to jot context-specific notes
// like "in 2 months we want to place a BUNCH of lead jigs" without
// cluttering the row UI.
//
// Storage: localStorage keyed by storageKey (e.g. "op.notes.rt", "op.notes.sg").
// Per-device only — that's fine for Tony's workflow, and avoids needing a
// Supabase migration. Easy to swap in a Supabase upsert later if desired
// (just replace the load + save effects).
//
// Visual states:
//   - empty:   dashed gray border, low-key "+ Add a note" placeholder.
//   - filled:  amber sticky-note background, single-line truncated preview,
//              hover tooltip exposes the full text without expanding the box.
//   - editing: textarea + Save / Cancel.
export default function NotesPanel({ storageKey, label = 'Notes' }) {
  const [text, setText] = useState('')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const taRef = useRef(null)

  // Load from localStorage once on mount. Wrapped in try/catch in case
  // localStorage is disabled (e.g. private browsing) — the panel will
  // still work in-session, just won't persist.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(storageKey)
      if (v != null) setText(v)
    } catch {}
  }, [storageKey])

  // Auto-focus the textarea when entering edit mode so the user can just
  // click and type without an extra click.
  useEffect(() => {
    if (editing && taRef.current) taRef.current.focus()
  }, [editing])

  const beginEdit = () => {
    setDraft(text)
    setEditing(true)
  }
  const cancel = () => { setEditing(false) }
  const save = () => {
    const v = draft.trim()
    setText(v)
    try { window.localStorage.setItem(storageKey, v) } catch {}
    setEditing(false)
  }
  const clear = () => {
    setDraft('')
    setText('')
    try { window.localStorage.removeItem(storageKey) } catch {}
    setEditing(false)
  }

  const filled = text && text.length > 0

  // Editing view — full textarea + Save / Cancel / Clear controls.
  if (editing) {
    return (
      <div style={{ marginTop: 14, marginBottom: 14, border: '1.5px solid #BA7517', borderRadius: 8, padding: '10px 12px', background: '#FFF8E6' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#633806', letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={save}   style={btnSave}>Save</button>
            <button onClick={cancel} style={btnCancel}>Cancel</button>
            {filled && <button onClick={clear} style={btnClear}>Clear</button>}
          </div>
        </div>
        <textarea
          ref={taRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Type your note here..."
          rows={3}
          style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #E0C99A', borderRadius: 5, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
        />
        <div style={{ fontSize: 10, color: '#9b6f1c', marginTop: 4 }}>
          Saved on this device only.
        </div>
      </div>
    )
  }

  // Filled view — sticky-note look, single-line truncated preview, full
  // text exposed via the native title tooltip on hover. Click opens edit.
  if (filled) {
    return (
      <div
        onClick={beginEdit}
        title={text}
        style={{
          marginTop: 14, marginBottom: 14,
          border: '1.5px solid #BA7517', borderRadius: 8,
          padding: '8px 12px', background: '#FFF2CC',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
          transition: 'background .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#FFEBA8'}
        onMouseLeave={e => e.currentTarget.style.background = '#FFF2CC'}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>📝</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#633806', letterSpacing: '.04em', textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: 12, color: '#5b3a07', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {text}
        </span>
        <span style={{ fontSize: 10, color: '#9b6f1c', flexShrink: 0 }}>hover for full · click to edit</span>
      </div>
    )
  }

  // Empty view — dashed gray placeholder. Click to start writing.
  return (
    <div
      onClick={beginEdit}
      style={{
        marginTop: 14, marginBottom: 14,
        border: '1.5px dashed #c4c4c0', borderRadius: 8,
        padding: '8px 12px', background: '#fafaf7',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
        color: '#888', transition: 'background .15s, border-color .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f3f3ee'; e.currentTarget.style.borderColor = '#a8a8a3' }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fafaf7'; e.currentTarget.style.borderColor = '#c4c4c0' }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>＋</span>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 11, fontStyle: 'italic' }}>click to add a note</span>
    </div>
  )
}

const btnSave   = { padding: '4px 10px', background: '#27500A', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }
const btnCancel = { padding: '4px 10px', background: '#fff', color: '#444', border: '1px solid #ccc', borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: 'pointer' }
const btnClear  = { padding: '4px 10px', background: '#fff', color: '#A32D2D', border: '1px solid #F09595', borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: 'pointer' }
