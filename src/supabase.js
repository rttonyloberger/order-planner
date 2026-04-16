import { createClient } from '@supabase/supabase-js'

// These get replaced with your real values from .env
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase env vars. Check your .env file or Vercel environment variables.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Storage helpers for PO documents
export async function uploadPODoc(poId, file) {
  const ext = file.name.split('.').pop()
  const path = `${poId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { data, error } = await supabase.storage
    .from('po-documents')
    .upload(path, file, { upsert: false })
  if (error) throw error
  return { path: data.path, name: file.name, size: file.size }
}

export async function listPODocs(poId) {
  const { data, error } = await supabase.storage
    .from('po-documents')
    .list(poId, { sortBy: { column: 'created_at', order: 'asc' } })
  if (error || !data) return []
  return data.map(f => ({
    name: f.name.replace(/^\d+_/, ''), // strip timestamp prefix
    path: `${poId}/${f.name}`,
    size: f.metadata?.size || 0,
  }))
}

export async function getPODocUrl(path) {
  const { data } = await supabase.storage
    .from('po-documents')
    .createSignedUrl(path, 60 * 60) // 1 hour expiry
  return data?.signedUrl || null
}

export async function deletePODoc(path) {
  const { error } = await supabase.storage
    .from('po-documents')
    .remove([path])
  if (error) throw error
}
