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
  NotFound:         { label: 'Not Found',      color: '#888',    bg: '#f5f5f5', icon: '?' },
  InfoReceived:     { label: 'Info Received',  color: '#633806', bg: '#FAEEDA', icon: '📋' },
  InTransit:        { label: 'In Transit',     color: '#0C447C', bg: '#E6F1FB', icon: '🚢' },
  OutForDelivery:   { label: 'Out for Delivery',color: '#27500A',bg: '#EAF3DE', icon: '🚚' },
  FailedAttempt:    { label: 'Failed Attempt', color: '#A32D2D', bg: '#FCEBEB', icon: '⚠️' },
  Delivered:        { label: 'Delivered',      color: '#27500A', bg: '#EAF3DE', icon: '✅' },
  Exception:        { label: 'Exception',      color: '#A32D2D', bg: '#FCEBEB', icon: '🚨' },
  Expired:          { label: 'Expired',        color: '#888',    bg: '#f5f5f5', icon: '⏱' },
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

async function callProxy(action, trackingNumber) {
  try {
    const res = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, trackingNumber })
    })
    return await res.json()
  } catch (e) {
    console.error('Proxy error:', e)
    return null
  }
}

export async function registerTracking(trackingNumber) {
  if (!trackingNumber) return
  const result = await callProxy('register', trackingNumber)
  // -18019901 just means already registered — that's fine
  return result
}

export async function getTracking(trackingNumber) {
  if (!trackingNumber) return null

  const data = await callProxy('gettrackinfo', trackingNumber)
  if (!data || data.code !== 0) return null

  const accepted = data.data?.accepted || []
  if (!accepted.length) return null

  // Pick the best entry — the one with actual tracking data (not NotFound)
  // 17TRACK may return multiple entries for different carrier interpretations
  const best = accepted.find(a => {
    const status = a.track_info?.latest_status?.status
    return status && status !== 'NotFound'
  }) || accepted[accepted.length - 1] // fallback to last entry

  const trackInfo = best?.track_info
  if (!trackInfo) return null

  const statusStr = trackInfo.latest_status?.status || 'NotFound'
  const statusInfo = TRACKING_STATUSES[statusStr] || TRACKING_STATUSES.NotFound

  // Latest event details
  const latestEvent = trackInfo.latest_event
  const milestones = trackInfo.milestone || []

  // All tracking events — build from milestone + latest event
  const events = milestones.length > 0
    ? milestones.map(m => ({
        time: m.time_utc || m.time_iso || '',
        location: '',
        message: m.key_stage || '',
      }))
    : latestEvent
      ? [{ time: latestEvent.time_utc || latestEvent.time_iso || '', location: '', message: statusStr }]
      : []

  // Carrier name
  const resolvedCarrierCode = String(best?.carrier || '')
  const resolvedCarrier = CARRIERS.find(c => c.code === resolvedCarrierCode)?.name || null

  return {
    statusCode: statusStr,
    statusLabel: statusInfo.label,
    statusStyle: statusInfo,
    statusIcon: statusInfo.icon,
    resolvedCarrier,
    lastTime: latestEvent?.time_utc || latestEvent?.time_iso || '',
    lastLocation: latestEvent?.location || '',
    lastEvent: trackInfo.latest_status?.sub_status_descr || trackInfo.latest_status?.sub_status || '',
    eta: trackInfo.time_metrics?.estimated_delivery_date || null,
    totalEvents: events.length,
    events,
  }
}
