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

// Normalise Pydantic v2 validation-error arrays to a plain string so every
// component can safely render `err.response.data.detail` as a React child.
// Pydantic v2 returns: detail: [{type, loc, msg, input}, ...]
client.interceptors.response.use(
  (res) => res,
  (err) => {
    const detail = err?.response?.data?.detail
    if (Array.isArray(detail)) {
      err.response.data.detail = detail
        .map((e) => {
          const loc = Array.isArray(e.loc) ? e.loc.slice(1).join('.') : ''
          return loc ? `${loc}: ${e.msg}` : e.msg
        })
        .join('; ')
    }
    return Promise.reject(err)
  }
)

/**
 * Convert any axios error to a human-readable string.
 * Handles: Pydantic v2 arrays (already normalised above), plain strings,
 * 503 cold-start, network errors, and unknown shapes.
 */
export function formatApiError(err, fallback = 'An unexpected error occurred.') {
  if (!err) return fallback
  const status = err?.response?.status
  const detail = err?.response?.data?.detail

  if (status === 401) return 'Your session has expired. Please reload the page to sign in again.'
  if (status === 503) return 'The server is temporarily unavailable — it may be starting up. Please try again in a moment.'
  if (status === 504) return 'The request timed out. For large or multi-sheet files, try again or switch to a faster model.'
  if (status === 502) {
    if (!detail) return 'The AI provider returned an error. Try again or switch models in Admin → AI Models.'
    if (/timed out/i.test(detail))   return detail
    if (/quota|rate limit/i.test(detail)) return detail
    if (/api key|invalid key/i.test(detail)) return detail
    if (/model.*(not found|id)/i.test(detail)) return detail
    if (/cannot reach/i.test(detail)) return detail
    return detail
  }
  if (typeof detail === 'string' && detail) return detail
  if (err.message === 'Network Error' || err.code === 'ERR_NETWORK')
    return 'Cannot reach the server. Check your connection or try again shortly.'
  return err?.message || fallback
}

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
export const getConfigSecrets = (id)                   => client.get(`/v2/configs/${id}/secrets`)

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

// Windows Server (WinRM)
export const testWindows   = (data) => client.post('/test-windows', data)
export const winBrowse     = (data) => client.post('/win-browse', data)
export const winReadFile   = (data) => client.post('/win-read-file', data)

// FTP / FTPS
export const testFtp       = (data) => client.post('/test-ftp', data)
export const ftpBrowse     = (data) => client.post('/ftp-browse', data)
export const ftpReadFile   = (data) => client.post('/ftp-read-file', data)

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

// Shared SSE consumer for streaming AI analysis endpoints.
// The backend sends {"status":"processing"} pings every 5 s while the AI model
// is working, then emits the final result JSON as a single data line, followed
// by the sentinel [DONE].  This keeps any proxy/load-balancer from closing the
// otherwise-idle connection before the model finishes.
async function _consumeSse(response) {
  if (!response.ok) {
    let body
    try { body = await response.json() } catch { body = { detail: response.statusText } }
    const err = Object.assign(new Error(body.detail || 'Request failed'), {
      response: { data: body, status: response.status },
    })
    throw err
  }
  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6)
      if (raw === '[DONE]') return
      const msg = JSON.parse(raw)
      if (msg.status === 'processing') continue
      if (msg.error) {
        const err = Object.assign(new Error(msg.error), {
          response: { data: { detail: msg.error }, status: msg.status_code ?? 502 },
        })
        throw err
      }
      return { data: msg }  // same shape as an axios response — callers need no changes
    }
  }
}

/**
 * Open a WebSocket to /api/v2/insights/ws/analyze, upload the file as base64,
 * and call callbacks as the AI streams its response.
 *
 * Callbacks: { onStatus(msg), onChunk(text), onResult(data), onError(err) }
 * Returns { close() } so the caller can abort.
 */
