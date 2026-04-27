export const SG_PRODUCTS = ['Non-Woven', 'Woven', 'Weed Barrier']
export const RT_PRODUCTS = ['Fishing Line', 'Rod Socks', 'Jigs/Hooks', 'Storage', 'Apparel', 'Wacky Rings']

export const PROD_STYLES = {
  'Non-Woven':   { bg: '#EAF3DE', fc: '#27500A' },
  'Woven':       { bg: '#E6F1FB', fc: '#0C447C' },
  'Weed Barrier':{ bg: '#FAECE7', fc: '#712B13' },
}

export const SUPP_COLORS = {
  'Dongyang Shanye Fishing': { bg: '#E6F1FB', fc: '#0C447C', b: '#85B7EB' },
  'I-Lure':                  { bg: '#EAF3DE', fc: '#27500A', b: '#97C459' },
  'Sourcepro':               { bg: '#FAEEDA', fc: '#633806', b: '#EF9F27' },
  'WEIGHT CO':               { bg: '#EEEDFE', fc: '#3C3489', b: '#AFA9EC' },
  'JXL':                     { bg: '#FAECE7', fc: '#712B13', b: '#F0997B' },
  'Weihai Huayue Sports':    { bg: '#E1F5EE', fc: '#085041', b: '#5DCAA5' },
  'XINGTAI XIOU IMPORT':     { bg: '#F1EFE8', fc: '#444441', b: '#B4B2A9' },
  'CNBM INTERNATIONAL':      { bg: '#EAF3DE', fc: '#27500A', b: '#97C459' },
}

export const SGS_COLORS = {
  'Non-Woven':   { bg: '#EAF3DE', fc: '#27500A', b: '#639922' },
  'Weed Barrier':{ bg: '#FAECE7', fc: '#712B13', b: '#D85A30' },
  'Woven':       { bg: '#E6F1FB', fc: '#0C447C', b: '#378ADD' },
}

export const SUPP_DESTS = {
  'Dongyang Shanye Fishing': ['AWD', 'BB'],
  'I-Lure':                  ['AWD', 'BB'],
  'Sourcepro':               ['AWD', 'BB'],
  'WEIGHT CO':               ['BB'],
  'JXL':                     ['AWD'],
  'Weihai Huayue Sports':    ['BB'],
  'XINGTAI XIOU IMPORT':     ['BB'],
}

export const RT_SUPPLIERS = [
  'Dongyang Shanye Fishing','I-Lure','Sourcepro',
  'WEIGHT CO','JXL','Weihai Huayue Sports','XINGTAI XIOU IMPORT'
]

// "Today" — always live. Normalized to local midnight so daysUntil() returns
// whole-day counts (no fractional rounding caused by the current time of day).
// Computed at module load for things like calendar month-highlighting; the
// daysUntil function below uses a fresh today() on every call so the
// "in Nd" countdown stays accurate even if the app stays open across midnight.
function todayMidnight() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

export const TODAY = todayMidnight()

// Number of whole days from today to the given ETA. Negative = overdue.
// Always recomputes "today" so the countdown advances with the calendar
// without needing a page reload.
export function daysUntil(eta) {
  if (!eta) return null
  const raw = typeof eta === 'string' ? new Date(eta) : eta
  if (isNaN(raw)) return null
  // Normalize the eta to midnight too — otherwise a Date built from a
  // date-only ISO string ("2026-06-08") gets parsed as UTC midnight, which
  // can land on the previous local day after timezone conversion. Pulling
  // year/month/day out of the parsed Date and re-anchoring at local midnight
  // avoids that off-by-one.
  let etaMid
  if (typeof eta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(eta)) {
    const [y, m, d] = eta.split('-').map(Number)
    etaMid = new Date(y, m - 1, d)
  } else {
    etaMid = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate())
  }
  const today = todayMidnight()
  return Math.round((etaMid - today) / 86400000)
}

export function arrivalColor(days) {
  if (days === null) return { bg: '#f5f5f5', fc: '#888', border: '#ddd' }
  if (days < 0)   return { bg: '#FCEBEB', fc: '#A32D2D', border: '#F09595' }
  if (days <= 30) return { bg: '#EAF3DE', fc: '#27500A', border: '#639922' }
  if (days <= 60) return { bg: '#FAEEDA', fc: '#633806', border: '#BA7517' }
  return             { bg: '#E6F1FB', fc: '#0C447C', border: '#378ADD' }
}

export function fmtDate(d) {
  if (!d) return 'TBD'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt)) return 'TBD'
  return `${dt.getMonth()+1}/${dt.getDate()}/${dt.getFullYear()}`
}

export function fmtMoney(v) {
  if (v == null || isNaN(v)) return ''
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function projectedOrders(lastOrderDate, freqDays, months) {
  if (!lastOrderDate || !freqDays) return {}
  const result = {}
  months.forEach(m => { result[m.getTime()] = [] })
  const cutoff = new Date(months[months.length - 1])
  cutoff.setDate(cutoff.getDate() + 40)
  let cur = new Date(lastOrderDate)
  cur.setDate(cur.getDate() + freqDays)
  while (cur <= cutoff) {
    months.forEach(m => {
      const end = new Date(m.getFullYear(), m.getMonth() + 1, 0)
      if (cur >= m && cur <= end) {
        result[m.getTime()].push(new Date(cur))
      }
    })
    cur = new Date(cur)
    cur.setDate(cur.getDate() + freqDays)
  }
  return result
}

export function buildMonths(startDate) {
  const months = []
  for (let i = 0; i < 12; i++) {
    const m = startDate.getMonth() + i
    const y = startDate.getFullYear() + Math.floor(m / 12)
    months.push(new Date(y, m % 12, 1))
  }
  return months
}

export function shortMonth(d) {
  return d.toLocaleString('en-US', { month: 'short' }) + "'" + String(d.getFullYear()).slice(2)
}
