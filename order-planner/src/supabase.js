import { createClient } from '@supabase/supabase-js'

// These get replaced with your real values from .env
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase env vars. Check your .env file or Vercel environment variables.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
