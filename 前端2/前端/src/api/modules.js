import client, { buildAuthHeaders, resolveBaseURL } from './client'

export const authApi = {
  login(payload) {
    return client.post('/api/auth/login', payload)
  },
  register(payload) {
    return client.post('/api/auth/register', payload)
  }
}

export const settingsApi = {
  fetch() {
    return client.get('/api/settings')
  },
  save(payload) {
    return client.put('/api/settings', payload)
  }
}

export const taskApi = {
  list() {
    return client.get('/api/tasks')
  },
  create(payload) {
    return client.post('/api/tasks', payload)
  },
  update(id, payload) {
    return client.put(`/api/tasks/${id}`, payload)
  },
  pause(id) {
    return client.post(`/api/tasks/${id}/pause`)
  },
  resume(id) {
    return client.post(`/api/tasks/${id}/resume`)
  },
  terminate(id) {
    return client.post(`/api/tasks/${id}/terminate`)
  },
  rerun(id) {
    return client.post(`/api/tasks/${id}/rerun`)
  },
  remove(id) {
    return client.delete(`/api/tasks/${id}`)
  },
  logs(id) {
    return client.get(`/api/tasks/${id}/logs`)
  }
}

export const toolApi = {
  list() {
    return client.get('/api/tools')
  },
  update(id, payload) {
    return client.put(`/api/tools/${id}`, payload)
  },
  test(id, payload) {
    return client.post(`/api/tools/${id}/test`, payload)
  }
}

export const reportApi = {
  create(payload) {
    return client.post('/api/reports', payload)
  },
  list() {
    return client.get('/api/reports')
  },
  getById(id) {
    return client.get(`/api/reports/${id}`)
  },
  exportFile(id, format) {
    return client.get(`/api/reports/${id}/export?format=${format}`, {
      responseType: 'blob'
    })
  }
}

export const healthApi = {
  check() {
    return client.get('/api/health')
  }
}

export const chatApi = {
  stream(taskId, payload) {
    const snapshot = JSON.parse(localStorage.getItem('a10-pentest-vue-store') || '{}')
    const headers = {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(snapshot)
    }

    return fetch(`${resolveBaseURL(snapshot)}/api/tasks/${taskId}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
  }
}
