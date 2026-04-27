import React from 'react'

// SearchBox — shared free-text input used in every PO-listing tab header.
//
// Props:
//  - value          — controlled string from the parent (App.js holds the
//                     persistent searchQuery so it survives tab changes).
//  - onChange(str)  — fired on each keystroke and on the × clear click.
//  - placeholder    — optional placeholder text.
//  - matchCount     — optional: rows currently visible after filtering.
//  - totalCount     — optional: rows that would be visible without the filter.
//                     When both are provided and a query is active, the box
//                     renders an "X of Y match" counter underneath.
//  - width          — optional pixel width override (default 320).
//
// Behavior: live filter as you type (no Enter required), ESC clears the box,
// click × also clears. Empty value means "no filter" — every consumer just
// passes the same value through searchMatchesPOOrContainers in constants.js.
export default function SearchBox({
  value,
  onChange,
  placeholder = 'Search PO #, supplier, tracking #, notes…',
  matchCount,
  totalCount,
  width = 320,
}) {
  const hasQuery = !!(value && value.trim())
  const showCount =
    hasQuery && typeof matchCount === 'number' && typeof totalCount === 'number'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
      <div
        style={{
          position: 'relative',
          width,
          maxWidth: '100%',
        }}
      >
        {/* Magnifier icon */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#5a6b7d',
            fontSize: 13,
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          🔍
        </div>

        <input
          type="text"
          value={value || ''}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape' && hasQuery) {
              onChange('')
              e.currentTarget.blur()
            }
          }}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: hasQuery ? '7px 30px 7px 32px' : '7px 12px 7px 32px',
            border: `1px solid ${hasQuery ? '#0C447C' : '#cdd5df'}`,
            borderRadius: 18,
            background: hasQuery ? '#fff' : 'rgba(255,255,255,.85)',
            fontSize: 12,
            fontFamily: 'inherit',
            color: '#1a1a1a',
            outline: 'none',
            boxShadow: hasQuery ? '0 0 0 2px rgba(12,68,124,0.12)' : 'none',
          }}
        />

        {hasQuery && (
          <button
            type="button"
            onClick={() => onChange('')}
            title="Clear search (Esc)"
            aria-label="Clear search"
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 20,
              height: 20,
              border: 'none',
              borderRadius: '50%',
              background: '#0C447C',
              color: '#fff',
              fontSize: 12,
              lineHeight: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              fontFamily: 'inherit',
            }}
          >
            ×
          </button>
        )}
      </div>

      {showCount && (
        <div style={{ fontSize: 10, color: '#000', fontWeight: 500 }}>
          {matchCount} of {totalCount} match
        </div>
      )}
    </div>
  )
}
