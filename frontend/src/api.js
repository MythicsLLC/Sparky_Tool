import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
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
export const listAdminStats = (token)           => client.get('/v2/admin/stats',  { headers: auth(token) })
export const listAdminUsers = (token, params={})=> client.get('/v2/admin/users',  { headers: auth(token), params })
export const listAdminRuns  = (token, params={})=> client.get('/v2/admin/runs',   { headers: auth(token), params })
export const listAdminLogs  = (token, params={})=> client.get('/v2/admin/logs',   { headers: auth(token), params })
export const setUserRole    = (id, role, token) => client.put(`/v2/admin/users/${id}/role`, { role }, { headers: auth(token) })

// v1 endpoints (no auth required)
export const runEngine      = ()     => client.post('/run')
export const getResults     = ()     => client.get('/results')
export const getSettings    = ()     => client.get('/settings')
export const saveSettings   = (data) => client.post('/settings', data)
export const testRetrieval  = (data) => client.post('/test-retrieval', data)
export const testPeoplesoft = (data) => client.post('/test-peoplesoft', data)
