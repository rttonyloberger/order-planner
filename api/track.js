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

  const { action, trackingNumber, carrierCode } = req.body
  if (!trackingNumber) return res.status(400).json({ error: 'No tracking number' })

  // For gettrackinfo, try multiple carrier codes and return best result
  if (action === 'gettrackinfo') {
    // Build list of carriers to try: specific carrier first, then auto-detect
    const carriersToTry = []
    if (carrierCode && carrierCode !== '0') carriersToTry.push(carrierCode)
    carriersToTry.push('0') // always try auto-detect

    for (const code of carriersToTry) {
      const cacheKey = `${trackingNumber.toUpperCase()}-${code}`
      const hit = cache[cacheKey]
      if (hit && Date.now() - hit.time < CACHE_TTL) {
        return res.status(200).json(hit.data)
      }

      const payload = [{ number: trackingNumber }]
      if (code && code !== '0') payload[0].carrier = parseInt(code)

      try {
        const response = await fetch('https://api.17track.net/track/v2.2/gettrackinfo', {
          method: 'POST',
          headers: { '17token': API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (response.status === 429) {
          return res.status(429).json({ error: 'Rate limit reached' })
        }

        const data = await response.json()

        if (data.code === 0) {
          // Check if we got real tracking data
          const hasRealData = data.data?.accepted?.some(a => {
            const s = a.track_info?.latest_status?.status
            return s && s !== 'NotFound'
          })

          if (hasRealData) {
            // Cache it and return immediately
            cache[cacheKey] = { data, time: Date.now() }
            return res.status(200).json(data)
          }
        }
      } catch (err) {
        console.error('17TRACK error:', err.message)
      }
    }

    // Nothing worked — register and return empty (will populate on next check)
    // Try to register with the specific carrier so 17TRACK fetches data in background
    if (carrierCode && carrierCode !== '0') {
      const regPayload = [{ number: trackingNumber, carrier: parseInt(carrierCode) }]
      try {
        await fetch('https://api.17track.net/track/v2.2/register', {
          method: 'POST',
          headers: { '17token': API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(regPayload),
        })
      } catch (e) { /* ignore */ }
    }

    return res.status(200).json({ code: 0, data: { accepted: [], rejected: [] } })
  }

  // Register action
  if (action === 'register') {
    const payload = [{ number: trackingNumber }]
    if (carrierCode && carrierCode !== '0') payload[0].carrier = parseInt(carrierCode)

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
