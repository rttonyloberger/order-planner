// Vercel serverless proxy for 17TRACK
// Sits between the browser and 17TRACK to avoid CORS
// Also caches responses to avoid rate limits

const cache = {}
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const API_KEY = process.env.REACT_APP_17TRACK_API_KEY
  if (!API_KEY) return res.status(500).json({ error: 'No 17TRACK API key configured' })

  const { action, trackingNumber } = req.body
  if (!trackingNumber) return res.status(400).json({ error: 'No tracking number' })

  // For gettrackinfo, check cache first to save API quota
  if (action === 'gettrackinfo') {
    const cacheKey = trackingNumber.toUpperCase()
    const cached = cache[cacheKey]
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      return res.status(200).json(cached.data)
    }
  }

  const payload = [{ number: trackingNumber }]

  const endpoint = action === 'register'
    ? 'https://api.17track.net/track/v2.2/register'
    : 'https://api.17track.net/track/v2.2/gettrackinfo'

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        '17token': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    })

    if (response.status === 429) {
      return res.status(429).json({ error: 'Rate limit reached. Try again in a few minutes.' })
    }

    const data = await response.json()

    // Cache successful gettrackinfo responses
    if (action === 'gettrackinfo' && data.code === 0) {
      cache[trackingNumber.toUpperCase()] = { data, time: Date.now() }
    }

    return res.status(200).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
