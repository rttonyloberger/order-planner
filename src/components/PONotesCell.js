import React, { useState, useEffect, useRef } from 'react'

// PONotesCell — free-form notes for a PO. Shows a short preview with a
// native hover tooltip (the full text, via `title`). Click expands an
// editable textarea that saves on blur.
//
// Props:
//  - po        — the PO object (needs id + notes)
//  - upsertPO  — save callback from useStore
//  - readOnly  — hide the editor (used in archive views if needed)
export default function PONotesCell({ po, upsertPO, readOnly = false }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(po?.notes || '')
  const textareaRef = useRef(null)

  // Stay in sync if the row's notes change (e.g. realtime update from Supabase)
  useEffect(() => { setVal(po?.notes || '') }, [po?.notes])

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(val.length, val.length)
    }
  }, [editing])

  const save = () => {
    const clean = (val || '').trim()
    const current = (po?.notes || '').trim()
    if (clean !== current) {
      upsertPO({ ...po, notes: clean || null })
    }
    setEditing(false)
  }

  const hasNotes = !!(po?.notes && po.notes.trim())
  const preview = hasNotes
    ? (po.notes.length > 34 ? po.notes.slice(0, 34) + '…' : po.notes)
    : ''

  if (readOnly) {
    return (
      <div
        title={hasNotes ? po.notes : 'No notes'}
        style={{ fontSize: 11, color: hasNotes ? '#333' : '#bbb', maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {hasNotes ? preview : '—'}
      </div>
    )
  }

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Escape') { setVal(po?.notes || ''); setEditing(false) }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
        }}
        placeholder="Add a note…"
        style={{
          fontSize: 11, padding: '5px 7px', border: '1px solid #0C447C', borderRadius: 5,
          minWidth: 170, width: '100%', minHeight: 64, resize: 'vertical',
          fontFamily: 'inherit', lineHeight: 1.35, boxSizing: 'border-box'
        }}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={hasNotes ? po.notes : 'Click to add a note'}
      style={{
        display: 'block', width: '100%', minWidth: 140, maxWidth: 200,
        fontSize: 11, textAlign: 'left', cursor: 'pointer',
        padding: '5px 7px', borderRadius: 5,
        background: hasNotes ? '#b7d0e2' : '#fafafa',
        color: hasNotes ? '#0C447C' : '#888',
        border: `1px dashed ${hasNotes ? '#6F9EBE' : '#ccc'}`,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        fontFamily: 'inherit'
      }}
    >
      {hasNotes ? preview : '+ Add note'}
    </button>
  )
}
