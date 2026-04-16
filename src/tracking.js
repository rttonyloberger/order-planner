// v4 - 17TRACK integration — fully automatic, no manual steps needed
// Server handles all carrier resolution server-side

export const CARRIER_PREFIXES = {
  // CMA CGM / CNC Line
  'CMAU': { code: '190',    name: 'CMA CGM' },
  'CMDU': { code: '190',    name: 'CMA CGM' },
  'CGMU': { code: '190',    name: 'CMA CGM' },
  'CNCU': { code: '190',    name: 'CNC Line' },
  // Maersk
  'MAEU': { code: '100003', name: 'Maersk' },
  'MSKU': { code: '100003', name: 'Maersk' },
  'MRKU': { code: '100003', name: 'Maersk' },
  // MSC
  'MSCU': { code: '100002', name: 'MSC' },
  'MEDU': { code: '100002', name: 'MSC' },
  'MSDU': { code: '100002', name: 'MSC' },
  'MSMU': { code: '100002', name: 'MSC' },
  // COSCO / OOCL
  'COSU': { code: '100011', name: 'COSCO' },
  'CBHU': { code: '100011', name: 'COSCO' },
  'OOLU': { code: '100011', name: 'COSCO/OOCL' },
  'OOCU': { code: '100011', name: 'COSCO/OOCL' },
  'ECMU': { code: '100011', name: 'COSCO/OOCL' },
  // Evergreen
  'EITU': { code: '100006', name: 'Evergreen' },
  'EGHU': { code: '100006', name: 'Evergreen' },
  'SELU': { code: '100006', name: 'Evergreen' },
  'TCKU': { code: '100006', name: 'Evergreen' },
  'TRHU': { code: '100006', name: 'Evergreen' },
  'TGBU': { code: '100006', name: 'Evergreen' },
  // Hapag-Lloyd
  'HLCU': { code: '100007', name: 'Hapag-Lloyd' },
  'HLXU': { code: '100007', name: 'Hapag-Lloyd' },
  'UETU': { code: '100007', name: 'Hapag-Lloyd' },
  // ONE Line
  'ONEY': { code: '100009', name: 'ONE Line' },
  'NYKU': { code: '100009', name: 'ONE Line' },
  'MOLU': { code: '100009', name: 'ONE Line' },
  // Yang Ming
  'YMLU': { code: '100010', name: 'Yang Ming' },
  'YMJU': { code: '100010', name: 'Yang Ming' },
  'YMMU': { code: '100010', name: 'Yang Ming' },
  // ZIM
  'ZIMU': { code: '100012', name: 'ZIM' },
  'ZXJU': { code: '100012', name: 'ZIM' },
  // Wan Hai
  'WHLU': { code: '100013', name: 'Wan Hai' },
  // PIL
  'PILU': { code: '100145', name: 'PIL' },
  'PCIU': { code: '100145', name: 'PIL' },
  // GYC = Loadstar Shipping forwarder
  'GYC':  { code: '3011',   name: 'Loadstar Shipping' },
  // Leased containers — auto-detect (carrier varies by shipment)
  'TCNU': { code: '0', name: 'Triton Container' },
  'TCLU': { code: '0', name: 'Triton Container' },
  'DRYU': { code: '0', name: 'Dry Container' },
  'BSIU': { code: '0', name: 'BSI Container' },
  'FCIU': { code: '0', name: 'Florens Container' },
  'FFAU': { code: '0', name: 'FAM Container' },
  'CAAU': { code: '0', name: 'CAA Container' },
  'KOCU': { code: '0', name: 'Koole Container' },
  'HAMU': { code: '0', name: 'Hamburg Süd leased' },
  'FANU': { code: '0', name: 'Leased Container' },
  'BMOU': { code: '0', name: 'BM Container' },
  'BEAU': { code: '0', name: 'Beacon Container' },
  'SMCU': { code: '0', name: 'SMC Container' },
  'TIIU': { code: '0', name: 'TII Container' },
  'CRSU': { code: '0', name: 'CRS Container' },
  'HHXU': { code: '0', name: 'HH Container' },
  'EWLU': { code: '0', name: 'EWL Container' },
  'CICU': { code: '0', name: 'CIC Container' },
  'JPCU': { code: '0', name: 'JPC Container' },
  'DFSU': { code: '0', name: 'DFS Container' },
  'HMMU': { code: '0', name: 'HMM Container' },
  'TTNU': { code: '0', name: 'TTN Container' },
}

