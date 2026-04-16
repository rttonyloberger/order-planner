// 17TRACK integration via Vercel proxy

export const CARRIERS = [
  { code: '0',      name: 'Auto-detect',             prefixes: [] },
  { code: '190',    name: 'CMA CGM / CNC Line',       prefixes: ['CMAU','CMDU','CGMU','CNCU'] },
  { code: '100003', name: 'Maersk',                   prefixes: ['MAEU','MSKU','MRKU'] },
  { code: '100002', name: 'MSC',                      prefixes: ['MSCU','MEDU'] },
  { code: '100011', name: 'COSCO',                    prefixes: ['COSU','CBHU'] },
  { code: '100006', name: 'Evergreen',                prefixes: ['EITU','EGHU'] },
  { code: '100007', name: 'Hapag-Lloyd',              prefixes: ['HLCU','HLXU'] },
  { code: '100009', name: 'ONE Line',                 prefixes: ['ONEY','NYKU','MOLU'] },
  { code: '100010', name: 'Yang Ming',                prefixes: ['YMLU','YMJU'] },
  { code: '100012', name: 'ZIM',                      prefixes: ['ZIMU'] },
  { code: '100013', name: 'Wan Hai',                  prefixes: ['WHLU'] },
  { code: '3011',   name: 'Loadstar / Forwarder',     prefixes: ['GYC'] },
]

export const TRACKING_STATUSES = {
  0:  { label: 'Not Found',     color: '#888',    bg: '#f5f5f5',  icon: '?' },
  10: { label: 'In Transit',    color: '#0C447C', bg: '#E6F1FB',  icon: '🚢' },
  20: { label: 'Exp. Delivery', color: '#633806', bg: '#FAEEDA',  icon: '📦' },
  30: { label: 'Pickup Ready',  color: '#27500A', bg: '#EAF3DE',  icon: '✅' },
  35: { label: 'Undelivered',   color: '#A32D2D', bg: '#FCEBEB',  icon: '⚠️' },
  40: { label: 'Delivered',     color: '#27500A', bg: '#EAF3DE',  icon: '✅' },
  50: { label: 'Exception',     color: '#A32D2D', bg: '#FCEBEB',  icon: '🚨' },
}

export function detectCarrier(trackingNumber) {
  if (!trackingNumber) return null
  const upper = trackingNumber.toUpperCase().trim()
  for (const carrier of CARRIERS) {
    if (carrier.prefixes?.some(prefix => upper.startsWith(prefix))) {
      return carrier
    }
  }
  return null
}

async function callProxy(action, trackingNumber, carrierCode) {
  try {
    const res = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, trackingNumber, carrierCode: carrierCode || '0' })
    })
    return await res.json()
  } catch (e) {
    console.error('Proxy error:', e)
    return null
  }
}

// Register — always auto-detect carrier, proxy handles this
export async function registerTracking(trackingNumber) {
  if (!trackingNumber) return
  const result = await callProxy('register', trackingNumber, '0')
  if (result?.data?.rejected?.length > 0) {
    console.warn('17TRACK registration issue:', result.data.rejected[0]?.error)
  }
  return result
}

// Get live tracking info
export async function getTracking(trackingNumber, carrierCode) {
  if (!trackingNumber) return null

  // Always try without carrier first (auto-detect)
  const data = await callProxy('gettrackinfo', trackingNumber, '0')
  if (!data || data.code !== 0) return null

  const accepted = data.data?.accepted?.[0]
  const track = accepted?.track

  // If not found with auto-detect and we have a carrier, try with carrier
  if (!track && carrierCode && carrierCode !== '0') {
    const data2 = await callProxy('gettrackinfo', trackingNumber, carrierCode)
    if (!data2 || data2.code !== 0) return null
    const accepted2 = data2.data?.accepted?.[0]
    if (!accepted2?.track) return null
    return parseTrackData(accepted2)
  }

  if (!track) return null
  return parseTrackData(accepted)
}

function parseTrackData(accepted) {
  const track = accepted.track
  const statusInfo = TRACKING_STATUSES[track.e] || TRACKING_STATUSES[0]
  const events = track.z0 || []

  // Carrier name from resolved carrier code
  const resolvedCarrierCode = String(accepted.carrier || '')
  const resolvedCarrier = CARRIERS.find(c => c.code === resolvedCarrierCode)?.name
    || track.c  // fallback to carrier name in track data
    || null

  return {
    statusCode: track.e,
    statusLabel: statusInfo.label,
    statusStyle: statusInfo,
    statusIcon: statusInfo.icon,
    resolvedCarrier,
    lastEvent: events[0]?.z || '',
    lastLocation: events[0]?.l || '',
    lastTime: events[0]?.a || '',
    eta: track.eta || null,
    origin: track.ot || '',
    destination: track.dt || '',
    totalEvents: events.length,
    events: events.slice(0, 8).map(e => ({
      time: e.a,
      location: e.l,
      message: e.z,
    }))
  }
}
