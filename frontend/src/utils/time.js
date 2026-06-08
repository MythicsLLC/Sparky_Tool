/**
 * Returns a human-readable relative time string (e.g. "3m ago", "2h ago").
 * @param {string|number|Date|null} ts - Any value accepted by new Date()
 * @returns {string}
 */
export function timeAgo(ts) {
  if (!ts) return '—'
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
