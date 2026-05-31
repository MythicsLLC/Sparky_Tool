import axios from 'axios'

// VITE_API_URL is the backend origin (no trailing slash, no /api).
//   Local dev  → leave empty; the Vite dev-server proxy rewrites /api → BACKEND_URL
//   Vercel     → set to your Render URL, e.g. https://sparky-tool.onrender.com
const _origin = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

const client = axios.create({
  baseURL: _origin ? `${_origin}/api` : '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Called once from AuthContext when Clerk's getToken() is available.
// The interceptor then silently refreshes the JWT before every request,
// so components never need to worry about token expiry.
let _getToken = null
export function setTokenGetter(fn) {
  _getToken = fn
}

client.interceptors.request.use(async (config) => {
  if (_getToken) {
    try {
      const token = await _getToken()
      if (token) config.headers.Authorization = `Bearer ${token}`
    } catch {
      // If Clerk can't produce a token, proceed unauthenticated — backend returns 401.
    }
  }
  return config
})

const auth = (token) => (token ? { Authorization: `Bearer ${token}` } : {})

// Health
export const checkHealth = () => client.get('/health')

// Current user (v2)
export const getMe     = (token)          => client.get('/v2/users/me',   { headers: auth(token) })
export const patchMe   = (payload, token) => client.patch('/v2/users/me', payload, { headers: auth(token) })

// Configs (v2) — trailing slash avoids FastAPI 307 redirect that strips auth header
export const listConfigs   = (token)                    => client.get('/v2/configs/',          { headers: auth(token) })
export const createConfig  = (payload, token)           => client.post('/v2/configs/',         payload, { headers: auth(token) })
export const getConfig     = (id, token)                => client.get(`/v2/configs/${id}`,     { headers: auth(token) })
export const updateConfig  = (id, payload, token)       => client.put(`/v2/configs/${id}`,     payload, { headers: auth(token) })
export const deleteConfig  = (id, token)                => client.delete(`/v2/configs/${id}`,  { headers: auth(token) })

// Runs (v2)
export const runConfig  = (configId, token)             => client.post(`/v2/run/${configId}`,  null, { headers: auth(token) })
export const listRuns   = (token, params = {})          => client.get('/v2/runs/',             { headers: auth(token), params })
export const getRun     = (id, token)                   => client.get(`/v2/runs/${id}`,        { headers: auth(token) })

// Admin (v2)
export const listAdminStats  = (token)                    => client.get('/v2/admin/stats',              { headers: auth(token) })
export const listAdminUsers  = (token, params={})          => client.get('/v2/admin/users',              { headers: auth(token), params })
export const listAdminRuns   = (token, params={})          => client.get('/v2/admin/runs',               { headers: auth(token), params })
export const listAdminLogs   = (token, params={})          => client.get('/v2/admin/logs',               { headers: auth(token), params })
export const inviteAdminUser = (payload, token)            => client.post('/v2/admin/users/invite',        payload,  { headers: auth(token) })
export const setUserRole     = (id, role, token)           => client.put(`/v2/admin/users/${id}/role`,   { role }, { headers: auth(token) })
export const updateAdminUser = (id, payload, token)        => client.patch(`/v2/admin/users/${id}`,      payload,  { headers: auth(token) })
export const deleteAdminUser = (id, params, token)         => client.delete(`/v2/admin/users/${id}`,     { headers: auth(token), params })

// v1 endpoints (no auth required)
export const runEngine      = ()     => client.post('/run')
export const getResults     = ()     => client.get('/results')
export const getSettings    = ()     => client.get('/settings')
export const saveSettings   = (data) => client.post('/settings', data)
export const testRetrieval  = (data) => client.post('/test-retrieval', data)
export const testPeoplesoft = (data) => client.post('/test-peoplesoft', data)

// VPN tunnel
export const testVpn       = (data) => client.post('/test-vpn', data)

// Windows Server (WinRM)
export const testWindows   = (data) => client.post('/test-windows', data)
export const winBrowse     = (data) => client.post('/win-browse', data)
export const winReadFile   = (data) => client.post('/win-read-file', data)

// Insights (v2)
export const getCoreHRFiles    = (token)           => client.get('/v2/insights/corehr/files', { headers: auth(token) })
export const getCoreHRFile     = (filename, token) => client.get('/v2/insights/corehr/file',  { headers: auth(token), params: { filename } })
export const checkConnectivity = (token)           => client.get('/v2/insights/health',       { headers: auth(token) })

// File analysis (v2)
export const listInsightModels = () => client.get('/v2/insights/ai-models')

export async function downloadAnalysisPdf(payload) {
  const { data } = await client.post('/v2/insights/generate-pdf', payload, { responseType: 'blob' })
  return data
}

export async function downloadRunPdf(payload) {
  const { data } = await client.post('/v2/insights/generate-run-pdf', payload, { responseType: 'blob' })
  return data
}

export async function downloadFunctionalPdf(payload) {
  const { data } = await client.post('/v2/insights/generate-functional-pdf', payload, { responseType: 'blob' })
  return data
}

export async function downloadOperationalPdf(payload) {
  const { data } = await client.post('/v2/insights/generate-operational-pdf', payload, { responseType: 'blob' })
  return data
}

export const analyzeFile = (file, aiModelId) => {
  const form = new FormData()
  form.append('file', file)
  const params = aiModelId != null ? { ai_model_id: aiModelId } : {}
  return client.post('/v2/insights/analyze-file', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    params,
  })
}

// AI Models admin (v2)
export const listAiModels      = (token)                => client.get('/v2/admin/ai-models',                    { headers: auth(token) })
export const createAiModel     = (payload, token)       => client.post('/v2/admin/ai-models',         payload,  { headers: auth(token) })
export const updateAiModel     = (id, payload, token)   => client.put(`/v2/admin/ai-models/${id}`,    payload,  { headers: auth(token) })
export const deleteAiModel     = (id, token)            => client.delete(`/v2/admin/ai-models/${id}`,           { headers: auth(token) })
export const setDefaultAiModel = (id, token)            => client.post(`/v2/admin/ai-models/${id}/set-default`, null, { headers: auth(token) })

// Wide Events admin (v2)
export const listWideEvents     = (token, params = {})  => client.get('/v2/admin/events',  { headers: auth(token), params })
export const listWideEventViews = (token)               => client.get('/v2/admin/events/views', { headers: auth(token) })
export const createWideEventView = (payload, token)     => client.post('/v2/admin/events/views', payload, { headers: auth(token) })
export const updateWideEventView = (id, payload, token) => client.put(`/v2/admin/events/views/${id}`, payload, { headers: auth(token) })
export const deleteWideEventView = (id, token)          => client.delete(`/v2/admin/events/views/${id}`, { headers: auth(token) })

/**
 * Open a wide-event SSE stream using fetch() so the token travels in the
 * Authorization header — never in the URL (no logs, no history leakage).
 *
 * @param {string}   token    - Bearer token
 * @param {object}   params   - Optional query filters (event, status, tier)
 * @param {object}   handlers - { onEvent, onReady, onHeartbeat, onError }
 * @returns {{ close: () => void }}
 */
export function openWideEventStream(token, params = {}, handlers = {}) {
  const qs   = new URLSearchParams(params).toString()
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
  const url  = `${base}/api/v2/admin/events/stream${qs ? '?' + qs : ''}`

  const controller = new AbortController()

  ;(async () => {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        handlers.onError?.(new Error(`HTTP ${response.status}`))
        return
      }

      const reader  = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer       = ''
      let currentEvent = 'message'

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() // retain incomplete trailing line

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            const raw = line.slice(5).trim()
            try {
              const data = JSON.parse(raw)
              if (currentEvent === 'event')      handlers.onEvent?.(data)
              else if (currentEvent === 'ready') handlers.onReady?.(data)
              else if (currentEvent === 'heartbeat') handlers.onHeartbeat?.(data)
            } catch {
              // non-JSON data line — ignore
            }
            currentEvent = 'message'
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') handlers.onError?.(err)
    }
  })()

  return { close: () => controller.abort() }
}

