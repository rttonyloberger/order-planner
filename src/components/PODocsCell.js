import React, { useState, useEffect, useRef } from 'react'
import { uploadPODoc, listPODocs, getPODocUrl, deletePODoc } from '../supabase'

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase()
  if (ext === 'pdf') return '📄'
  if (['xls','xlsx','csv'].includes(ext)) return '📊'
  if (['doc','docx'].includes(ext)) return '📝'
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '🖼️'
  return '📎'
}

function canPreview(name) {
  const ext = name.split('.').pop().toLowerCase()
  return ['pdf','png','jpg','jpeg','gif','webp'].includes(ext)
}

// Doc preview modal
function DocPreviewModal({ doc, url, onClose }) {
  const ext = doc.name.split('.').pop().toLowerCase()
  const isImage = ['png','jpg','jpeg','gif','webp'].includes(ext)
  const isPDF = ext === 'pdf'

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', maxWidth: '90vw', maxHeight: '90vh', width: isPDF ? '80vw' : 'auto', height: isPDF ? '85vh' : 'auto', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,.4)' }}>
        {/* Header */}
        <div style={{ background: '#1F3864', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>{fileIcon(doc.name)}</span>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{doc.name}</span>
            {doc.size > 0 && <span style={{ color: '#8BA4CC', fontSize: 11 }}>{fmtSize(doc.size)}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ padding: '5px 12px', background: 'rgba(255,255,255,.15)', color: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 500, textDecoration: 'none', border: '1px solid rgba(255,255,255,.2)' }}>
              Open in new tab ↗
            </a>
            <button onClick={onClose} style={{ padding: '5px 12px', background: 'rgba(255,255,255,.1)', color: '#fff', border: '1px solid rgba(255,255,255,.2)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
              Close ✕
            </button>
          </div>
        </div>
        {/* Preview */}
        <div style={{ flex: 1, overflow: 'auto', background: '#f0f0f0', display: 'flex', alignItems: isImage ? 'center' : 'stretch', justifyContent: isImage ? 'center' : 'stretch' }}>
          {isPDF && <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }} title={doc.name} />}
          {isImage && <img src={url} alt={doc.name} style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', padding: 16 }} />}
        </div>
      </div>
    </div>
  )
}

// Delete confirm modal
function DeleteConfirmModal({ docName, onConfirm, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #ddd', padding: '22px 26px', maxWidth: 420, width: '100%' }}>
        <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Remove this document?</h4>
        <p style={{ fontSize: 12, color: '#555', marginBottom: 16, lineHeight: 1.5 }}>
          <strong>{docName}</strong> will be permanently deleted and cannot be recovered.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid #eee' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button onClick={onConfirm} style={{ ...cancelBtnStyle, background: '#C00000', color: '#fff', borderColor: '#C00000' }}>Yes, delete</button>
        </div>
      </div>
    </div>
  )
}

export default function PODocsCell({ poId }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null) // { doc, url }
  const [deleteTarget, setDeleteTarget] = useState(null) // doc to delete
  const fileRef = useRef()

  useEffect(() => { loadDocs() }, [poId])

  const loadDocs = async () => {
    setLoading(true)
    const list = await listPODocs(poId)
    setDocs(list)
    setLoading(false)
  }

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true); setError('')
    try {
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) { setError(`${file.name} exceeds 20MB limit`); continue }
        await uploadPODoc(poId, file)
      }
      await loadDocs()
    } catch (err) { setError('Upload failed: ' + err.message) }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleOpen = async (doc) => {
    const url = await getPODocUrl(doc.path)
    if (!url) { setError('Could not get document link'); return }
    if (canPreview(doc.name)) {
      setPreview({ doc, url })
    } else {
      // Non-previewable — open in new tab (will download)
      window.open(url, '_blank')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deletePODoc(deleteTarget.path)
      setDocs(prev => prev.filter(d => d.path !== deleteTarget.path))
    } catch (err) { setError('Delete failed') }
    setDeleteTarget(null)
  }

  return (
    <div style={{ minWidth: 180, fontSize: 10 }}>
      {loading ? (
        <div style={{ color: '#aaa', fontStyle: 'italic' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: docs.length ? 6 : 0 }}>
          {docs.map(doc => (
            <div key={doc.path} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f5f5f5', borderRadius: 5, padding: '3px 6px', border: '1px solid #e0e0e0' }}>
              <span style={{ fontSize: 12 }}>{fileIcon(doc.name)}</span>
              <button
                onClick={() => handleOpen(doc)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0C447C', fontSize: 10, textAlign: 'left', flex: 1, padding: 0, textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}
                title={canPreview(doc.name) ? `Preview ${doc.name}` : `Open ${doc.name}`}
              >
                {doc.name}
              </button>
              {doc.size > 0 && <span style={{ color: '#aaa', fontSize: 9, flexShrink: 0 }}>{fmtSize(doc.size)}</span>}
              <button
                onClick={() => setDeleteTarget(doc)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 11, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
                title="Remove document"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: '#A32D2D', fontSize: 9, marginBottom: 4 }}>{error}</div>}

      <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp" onChange={handleUpload} style={{ display: 'none' }} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{ fontSize: 10, padding: '4px 10px', background: uploading ? '#f0f0f0' : '#1F3864', color: uploading ? '#888' : '#fff', border: 'none', borderRadius: 5, cursor: uploading ? 'default' : 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
      >
        {uploading ? 'Uploading…' : docs.length ? '+ Add Doc' : '+ Attach Docs'}
      </button>

      {/* Preview modal */}
      {preview && <DocPreviewModal doc={preview.doc} url={preview.url} onClose={() => setPreview(null)} />}

      {/* Delete confirm modal */}
      {deleteTarget && <DeleteConfirmModal docName={deleteTarget.name} onConfirm={handleDeleteConfirm} onClose={() => setDeleteTarget(null)} />}
    </div>
  )
}

const cancelBtnStyle = { padding: '8px 20px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid #ccc', background: '#f5f5f5', color: '#333' }
