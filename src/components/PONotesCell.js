import React, { useState, useEffect } from 'react'

// PONotesCell — free-form notes for a PO. Always renders an editable
// textarea so the team can add or change notes without an extra click —
// per Tony's round 27 request: "the notes tabs need to be open at all
// times so we can edit or change notes if need be." Saves on blur.
//
// Props:
//  - po        — the PO object (needs id + notes)
//  - upsertPO  — save callback from useStore
//  - readOnly  — render a non-editable preview instead (used when the PO
//                row is locked because tracking is set & status != Draft)
export default function PONotesCell({ po, upsertPO, readOnly = false }) {
  const [val, setVal] = useState(po?.notes || '')

  // Stay in sync if the row's notes change (e.g. realtime update from Supabase)
  useEffect(() => { setVal(po?.notes || '') }, [po?.notes])

  const save = () => {
    const clean = (val || '').trim()
    const current = (po?.notes || '').trim()
    if (clean !== current) {
      upsertPO({ ...po, notes: clean || null })
    }
  }

  const hasNotes = !!(po?.notes && po.notes.trim())

  if (readOnly) {
    // Read-only preview — keeps row height tight while still showing the
    // full note on hover. Used when the parent row is locked.
    return (
      <div
        title={hasNotes ? po.notes : 'No notes'}
        style={{
          fontSize: 11, color: hasNotes ? '#0C447C' : '#bbb',
          background: hasNotes ? '#eef4f9' : '#fafafa',
          border: `1px solid ${hasNotes ? '#cfe0ec' : '#eee'}`,
          borderRadius: 5, padding: '5px 7px',
          minWidth: 140, maxWidth: 220,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          lineHeight: 1.35
        }}
      >
        {hasNotes ? po.notes : '—'}
      </div>
    )
  }

  return (
    <textarea
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={e => {
        if (e.key === 'Escape') { setVal(po?.notes || ''); e.currentTarget.blur() }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.blur()
      }}
      placeholder="Add a note…"
      style={{
        fontSize: 11, padding: '5px 7px',
        border: `1px solid ${hasNotes ? '#6F9EBE' : '#ccc'}`,
        background: hasNotes ? '#eef4f9' : '#fff',
        color: '#0C447C',
        borderRadius: 5,
        minWidth: 160, width: '100%', minHeight: 56,
        resize: 'vertical',
        fontFamily: 'inherit', lineHeight: 1.35,
        boxSizing: 'border-box'
      }}
    />
  )
}