export function analyzeFileWs(file, aiModelId, { onStatus, onChunk, onResult, onError } = {}) {
  let ws = null
  let closed = false
  const ctrl = { close: () => { closed = true; ws?.close(1000) } }

  ;(async () => {
    try {
      const token    = _getToken ? await _getToken().catch(() => null) : null
      const httpBase = _origin || (typeof window !== 'undefined' ? window.location.origin : '')
      const wsBase   = httpBase.replace(/^http/, 'ws')

      ws = new WebSocket(`${wsBase}/api/v2/insights/ws/analyze`)

      ws.onopen = async () => {
        // Frame 1: send auth token in message body (never in URL — avoids server-log exposure)
        ws.send(JSON.stringify({ token: token || '' }))

        // Frame 2: send file as base64 via FileReader
        const b64 = await new Promise((res, rej) => {
          const reader = new FileReader()
          reader.onload  = () => res(reader.result.split(',')[1])
          reader.onerror = rej
          reader.readAsDataURL(file)
        })
        ws.send(JSON.stringify({ filename: file.name, data: b64, ai_model_id: aiModelId ?? null }))
      }

      ws.onmessage = ({ data: raw }) => {
        try {
          const msg = JSON.parse(raw)
          if (msg.type === 'ping')   return
          if (msg.type === 'status') { onStatus?.(msg.message); return }
          if (msg.type === 'chunk')  { onChunk?.(msg.text);     return }
          if (msg.type === 'result') {
            onResult?.(msg.data)
            if (!closed) { closed = true; ws.close(1000) }
            return
          }
          if (msg.type === 'error') {
            const err = Object.assign(new Error(msg.message), {
              response: { data: { detail: msg.message }, status: msg.status_code ?? 502 },
            })
            onError?.(err)
            if (!closed) { closed = true; ws.close(1000) }
          }
        } catch (e) { onError?.(e) }
      }

      ws.onerror = () => {
        if (!closed) onError?.(new Error('WebSocket connection error — the server may be starting up'))
      }

      ws.onclose = ({ code }) => {
        if (!closed && code !== 1000 && code !== 1001) {
          onError?.(new Error(`Connection closed unexpectedly (code ${code})`))
        }
      }
    } catch (err) { onError?.(err) }
  })()

  return ctrl
}

export async function analyzeFile(file, aiModelId) {
  const form  = new FormData()
  form.append('file', file)
  const qs    = aiModelId != null ? `?ai_model_id=${encodeURIComponent(aiModelId)}` : ''
  const base  = _origin ? `${_origin}/api` : '/api'
  const token = _getToken ? await _getToken().catch(() => null) : null
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5 * 60 * 1000)
  try {
    const response = await fetch(`${base}/v2/insights/analyze-file${qs}`, {
      method:  'POST',
      body:    form,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal:  ctrl.signal,
    })
    return await _consumeSse(response)
  } finally {
    clearTimeout(timer)
  }
}

// Analysis review + prompt reference library (v2)
export const submitAnalysisReview  = (resultId, status, comment, token) =>
  client.post(`/v2/insights/results/${resultId}/review`, { status, comment }, { headers: auth(token) })

export const listPromptReferences  = (token, params = {}) =>
  client.get('/v2/insights/references', { headers: auth(token), params })

export const deletePromptReference = (refId, token) =>
  client.delete(`/v2/insights/references/${refId}`, { headers: auth(token) })

// Run Outputs (v2)
export const listRunOutputs        = (token, params = {})  => client.get('/v2/run-outputs/',                        { headers: auth(token), params })
export const deleteRunOutput       = (id, token)            => client.delete(`/v2/run-outputs/${id}`,                { headers: auth(token) })
export const reconstructRunOutput  = (id, token)            => client.get(`/v2/run-outputs/${id}/reconstruct`,       { headers: auth(token) })

// Analysis Results (v2)
export const listAnalysisResults = (token, params = {}) => client.get('/v2/analysis-results/',        { headers: auth(token), params })
export const getAnalysisResult   = (id, token)          => client.get(`/v2/analysis-results/${id}`,   { headers: auth(token) })
export async function analyzeRunOutput(id, aiModelId, token) {
  const qs   = aiModelId != null ? `?ai_model_id=${encodeURIComponent(aiModelId)}` : ''
  const base = _origin ? `${_origin}/api` : '/api'
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5 * 60 * 1000)
  try {
    const response = await fetch(`${base}/v2/run-outputs/${id}/analyze${qs}`, {
      method:  'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal:  ctrl.signal,
    })
    return await _consumeSse(response)
  } finally {
    clearTimeout(timer)
  }
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

