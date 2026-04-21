import axios from 'axios'
import { ElMessage } from 'element-plus'

export function readStoreSnapshot() {
  try {
    const raw = localStorage.getItem('a10-pentest-vue-store')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function resolveBaseURL(snapshot = readStoreSnapshot()) {
  const forceSameOriginInDev =
    import.meta.env.DEV && String(import.meta.env.VITE_DEV_API_SAME_ORIGIN || 'true').toLowerCase() === 'true'
  if (forceSameOriginInDev) {
    return ''
  }

  const fallbackHost = window.location.hostname || '127.0.0.1'
  const defaultBaseURL = 'http://192.168.159.132:8001'

  const configuredBaseURL =
    snapshot.settings?.backendUrl ||
    snapshot.settings?.backendURL ||
    snapshot.settings?.apiBaseUrl ||
    import.meta.env.VITE_API_BASE_URL ||
    defaultBaseURL

  const normalized = String(configuredBaseURL).replace(/\/+$/, '')

  // 兼容历史配置：本地地址曾默认 8000，这里自动迁移到 8001。
  try {
    const url = new URL(normalized)
    const localHosts = new Set([fallbackHost, '127.0.0.1', 'localhost'])
    if (localHosts.has(url.hostname) && url.port === '8000') {
      url.port = '8001'
      return url.toString().replace(/\/+$/, '')
    }
  } catch {
    // ignore parse errors and keep original value
  }

  return normalized
}

export function buildAuthHeaders(snapshot = readStoreSnapshot()) {
  const headers = {
    'X-Frontend-Origin': window.location.origin
  }

  const token = snapshot.auth?.token
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

const client = axios.create({
  timeout: 200000,
  headers: {
    'Content-Type': 'application/json'
  }
})

client.interceptors.request.use((config) => {
  const snapshot = readStoreSnapshot()

  config.baseURL = resolveBaseURL(snapshot)
  config.withCredentials = false
  config.headers = {
    ...(config.headers || {}),
    ...buildAuthHeaders(snapshot)
  }

  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message ||
      (error.message === 'Network Error' ? '网络连接失败，请检查后端地址或服务状态' : error.message) ||
      '请求失败'

    ElMessage.error(message)
    return Promise.reject(error)
  }
)

export default client
