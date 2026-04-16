// Vercel serverless proxy for 17TRACK
// api/track.js — repo ROOT level

const cache = {}
const CACHE_TTL = 10 * 60 * 1000 // 10 min

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const API_KEY = process.env.REACT_APP_17TRACK_API_KEY
  if (!API_KEY) return res.status(500).json({ error: 'No 17TRACK API key' })

  const { action, trackingNumber } = req.body
  if (!trackingNumber) return res.status(400).json({ error: 'No tracking number' })

  // ALWAYS use auto-detect (no carrier code) — let 17TRACK figure it out
  // This matches what their website does and works reliably
  const payload = [{ number: trackingNumber }]

  if (action === 'gettrackinfo') {
    const cacheKey = trackingNumber.toUpperCase()
    const hit = cache[cacheKey]
    if (hit && Date.now() - hit.time < CACHE_TTL) {
      return res.status(200).json(hit.data)
    }

    try {
      const response = await fetch('https://api.17track.net/track/v2.2/gettrackinfo', {
        method: 'POST',
        headers: { '17token': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.status === 429) return res.status(429).json({ error: 'Rate limit reached' })

      const data = await response.json()

      if (data.code === 0) {
        const hasRealData = data.data?.accepted?.some(a => {
          const s = a.track_info?.latest_status?.status
          return s && s !== 'NotFound'
        })
        // Only cache if we got real data
        if (hasRealData) cache[cacheKey] = { data, time: Date.now() }
        return res.status(200).json(data)
      }

      return res.status(200).json(data)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  if (action === 'register') {
    // Register without carrier — pure auto-detect
    try {
      const response = await fetch('https://api.17track.net/track/v2.2/register', {
        method: 'POST',
        headers: { '17token': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      return res.status(200).json(data)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(400).json({ error: 'Unknown action' })
}
