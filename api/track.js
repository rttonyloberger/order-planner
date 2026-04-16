// Vercel serverless proxy for 17TRACK
// api/track.js — at repo ROOT level (same level as src/ and package.json)

const cache = {}
const CACHE_TTL = 10 * 60 * 1000 // 10 min

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const API_KEY = process.env.REACT_APP_17TRACK_API_KEY
  if (!API_KEY) return res.status(500).json({ error: 'No 17TRACK API key configured' })

  const { action, trackingNumber, carrierCode } = req.body
  if (!trackingNumber) return res.status(400).json({ error: 'No tracking number' })

  // Cache key includes carrier code so different carrier attempts are cached separately
  // Only cache successful non-NotFound responses
  const cacheKey = `${trackingNumber.toUpperCase()}-${carrierCode || '0'}`

  if (action === 'gettrackinfo') {
    const hit = cache[cacheKey]
    if (hit && Date.now() - hit.time < CACHE_TTL) {
      console.log('Cache hit for', cacheKey)
      return res.status(200).json(hit.data)
    }
  }

  const payload = [{ number: trackingNumber }]
  if (carrierCode && carrierCode !== '0' && carrierCode !== '') {
    payload[0].carrier = parseInt(carrierCode)
  }

  const endpoint = action === 'register'
    ? 'https://api.17track.net/track/v2.2/register'
    : 'https://api.17track.net/track/v2.2/gettrackinfo'

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { '17token': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (response.status === 429) {
      return res.status(429).json({ error: 'Rate limit reached. Try again shortly.' })
    }

    const data = await response.json()

    // Only cache if we got real tracking data (not NotFound)
    if (action === 'gettrackinfo' && data.code === 0) {
      const hasRealData = data.data?.accepted?.some(a =>
        a.track_info?.latest_status?.status &&
        a.track_info.latest_status.status !== 'NotFound'
      )
      if (hasRealData) {
        cache[cacheKey] = { data, time: Date.now() }
        console.log('Cached real data for', cacheKey)
      }
    }

    return res.status(200).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
