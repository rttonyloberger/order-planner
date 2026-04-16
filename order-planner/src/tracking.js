// 17TRACK integration for shipment tracking
// API key stored in Vercel as REACT_APP_17TRACK_API_KEY

const API_KEY = process.env.REACT_APP_17TRACK_API_KEY

export const CARRIERS = [
  { code: '190', name: 'CMA CGM', prefixes: ['CMAU','CMDU','CGMU'] },
  { code: '190', name: 'CNC Line', prefixes: ['CNCU'] },
  { code: '100003', name: 'Maersk', prefixes: ['MAEU','MSKU','MRKU'] },
  { code: '100002', name: 'MSC', prefixes: ['MSCU','MEDU'] },
  { code: '100011', name: 'COSCO', prefixes: ['COSU','CBHU'] },
  { code: '100006', name: 'Evergreen', prefixes: ['EITU','EGHU'] },
  { code: '100007', name: 'Hapag-Lloyd', prefixes: ['HLCU','HLXU'] },
  { code: '100009', name: 'ONE Line', prefixes: ['ONEY','NYKU','MOLU'] },
  { code: '100010', name: 'Yang Ming', prefixes: ['YMLU','YMJU'] },
  { code: '100012', name: 'ZIM', prefixes: ['ZIMU'] },
  { code: '100013', name: 'Wan Hai', prefixes: ['WHLU'] },
  { code: '3011', name: '17TRACK (LCL/Forwarder)', prefixes: [] },
  { code: '0', name: 'Auto-detect', prefixes: [] },
]

export const TRACKING_STATUSES = {
  0:  { label: 'Not Found',      color: '#888',    bg: '#f5f5f5' },
  10: { label: 'In Transit',     color: '#0C447C', bg: '#E6F1FB' },
  20: { label: 'Exp. Delivery',  color: '#633806', bg: '#FAEEDA' },
  30: { label: 'Pickup Ready',   color: '#27500A', bg: '#EAF3DE' },
  35: { label: 'Undelivered',    color: '#A32D2D', bg: '#FCEBEB' },
  40: { label: 'Delivered',      color: '#27500A', bg: '#EAF3DE' },
  50: { label: 'Exception',      color: '#A32D2D', bg: '#FCEBEB' },
}

// Auto-detect carrier from tracking number prefix
export function detectCarrier(trackingNumber) {
  if (!trackingNumber) return null
  const upper = trackingNumber.toUpperCase().trim()
  for (const carrier of CARRIERS) {
    if (carrier.prefixes.some(prefix => upper.startsWith(prefix))) {
      return carrier
    }
  }
  return null
}

// Register tracking number with 17TRACK
export async function registerTracking(trackingNumber, carrierCode) {
  if (!API_KEY) return { error: 'No 17TRACK API key configured' }
  try {
    const body = [{ number: trackingNumber }]
    if (carrierCode && carrierCode !== '0') {
      body[0].carrier = parseInt(carrierCode)
    }
    const res = await fetch('https://api.17track.net/track/v2.2/register', {
      method: 'POST',
      headers: {
        '17token': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    if (data.code === 0) return { success: true }
    return { error: data.data?.errors?.[0]?.message || '17TRACK error' }
  } catch (e) {
    return { error: e.message }
  }
}

// Get live tracking info
export async function getTracking(trackingNumber, carrierCode) {
  if (!API_KEY) return null
  if (!trackingNumber) return null
  try {
    const body = [{ number: trackingNumber }]
    if (carrierCode && carrierCode !== '0') {
      body[0].carrier = parseInt(carrierCode)
    }
    const res = await fetch('https://api.17track.net/track/v2.2/gettrackinfo', {
      method: 'POST',
      headers: {
        '17token': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    if (data.code !== 0) return null
    const track = data.data?.accepted?.[0]?.track
    if (!track) return null

    const statusInfo = TRACKING_STATUSES[track.e] || TRACKING_STATUSES[0]
    const events = track.z0 || []

    return {
      statusCode: track.e,
      statusLabel: statusInfo.label,
      statusStyle: statusInfo,
      lastEvent: events[0]?.z || '',
      lastLocation: events[0]?.l || '',
      lastTime: events[0]?.a || '',
      eta: track.eta || null,
      origin: track.ot || '',
      destination: track.dt || '',
      events: events.slice(0, 6).map(e => ({
        time: e.a,
        location: e.l,
        message: e.z,
      }))
    }
  } catch (e) {
    return null
  }
}
