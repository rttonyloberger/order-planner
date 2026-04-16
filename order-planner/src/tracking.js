// AfterShip tracking integration
// Add your API key to Vercel environment variables as REACT_APP_AFTERSHIP_API_KEY

const AFTERSHIP_KEY = process.env.REACT_APP_AFTERSHIP_API_KEY

export const OCEAN_CARRIERS = [
  { slug: 'maersk', name: 'Maersk' },
  { slug: 'msc', name: 'MSC' },
  { slug: 'cosco', name: 'COSCO' },
  { slug: 'cma-cgm', name: 'CMA CGM' },
  { slug: 'evergreen-line', name: 'Evergreen' },
  { slug: 'hapag-lloyd', name: 'Hapag-Lloyd' },
  { slug: 'one-line', name: 'ONE (Ocean Network Express)' },
  { slug: 'yang-ming', name: 'Yang Ming' },
  { slug: 'zim', name: 'ZIM' },
  { slug: 'pil', name: 'PIL (Pacific Int\'l Lines)' },
  { slug: 'wan-hai', name: 'Wan Hai' },
  { slug: 'kmtc', name: 'KMTC' },
  { slug: 'flexport', name: 'Flexport' },
  { slug: 'ups', name: 'UPS' },
  { slug: 'fedex', name: 'FedEx' },
  { slug: 'dhl', name: 'DHL' },
  { slug: 'other', name: 'Other' },
]

export const TRACKING_STATUSES = {
  pending:          { label: 'Pending',           color: '#888',    bg: '#f5f5f5' },
  info_received:    { label: 'Info Received',      color: '#633806', bg: '#FAEEDA' },
  in_transit:       { label: 'In Transit',         color: '#0C447C', bg: '#E6F1FB' },
  out_for_delivery: { label: 'Out for Delivery',   color: '#27500A', bg: '#EAF3DE' },
  attempt_fail:     { label: 'Attempt Failed',     color: '#A32D2D', bg: '#FCEBEB' },
  delivered:        { label: 'Delivered',          color: '#27500A', bg: '#EAF3DE' },
  exception:        { label: 'Exception',          color: '#A32D2D', bg: '#FCEBEB' },
  expired:          { label: 'Expired',            color: '#888',    bg: '#f5f5f5' },
}

// Create a tracking entry in AfterShip
export async function createTracking(trackingNumber, carrierSlug) {
  if (!AFTERSHIP_KEY) return { error: 'No AfterShip API key configured' }
  if (!trackingNumber || !carrierSlug || carrierSlug === 'other') return { error: 'Missing tracking number or carrier' }

  try {
    const res = await fetch('https://api.aftership.com/v4/trackings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'aftership-api-key': AFTERSHIP_KEY,
      },
      body: JSON.stringify({
        tracking: {
          tracking_number: trackingNumber,
          slug: carrierSlug,
        }
      })
    })
    const data = await res.json()
    if (data.meta?.code === 200 || data.meta?.code === 4003) {
      // 4003 = already exists, that's fine
      return { success: true }
    }
    return { error: data.meta?.message || 'AfterShip error' }
  } catch (e) {
    return { error: e.message }
  }
}

// Get latest tracking info for a shipment
export async function getTracking(trackingNumber, carrierSlug) {
  if (!AFTERSHIP_KEY) return null
  if (!trackingNumber || !carrierSlug || carrierSlug === 'other') return null

  try {
    const res = await fetch(`https://api.aftership.com/v4/trackings/${carrierSlug}/${trackingNumber}`, {
      headers: { 'aftership-api-key': AFTERSHIP_KEY }
    })
    const data = await res.json()
    if (data.meta?.code !== 200) return null
    const t = data.data?.tracking
    return {
      status: t?.tag,
      statusLabel: TRACKING_STATUSES[t?.tag]?.label || t?.tag || 'Unknown',
      lastUpdate: t?.updated_at,
      lastLocation: t?.checkpoints?.[0]?.location || '',
      expectedDelivery: t?.expected_delivery,
      originCountry: t?.origin_country_iso3,
      destinationCountry: t?.destination_country_iso3,
      checkpoints: (t?.checkpoints || []).slice(0, 5).map(c => ({
        time: c.checkpoint_time,
        location: c.location,
        message: c.message,
      }))
    }
  } catch (e) {
    return null
  }
}

// Refresh tracking for all active POs — call this on page load or on a timer
export async function refreshAllTracking(pos, upsertPO) {
  if (!AFTERSHIP_KEY) return
  const active = pos.filter(p =>
    p.tracking_number && p.carrier_slug &&
    p.carrier_slug !== 'other' &&
    p.status !== 'Complete'
  )
  for (const po of active) {
    const info = await getTracking(po.tracking_number, po.carrier_slug)
    if (info) {
      const updates = { ...po, tracking_status: info.status, tracking_label: info.statusLabel, tracking_location: info.lastLocation }
      if (info.expectedDelivery && !po.eta) {
        updates.eta = info.expectedDelivery.split('T')[0]
      }
      await upsertPO(updates)
    }
  }
}