// User Preferences (v2)
export const getPreferences    = (token)          => client.get('/v2/preferences',  { headers: auth(token) })
export const updatePreferences = (payload, token) => client.put('/v2/preferences', payload, { headers: auth(token) })

// Engines (v2)
export const listEngines       = (token)                => client.get('/v2/engines',                        { headers: auth(token) })
export const listAdminEngines  = (token)                => client.get('/v2/admin/engines',                  { headers: auth(token) })
export const createEngine      = (payload, token)       => client.post('/v2/admin/engines',        payload, { headers: auth(token) })
export const updateEngine      = (id, payload, token)   => client.put(`/v2/admin/engines/${id}`,   payload, { headers: auth(token) })
export const deleteEngine      = (id, token)            => client.delete(`/v2/admin/engines/${id}`,          { headers: auth(token) })

// Feature Flags (v2)
export const listFeatureFlags       = (token)            => client.get('/v2/feature-flags',                     { headers: auth(token) })
export const listAdminFeatureFlags  = (token)            => client.get('/v2/admin/feature-flags',               { headers: auth(token) })
export const createFeatureFlag      = (payload, token)   => client.post('/v2/admin/feature-flags',    payload,  { headers: auth(token) })
export const updateFeatureFlag      = (id, payload, token) => client.patch(`/v2/admin/feature-flags/${id}`, payload, { headers: auth(token) })
export const toggleFeatureFlag      = (id, token)        => client.post(`/v2/admin/feature-flags/${id}/toggle`, null, { headers: auth(token) })
export const deleteFeatureFlag      = (id, token)        => client.delete(`/v2/admin/feature-flags/${id}`,     { headers: auth(token) })

// AI Conversations (v2)
export const listConversations  = (token, params = {}) => client.get('/v2/conversations',             { headers: auth(token), params })
export const getConversation    = (id, token)          => client.get(`/v2/conversations/${id}`,       { headers: auth(token) })
export const deleteConversation = (id, token)          => client.delete(`/v2/conversations/${id}`,    { headers: auth(token) })
export const adminConvStats     = (token)              => client.get('/v2/conversations/admin/stats', { headers: auth(token) })
export const adminListConvs     = (token, params = {}) => client.get('/v2/conversations/admin/all',   { headers: auth(token), params })
