import React from 'react'

export default function Modal({ title, body, onConfirm, confirmLabel, onClose, danger, amber }) {
  const confirmBg = danger ? '#C00000' : amber ? '#E26B0A' : '#1F3864'
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #ddd', padding: '22px 26px', maxWidth: 480, width: '100%', maxHeight: '88vh', overflowY: 'auto' }}>
        <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{title}</h4>
        <p style={{ fontSize: 12, color: '#555', lineHeight: 1.5, marginBottom: 14 }}>{body}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, paddingTop: 10, borderTop: '1px solid #eee' }}>
          <button onClick={onClose} style={cancelStyle}>Cancel</button>
          {onConfirm && (
            <button onClick={onConfirm} style={{ ...cancelStyle, background: confirmBg, color: '#fff', borderColor: confirmBg }}>
              {confirmLabel || 'Confirm'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const cancelStyle = { padding: '8px 20px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid #ccc', background: '#f5f5f5', color: '#333' }
