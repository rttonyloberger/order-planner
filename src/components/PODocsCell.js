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

export default function PODocsCell({ poId }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    loadDocs()
  }, [poId])

  const loadDocs = async () => {
    setLoading(true)
    const list = await listPODocs(poId)
    setDocs(list)
    setLoading(false)
  }

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    setError('')
    try {
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) {
          setError(`${file.name} is too large (max 20MB)`)
          continue
        }
        await uploadPODoc(poId, file)
      }
      await loadDocs()
    } catch (err) {
      setError('Upload failed: ' + err.message)
    }
    setUploading(false)
    // Reset input
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleOpen = async (doc) => {
    const url = await getPODocUrl(doc.path)
    if (url) window.open(url, '_blank')
    else setError('Could not get download link')
  }

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.name}"?`)) return
    setDeleting(doc.path)
    try {
      await deletePODoc(doc.path)
      setDocs(prev => prev.filter(d => d.path !== doc.path))
    } catch (err) {
      setError('Delete failed')
    }
    setDeleting(null)
  }

  return (
    <div style={{ minWidth: 180, fontSize: 10 }}>
      {/* Doc list */}
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
                title={doc.name}
              >
                {doc.name}
              </button>
              {doc.size > 0 && <span style={{ color: '#aaa', fontSize: 9, flexShrink: 0 }}>{fmtSize(doc.size)}</span>}
              <button
                onClick={() => handleDelete(doc)}
                disabled={deleting === doc.path}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 11, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && <div style={{ color: '#A32D2D', fontSize: 9, marginBottom: 4 }}>{error}</div>}

      {/* Upload button */}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp"
        onChange={handleUpload}
        style={{ display: 'none' }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{
          fontSize: 10, padding: '4px 10px',
          background: uploading ? '#f0f0f0' : '#1F3864',
          color: uploading ? '#888' : '#fff',
          border: 'none', borderRadius: 5,
          cursor: uploading ? 'default' : 'pointer',
          fontWeight: 500, whiteSpace: 'nowrap'
        }}
      >
        {uploading ? 'Uploading…' : docs.length ? '+ Add Doc' : '+ Attach Docs'}
      </button>
    </div>
  )
}
