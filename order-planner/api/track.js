// Vercel serverless function — proxies 17TRACK API calls
// File location: api/track.js (at repo ROOT, same level as src/ and package.json)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const API_KEY = process.env.REACT_APP_17TRACK_API_KEY
  if (!API_KEY) return res.status(500).json({ error: 'No 17TRACK API key' })

  const { action, trackingNumber, carrierCode } = req.body
  if (!trackingNumber) return res.status(400).json({ error: 'No tracking number' })

  // Build payload — if no carrier code, omit it so 17TRACK auto-detects
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
    const data = await response.json()
    return res.status(200).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