// Vercel — proxied through the backend so the token never ships in the JS bundle.
// Server env var: VERCEL_TOKEN (replaces the old client-side VITE_VERCEL_TOKEN).
export async function fetchVercelStats(token) {
  const { data } = await client.get('/v2/admin/vercel/stats', { headers: auth(token) })
  const { projects: projectsData, deployments: deploymentsRaw } = data

  const deployments = deploymentsRaw.map(d => ({
    uid:        d.uid,
    name:       d.name,
    url:        d.url,
    state:      d.state,
    target:     d.target,
    created_at: d.createdAt,
    ready_at:   d.ready,
    meta: {
      branch:  d.meta?.githubCommitRef   || d.meta?.gitlabCommitRef   || '',
      message: d.meta?.githubCommitMessage || d.meta?.gitlabCommitMessage || '',
      author:  d.meta?.githubCommitAuthorName || '',
    },
    build_ms: (d.ready && d.buildingAt) ? d.ready - d.buildingAt : null,
  }))

  const projects = projectsData.map(p => ({
    id:         p.id,
    name:       p.name,
    framework:  p.framework,
    node_ver:   p.nodeVersion,
    updated_at: p.updatedAt,
    link: {
      type: p.link?.type || '',
      repo: p.link?.repo || p.link?.projectUrl || '',
    },
  }))

  const buildTimes = deployments.filter(d => d.build_ms && d.build_ms > 0).map(d => d.build_ms)
  const avg_build_s = buildTimes.length
    ? Math.round(buildTimes.reduce((a, b) => a + b, 0) / buildTimes.length / 100) / 10
    : null

  return {
    projects,
    deployments,
    summary: {
      total_deployments: deployments.length,
      prod_success:      deployments.filter(d => d.state === 'READY' && d.target === 'production').length,
      prod_error:        deployments.filter(d => d.state === 'ERROR' && d.target === 'production').length,
      in_progress:       deployments.filter(d => ['BUILDING', 'QUEUED'].includes(d.state)).length,
      avg_build_s,
    },
  }
}

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

// Scheduled Runs (v2)
export const listSchedules    = (token)                  => client.get('/v2/schedules/',                  { headers: auth(token) })
export const createSchedule   = (payload, token)         => client.post('/v2/schedules/',       payload,  { headers: auth(token) })
export const updateSchedule   = (id, payload, token)     => client.patch(`/v2/schedules/${id}`, payload,  { headers: auth(token) })
export const deleteSchedule   = (id, token)              => client.delete(`/v2/schedules/${id}`,          { headers: auth(token) })

// Notifications (v2)
export const getNotificationSettings    = (token)          => client.get('/v2/notifications/settings',        { headers: auth(token) })
export const updateNotificationSettings = (payload, token) => client.put('/v2/notifications/settings', payload, { headers: auth(token) })

// Data Quality (v2)
export const listDqRules    = (token, configId)          => client.get('/v2/data-quality/rules',            { headers: auth(token), params: configId ? { config_id: configId } : {} })
export const createDqRule   = (payload, token)           => client.post('/v2/data-quality/rules',  payload, { headers: auth(token) })
export const updateDqRule   = (id, payload, token)       => client.patch(`/v2/data-quality/rules/${id}`, payload, { headers: auth(token) })
export const deleteDqRule   = (id, token)                => client.delete(`/v2/data-quality/rules/${id}`,   { headers: auth(token) })
export const listDqResults  = (token, params = {})       => client.get('/v2/data-quality/results',          { headers: auth(token), params })

// Run Diff (v2)
export const diffRunOutputs = (aId, bId, keyColumn, token) =>
  client.get('/v2/run-outputs/diff', { headers: auth(token), params: { a: aId, b: bId, ...(keyColumn ? { key_column: keyColumn } : {}) } })

// Company (v2)
export const getCompanyInfo = (domain) => client.get(`/v2/company/info?domain=${encodeURIComponent(domain)}`)