export const CARRIERS = [
  { code: '0',      name: 'Auto-detect' },
  { code: '190',    name: 'CMA CGM / CNC Line' },
  { code: '100003', name: 'Maersk' },
  { code: '100002', name: 'MSC' },
  { code: '100011', name: 'COSCO / OOCL' },
  { code: '100006', name: 'Evergreen' },
  { code: '100007', name: 'Hapag-Lloyd' },
  { code: '100009', name: 'ONE Line' },
  { code: '100010', name: 'Yang Ming' },
  { code: '100012', name: 'ZIM' },
  { code: '100013', name: 'Wan Hai' },
  { code: '100145', name: 'PIL' },
  { code: '3011',   name: 'Loadstar / Forwarder (GYC)' },
]

export const TRACKING_STATUSES = {
  NotFound:       { label: 'Not Found',       color: '#888',    bg: '#f5f5f5', icon: '?' },
  InfoReceived:   { label: 'Info Received',   color: '#633806', bg: '#FAEEDA', icon: '📋' },
  InTransit:      { label: 'In Transit',      color: '#0C447C', bg: '#E6F1FB', icon: '🚢' },
  OutForDelivery: { label: 'Out for Delivery',color: '#27500A', bg: '#EAF3DE', icon: '🚚' },
  FailedAttempt:  { label: 'Failed Attempt',  color: '#A32D2D', bg: '#FCEBEB', icon: '⚠️' },
  Delivered:      { label: 'Delivered',       color: '#27500A', bg: '#EAF3DE', icon: '✅' },
  Exception:      { label: 'Exception',       color: '#A32D2D', bg: '#FCEBEB', icon: '🚨' },
  Expired:        { label: 'Expired',         color: '#888',    bg: '#f5f5f5', icon: '⏱' },
}

// Detect carrier from tracking number prefix
export function detectCarrier(trackingNumber) {
  if (!trackingNumber) return null
  const upper = trackingNumber.toUpperCase().trim()
  if (upper.startsWith('GYC')) return CARRIER_PREFIXES['GYC']
  const prefix = upper.slice(0, 4)
  return CARRIER_PREFIXES[prefix] || null
}

// Single proxy call — server handles carrier resolution internally
async function callProxy(action, trackingNumber, carrierCode) {
  try {
    const res = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, trackingNumber, carrierCode: carrierCode || '0' })
    })
    if (res.status === 429) {
      console.warn('17TRACK rate limit hit')
      return null
    }
    return await res.json()
  } catch (e) {
    console.error('Proxy error:', e)
    return null
  }
}

// Register — server will try with specific carrier first
export async function registerTracking(trackingNumber) {
  if (!trackingNumber) return
  const detected = detectCarrier(trackingNumber)
  const code = (detected?.code && detected.code !== '0') ? detected.code : '0'
  return await callProxy('register', trackingNumber, code)
}

// Get tracking — server tries specific carrier then auto-detect, returns best result
export async function getTracking(trackingNumber) {
  if (!trackingNumber) return null
  const detected = detectCarrier(trackingNumber)
  const code = (detected?.code && detected.code !== '0') ? detected.code : '0'

  const data = await callProxy('gettrackinfo', trackingNumber, code)
  if (!data || data.code !== 0) return null

  const accepted = data.data?.accepted || []
  if (!accepted.length) return null

  return parseAccepted(accepted)
}

function parseAccepted(accepted) {
  if (!accepted?.length) return null

  const best = accepted.find(a => {
    const s = a.track_info?.latest_status?.status
    return s && s !== 'NotFound'
  }) || accepted[accepted.length - 1]

  const trackInfo = best?.track_info
  if (!trackInfo) return null

  const statusStr = trackInfo.latest_status?.status || 'NotFound'
  const statusInfo = TRACKING_STATUSES[statusStr] || TRACKING_STATUSES.NotFound
  const latestEvent = trackInfo.latest_event
  const milestones = trackInfo.milestone || []

  const events = []
  if (latestEvent) {
    events.push({
      time: latestEvent.time_utc || latestEvent.time_iso || '',
      location: latestEvent.location || '',
      message: latestEvent.description || trackInfo.latest_status?.sub_status_descr || statusStr,
    })
  }
  milestones.forEach(m => {
    const t = m.time_utc || m.time_iso || ''
    if (!events.find(e => e.time === t)) {
      events.push({ time: t, location: '', message: m.key_stage || '' })
    }
  })

  const resolvedCode = String(best?.carrier || '')
  const resolvedCarrier = CARRIERS.find(c => c.code === resolvedCode)?.name
    || Object.values(CARRIER_PREFIXES).find(c => c.code === resolvedCode)?.name
    || null

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
    events: events.slice(0, 8),
  }
}
