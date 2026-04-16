// v7 - Full carrier support
// Strategy:
//   - Known-direct carriers (CMA, CNC, HMM, SM Line): skip 17TRACK, show direct link button
//   - Known-17TRACK carriers: use 17TRACK API
//   - Leased containers (unknown carrier): try 17TRACK, show fallback links if NotFound

export const CARRIER_PREFIXES = {
  // ── Direct-link carriers (17TRACK API unreliable) ──────────────────────
  // CMA CGM
  'CMAU': { code: '190', name: 'CMA CGM', direct: true,
    url: (n) => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchField=${n}` },
  'CMDU': { code: '190', name: 'CMA CGM', direct: true,
    url: (n) => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchField=${n}` },
  'CGMU': { code: '190', name: 'CMA CGM', direct: true,
    url: (n) => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchField=${n}` },
  // CNC Line
  'CNCU': { code: '190', name: 'CNC Line', direct: true,
    url: () => 'https://www.cnc-line.cn/ebusiness/tracking' },
  'SELU': { code: '190', name: 'CNC Line', direct: true,
    url: () => 'https://www.cnc-line.cn/ebusiness/tracking' },
  // HMM / Hyundai
  'HMMU': { code: '0', name: 'HMM (Hyundai)', direct: true,
    url: (n) => `https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do?blnNo=${n}` },
  // SM Line
  'SMCU': { code: '0', name: 'SM Line', direct: true,
    url: () => 'https://esvc.smlines.com/smline/CUP_HOM_3301.do?sessLocale=en' },

  // ── 17TRACK carriers ───────────────────────────────────────────────────
  // Maersk
  'MAEU': { code: '100003', name: 'Maersk',
    url: (n) => `https://www.maersk.com/tracking/${n}` },
  'MSKU': { code: '100003', name: 'Maersk',
    url: (n) => `https://www.maersk.com/tracking/${n}` },
  'MRKU': { code: '100003', name: 'Maersk',
    url: (n) => `https://www.maersk.com/tracking/${n}` },
  // MSC
  'MSCU': { code: '100002', name: 'MSC',
    url: () => 'https://www.msc.com/en/track-a-shipment' },
  'MEDU': { code: '100002', name: 'MSC',
    url: () => 'https://www.msc.com/en/track-a-shipment' },
  'MSDU': { code: '100002', name: 'MSC',
    url: () => 'https://www.msccargo.cn/' },
  'MSMU': { code: '100002', name: 'MSC',
    url: () => 'https://www.msccargo.cn/' },
  // COSCO / OOCL
  'COSU': { code: '100011', name: 'COSCO',
    url: () => 'https://elines.coscoshipping.com/ebusiness/cargotracking' },
  'CBHU': { code: '100011', name: 'COSCO',
    url: () => 'https://elines.coscoshipping.com/ebusiness/cargotracking' },
  'OOLU': { code: '100011', name: 'OOCL',
    url: () => 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx' },
  'OOCU': { code: '100011', name: 'OOCL',
    url: () => 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx' },
  'ECMU': { code: '100011', name: 'COSCO/OOCL',
    url: () => 'https://elines.coscoshipping.com/ebusiness/cargotracking' },
  // Evergreen
  'EITU': { code: '100006', name: 'Evergreen' },
  'EGHU': { code: '100006', name: 'Evergreen' },
  'TCKU': { code: '100006', name: 'Evergreen' },
  'TRHU': { code: '100006', name: 'Evergreen',
    url: () => 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking' },
  'TGBU': { code: '100006', name: 'OOCL',
    url: () => 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx' },
  // Hapag-Lloyd
  'HLCU': { code: '100007', name: 'Hapag-Lloyd',
    url: (n) => `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${n}` },
  'HLXU': { code: '100007', name: 'Hapag-Lloyd',
    url: (n) => `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${n}` },
  'UETU': { code: '100007', name: 'Hapag-Lloyd',
    url: (n) => `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${n}` },
  'HAMU': { code: '100007', name: 'Hapag-Lloyd',
    url: (n) => `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${n}` },
  'FANU': { code: '100007', name: 'Hapag-Lloyd',
    url: (n) => `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${n}` },
  // ONE Line
  'ONEY': { code: '100009', name: 'ONE Line',
    url: () => 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking' },
  'NYKU': { code: '100009', name: 'ONE Line',
    url: () => 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking' },
  'MOLU': { code: '100009', name: 'ONE Line',
    url: () => 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking' },
  'BEAU': { code: '100009', name: 'ONE Line',
    url: () => 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking' },
  'TCLU': { code: '100009', name: 'ONE Line',
    url: () => 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking' },
  // Yang Ming
  'YMLU': { code: '100010', name: 'Yang Ming',
    url: () => 'https://www.yangming.com/e-service/Track_Trace/Track_Trace_cargo_tracking.aspx' },
  'YMJU': { code: '100010', name: 'Yang Ming' },
  'YMMU': { code: '100010', name: 'Yang Ming',
    url: () => 'https://www.yangming.com/e-service/Track_Trace/Track_Trace_cargo_tracking.aspx' },
  // ZIM
  'ZIMU': { code: '100012', name: 'ZIM' },
  'ZXJU': { code: '100012', name: 'ZIM' },
  // Wan Hai
  'WHLU': { code: '100013', name: 'Wan Hai' },
  // PIL
  'PILU': { code: '100145', name: 'PIL' },
  'PCIU': { code: '100145', name: 'PIL' },
  // GYC = Loadstar
  'GYC':  { code: '3011', name: 'Loadstar Shipping' },

  // ── Leased containers — try 17TRACK, fallback links if needed ──────────
  // Per your spreadsheet, these go on various carriers
  'TCNU': { code: '0', name: 'Leased Container' },   // seen on HMM & CMA
  'DRYU': { code: '0', name: 'Leased Container',
    url: () => 'https://esvc.smlines.com/smline/CUP_HOM_3301.do?sessLocale=en' },
  'BSIU': { code: '0', name: 'Leased Container' },
  'FCIU': { code: '0', name: 'Leased Container',
    url: () => 'https://elines.coscoshipping.com/ebusiness/cargotracking' },
  'FFAU': { code: '0', name: 'Leased Container' },
  'CAAU': { code: '0', name: 'Leased Container' },
  'KOCU': { code: '0', name: 'Leased Container',
    url: (n) => `https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do?blnNo=${n}` },
  'BMOU': { code: '0', name: 'Leased Container',
    url: (n) => `https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do?blnNo=${n}` },
  'TIIU': { code: '0', name: 'Leased Container' },
  'CRSU': { code: '0', name: 'Leased Container' },
  'HHXU': { code: '0', name: 'Leased Container' },
  'EWLU': { code: '0', name: 'Leased Container' },
  'CICU': { code: '0', name: 'Leased Container' },
  'JPCU': { code: '0', name: 'Leased Container' },
  'DFSU': { code: '0', name: 'Leased Container' },
  'HMMU2': { code: '0', name: 'Leased Container' }, // placeholder
  'TTNU': { code: '0', name: 'Leased Container' },
}

export const CARRIERS = [
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
  { code: '3011',   name: 'Loadstar Shipping' },
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

export function detectCarrier(trackingNumber) {
  if (!trackingNumber) return null
  const upper = trackingNumber.toUpperCase().trim()
  if (upper.startsWith('GYC')) return { ...CARRIER_PREFIXES['GYC'], prefix: 'GYC' }
  const prefix = upper.slice(0, 4)
  if (CARRIER_PREFIXES[prefix]) return { ...CARRIER_PREFIXES[prefix], prefix }
  return null
}

// Returns true if we skip 17TRACK entirely for this number
export function isDirectOnly(trackingNumber) {
  return detectCarrier(trackingNumber)?.direct === true
}

// Get the direct carrier URL (works for all carriers with a url property)
export function getDirectUrl(trackingNumber) {
  const c = detectCarrier(trackingNumber)
  return c?.url ? c.url(trackingNumber) : null
}

async function callProxy(action, trackingNumber) {
  try {
    const res = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, trackingNumber })
    })
    if (res.status === 429) { console.warn('17TRACK rate limit'); return null }
    return await res.json()
  } catch (e) {
    console.error('Proxy error:', e)
    return null
  }
}

export async function registerTracking(trackingNumber) {
  if (!trackingNumber || isDirectOnly(trackingNumber)) return
  return await callProxy('register', trackingNumber)
}

export async function getTracking(trackingNumber) {
  if (!trackingNumber || isDirectOnly(trackingNumber)) return null
  const data = await callProxy('gettrackinfo', trackingNumber)
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
    if (!events.find(e => e.time === t))
      events.push({ time: t, location: '', message: m.key_stage || '' })
  })

  const resolvedCode = String(best?.carrier || '')
  const resolvedCarrier = CARRIERS.find(c => c.code === resolvedCode)?.name
    || Object.values(CARRIER_PREFIXES).find(c => c.code === resolvedCode)?.name || null

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
