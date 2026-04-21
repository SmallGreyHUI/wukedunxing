import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { jsPDF } from 'jspdf'
import { authApi, reportApi, settingsApi, taskApi, toolApi } from '@/api/modules'
import { buildLocalReport, createDemoState } from '@/utils/mock'
import { normalizeLogs, normalizeTask, normalizeTaskList } from '@/utils/tasks'

const STORAGE_KEY = 'a10-pentest-vue-store'
const OFFLINE_TEST_ACCOUNT = {
  username: 'admin',
  password: 'test'
}

function isNetworkError(error) {
  return !error?.response && ['Network Error', 'ECONNREFUSED'].includes(error?.message)
}

function matchesOfflineTestAccount(payload) {
  return (
    String(payload?.username || '').trim().toLowerCase() === OFFLINE_TEST_ACCOUNT.username &&
    String(payload?.password || '') === OFFLINE_TEST_ACCOUNT.password
  )
}

function createOfflineTestUser() {
  return {
    id: 'offline-admin',
    username: OFFLINE_TEST_ACCOUNT.username,
    role: 'test',
    useBuiltinApi: true
  }
}

function mergeTaskMessages(localMessages, remoteMessages) {
  const local = Array.isArray(localMessages) ? localMessages : []
  const remote = Array.isArray(remoteMessages) ? remoteMessages : []

  // Keep remote order as baseline (usually canonical persisted order),
  // then merge/append local-only messages to avoid losing in-progress chat.
  const merged = []
  const indexById = new Map()

  const upsert = (msg) => {
    if (!msg || typeof msg !== 'object') return
    const id = String(msg.id || '')
    if (!id) {
      merged.push(msg)
      return
    }

    const existingIndex = indexById.get(id)
    if (existingIndex === undefined) {
      indexById.set(id, merged.length)
      merged.push(msg)
      return
    }

    const existing = merged[existingIndex] || {}
    const existingContentLen = String(existing.content || '').length
    const nextContentLen = String(msg.content || '').length

    // Prefer message variant with richer content while preserving latest metadata.
    merged[existingIndex] = {
      ...existing,
      ...msg,
      content: nextContentLen >= existingContentLen ? msg.content : existing.content
    }
  }

  remote.forEach(upsert)
  local.forEach(upsert)

  return merged
}

export const useAppStore = defineStore('app', () => {
  const initialized = ref(false)
  const auth = ref({ user: null, token: '', initialized: false })
  const settings = ref({
    provider: '',
    model: '',
    apiBaseUrl: '',
    apiKey: '',
    backendUrl: '',
    mcpEndpoint: '',
    knowledgeBasePath: '',
    targetHosts: [],
    apiKeyConfigured: false
  })
  const tasks = ref([])
  const tools = ref([])
  const reports = ref([])
  const modules = ref([])
  const selectedTaskId = ref('')
  const openTaskIds = ref([])
  const deletedTaskIds = ref([])
  const tasksSyncAt = ref('')
  const tasksSyncState = ref('idle')

  const currentUser = computed(() => auth.value.user)
  const isAuthenticated = computed(() => Boolean(auth.value.user))
  const selectedTask = computed(() => tasks.value.find((item) => item.id === selectedTaskId.value) || null)

  function syncOpenTaskIds(fallbackTaskId = '') {
    const existingIds = new Set(tasks.value.map((item) => item.id))
    openTaskIds.value = Array.from(new Set(openTaskIds.value.filter((taskId) => existingIds.has(taskId))))

    if (fallbackTaskId && existingIds.has(fallbackTaskId) && !openTaskIds.value.includes(fallbackTaskId)) {
      openTaskIds.value.push(fallbackTaskId)
    }

    if (!openTaskIds.value.length && tasks.value.length) {
      openTaskIds.value = [tasks.value[0].id]
    }

    if (!selectedTaskId.value || !existingIds.has(selectedTaskId.value)) {
      selectedTaskId.value = openTaskIds.value[0] || tasks.value[0]?.id || ''
    }
  }

  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        auth: auth.value,
        settings: settings.value,
        tasks: tasks.value,
        tools: tools.value,
        reports: reports.value,
        modules: modules.value,
        selectedTaskId: selectedTaskId.value,
        openTaskIds: openTaskIds.value,
        deletedTaskIds: deletedTaskIds.value
      })
    )
  }

  function initialize() {
    const raw = localStorage.getItem(STORAGE_KEY)
    const demo = createDemoState()
    if (raw) {
      const parsed = JSON.parse(raw)
      auth.value = parsed.auth || demo.auth
      settings.value = { ...demo.settings, ...(parsed.settings || {}) }
      tasks.value = normalizeTaskList(Array.isArray(parsed.tasks) ? parsed.tasks : [])
      tools.value = parsed.tools?.length ? parsed.tools : demo.tools
      reports.value = parsed.reports || []
      modules.value = parsed.modules?.length ? parsed.modules : demo.modules
      openTaskIds.value = Array.isArray(parsed.openTaskIds) ? parsed.openTaskIds : []
      deletedTaskIds.value = Array.isArray(parsed.deletedTaskIds) ? parsed.deletedTaskIds : []
      selectedTaskId.value = parsed.selectedTaskId || tasks.value[0]?.id || ''
      if (deletedTaskIds.value.length) {
        const hidden = new Set(deletedTaskIds.value)
        tasks.value = tasks.value.filter((task) => !hidden.has(task.id))
      }
      syncOpenTaskIds(selectedTaskId.value)
    } else {
      auth.value = { user: null, token: '', initialized: false }
      settings.value = demo.settings
      tasks.value = []
      tools.value = demo.tools
      reports.value = []
      modules.value = demo.modules
      openTaskIds.value = []
      deletedTaskIds.value = []
      selectedTaskId.value = ''
      persist()
    }
    initialized.value = true
  }

  async function login(payload) {
    try {
      const { data } = await authApi.login(payload)
      auth.value = {
        user: data.user,
        token: data.token,
        initialized: true
      }
      persist()
      return data.user
    } catch (error) {
      if (isNetworkError(error) && matchesOfflineTestAccount(payload)) {
        const user = createOfflineTestUser()
        auth.value = {
          user,
          token: 'offline-demo-token',
          initialized: true
        }
        persist()
        return user
      }

      throw error
    }
  }

  async function register(payload) {
    const { data } = await authApi.register(payload)
    ElMessage.success(data?.message || '注册成功，请登录')
    return data?.user
  }

  function logout() {
    auth.value = { user: null, token: '', initialized: true }
    persist()
  }

  async function loadTasks() {
    tasksSyncState.value = 'syncing'
    try {
      const { data } = await taskApi.list()
      if (Array.isArray(data)) {
        const hidden = new Set(deletedTaskIds.value)
        const localTaskMap = new Map(tasks.value.map((task) => [task.id, task]))
        const remoteTasks = normalizeTaskList(data)
        const merged = remoteTasks
          .filter((task) => !hidden.has(task.id))
          .map((task) => {
          const localTask = localTaskMap.get(task.id)
          if (!localTask) return task

          const localMessages = Array.isArray(localTask.messages) ? localTask.messages : []
          const remoteMessages = Array.isArray(task.messages) ? task.messages : []

          return {
            ...task,
            // Merge local+remote chat history by message id to avoid losing any side.
            messages: mergeTaskMessages(localMessages, remoteMessages),
            chatMode: localTask.chatMode || task.chatMode,
            llmModel: localTask.llmModel || task.llmModel
          }
        })

        // Keep local-only task history when backend list is empty/stale,
        // so logout/re-login and pause/resume sync do not wipe conversations.
        for (const localTask of tasks.value) {
          if (!localTask?.id || hidden.has(localTask.id)) continue
          const existsInRemote = remoteTasks.some((task) => task.id === localTask.id)
          if (!existsInRemote) {
            merged.push(normalizeTask(localTask))
          }
        }

        tasks.value = normalizeTaskList(merged)
      }
      tasksSyncAt.value = new Date().toISOString()
      tasksSyncState.value = 'ok'
      syncOpenTaskIds()
      persist()
    } catch {
      tasksSyncState.value = 'error'
      persist()
    }
  }

  async function loadTools() {
    try {
      const { data } = await toolApi.list()
      tools.value = Array.isArray(data) ? data : tools.value
      persist()
    } catch {
      persist()
    }
  }

  async function loadSettings() {
    try {
      const { data } = await settingsApi.fetch()
      settings.value = {
        ...settings.value,
        ...data
      }

      if (!settings.value.apiBaseUrl && settings.value.backendUrl) {
        settings.value.apiBaseUrl = settings.value.backendUrl
      }

      if (!settings.value.backendUrl && settings.value.apiBaseUrl) {
        settings.value.backendUrl = settings.value.apiBaseUrl
      }

      persist()
    } catch {
      persist()
    }
  }

  async function saveSettings(payload) {
    settings.value = {
      ...settings.value,
      ...payload
    }

    if (!settings.value.backendUrl && settings.value.apiBaseUrl) {
      settings.value.backendUrl = settings.value.apiBaseUrl
    }

    if (!settings.value.apiBaseUrl && settings.value.backendUrl) {
      settings.value.apiBaseUrl = settings.value.backendUrl
    }

    settings.value.apiKeyConfigured = Boolean(String(settings.value.apiKey || '').trim())

    try {
      await settingsApi.save(settings.value)
      ElMessage.success('模型设置已保存')
    } catch {
      ElMessage.warning('后端未响应，设置已保存在前端')
    }

    persist()
  }

  async function createTask(payload) {
    const enabledToolIds = tools.value.filter((tool) => tool.status).map((tool) => tool.id)

    const requestPayload = {
      target: payload.target,
      machineType: payload.machineType || 'Vulhub',
      scanDepth: payload.scanDepth || '标准',
      toolIds: payload.toolIds?.length ? payload.toolIds : enabledToolIds,
      llmModel: payload.llmModel || settings.value.model || 'zai/glm-4.7',
      chatMode: payload.chatMode || 'assist'
    }

    try {
      const { data } = await taskApi.create(requestPayload)
      const normalizedTask = normalizeTask(data)
      tasks.value.unshift(normalizedTask)
      tasks.value = normalizeTaskList(tasks.value)
      // 创建成功后立刻进入该对话
      if (!openTaskIds.value.includes(normalizedTask.id)) {
        openTaskIds.value.unshift(normalizedTask.id)
      }
      selectedTaskId.value = normalizedTask.id 
      persist()
      return normalizedTask
    } catch (error) {
      const enableOfflineDemo = String(import.meta.env.VITE_ENABLE_OFFLINE_DEMO || '').toLowerCase() === 'true'
      if (!enableOfflineDemo) {
        throw error
      }

      // 本地 Mock 降级演示模式（仅在显式开启时）
      const fallback = normalizeTask({
        id: `task-${Date.now()}`,
        target: payload.target,
        llmModel: 'zai/glm-4.7',
        chatMode: 'assist',
        status: '运行中',
        progress: 10,
        localOnly: true,
        createdAt: new Date().toISOString(),
        owner: currentUser.value?.username || 'unknown',
        messages: [ // 默认插入一条 AI 欢迎语
          {
            id: `msg-${Date.now()}`,
            role: 'ai',
            type: 'text',
            content: `您好，已成功为您创建目标 ${payload.target} 的独立渗透工作区。`
          }
        ]
      })
      tasks.value.unshift(fallback)
      tasks.value = normalizeTaskList(tasks.value)
      if (!openTaskIds.value.includes(fallback.id)) {
        openTaskIds.value.unshift(fallback.id)
      }
      selectedTaskId.value = fallback.id
      ElMessage.warning('后端不可达，已切换到离线演示任务（VITE_ENABLE_OFFLINE_DEMO=true）')
      persist()
      return fallback
    }
  }

  async function updateTaskStatus(task, action) {
    const mapper = {
      pause: { api: taskApi.pause, status: '已暂停' },
      resume: { api: taskApi.resume, status: '运行中' },
      terminate: { api: taskApi.terminate, status: '已终止' },
      rerun: { api: taskApi.rerun, status: '运行中' }
    }
    const matched = mapper[action]
    if (!matched) return

    // Optimistic UI: apply local state immediately so task buttons feel responsive
    // even when backend is slow or temporarily unavailable.
    task.status = matched.status
    if (action === 'rerun') {
      task.progress = 5
      task.startedAt = new Date().toISOString()
      task.finishedAt = ''
    }
    if (action === 'terminate' || action === 'pause') {
      task.finishedAt = new Date().toISOString()
    }
    if (action === 'resume') {
      task.startedAt = new Date().toISOString()
      task.finishedAt = ''
    }
    task.logs = normalizeLogs([
      {
        id: `log-${Date.now()}`,
        time: new Date().toISOString(),
        tool: 'system',
        severity: action === 'terminate' ? 'High' : 'Info',
        message: `任务状态已切换为 ${matched.status}`
      },
      ...(task.logs || [])
    ])
    Object.assign(task, normalizeTask(task))
    persist()

    try {
      const { data } = await matched.api(task.id)
      if (data && typeof data === 'object') {
        const localMessages = Array.isArray(task.messages) ? task.messages : []
        const normalizedTask = normalizeTask(data)
        const remoteMessages = Array.isArray(normalizedTask.messages) ? normalizedTask.messages : []

        if (!remoteMessages.length) {
          normalizedTask.messages = localMessages
        } else {
          normalizedTask.messages = mergeTaskMessages(localMessages, remoteMessages)
        }

        Object.assign(task, normalizedTask)
        persist()
        return
      }
    } catch {
      ElMessage.warning('后端未响应，已先更新本地状态')
    }
  }

  async function syncTaskRuntimeConfig(task, payload = {}) {
    if (!task?.id) return

    const nextMode = payload.chatMode || task.chatMode || 'agent'
    const nextModel = payload.llmModel || task.llmModel || settings.value.model || 'zai/glm-4.7'

    task.chatMode = nextMode
    task.llmModel = nextModel
    persist()

    try {
      const { data } = await taskApi.update(task.id, {
        chatMode: nextMode,
        llmModel: nextModel
      })
      if (data && typeof data === 'object') {
        const localMessages = Array.isArray(task.messages) ? task.messages : []
        const normalizedTask = normalizeTask(data)
        const remoteMessages = Array.isArray(normalizedTask.messages) ? normalizedTask.messages : []

        if (!remoteMessages.length) {
          normalizedTask.messages = localMessages
        } else {
          normalizedTask.messages = mergeTaskMessages(localMessages, remoteMessages)
        }

        Object.assign(task, normalizedTask)
        persist()
      }
    } catch {
      ElMessage.warning('后端未响应，模式切换仅保存在前端')
    }
  }

  async function deleteTask(taskId) {
    // Optimistic delete: update local UI first to avoid blocking on slow backend responses.
    if (!deletedTaskIds.value.includes(taskId)) {
      deletedTaskIds.value.push(taskId)
    }
    tasks.value = tasks.value.filter((item) => item.id !== taskId)
    openTaskIds.value = openTaskIds.value.filter((item) => item !== taskId)
    if (selectedTaskId.value === taskId) {
      selectedTaskId.value = openTaskIds.value[0] || tasks.value[0]?.id || ''
    }
    persist()

    taskApi.remove(taskId).catch(() => {
      ElMessage.warning('后端删除失败，已先移除本地记录')
    })
  }

  function openTask(taskId) {
    if (!taskId) return
    if (!openTaskIds.value.includes(taskId)) {
      openTaskIds.value.push(taskId)
    }
    selectedTaskId.value = taskId
    persist()
  }

  function closeTask(taskId) {
    openTaskIds.value = openTaskIds.value.filter((item) => item !== taskId)
    if (selectedTaskId.value === taskId) {
      selectedTaskId.value = openTaskIds.value[0] || tasks.value[0]?.id || ''
    }
    persist()
  }

  async function loadTaskLogs(taskId) {
    try {
      const { data } = await taskApi.logs(taskId)
      const target = tasks.value.find((item) => item.id === taskId)
      if (target) {
        target.logs = normalizeLogs(data)
        Object.assign(target, normalizeTask(target))
        persist()
      }
    } catch (error) {
      if (error?.response?.status === 404) {
        tasks.value = tasks.value.filter((item) => item.id !== taskId)
        openTaskIds.value = openTaskIds.value.filter((item) => item !== taskId)
        if (selectedTaskId.value === taskId) {
          selectedTaskId.value = openTaskIds.value[0] || tasks.value[0]?.id || ''
        }
      }
      persist()
    }
  }

  async function saveTool(tool, payload) {
    try {
      await toolApi.update(tool.id, payload)
    } catch {
      ElMessage.warning('工具设置未同步到后端，已保存在前端')
    }
    Object.assign(tool, payload)
    persist()
  }

  async function testTool(toolId, target) {
    try {
      await toolApi.test(toolId, { target })
      ElMessage.success('工具快速测试已提交')
    } catch {
      ElMessage.info('后端未响应，本次仅演示请求封装')
    }
  }

  async function generateReport(payload) {
    const task = tasks.value.find((item) => item.id === payload.taskId)
    if (!task) throw new Error('未找到对应任务')

    try {
      const { data } = await reportApi.create(payload)
      reports.value.unshift(data)
      persist()
      return data
    } catch {
      const local = {
        id: `report-${Date.now()}`,
        title: payload.title,
        taskId: payload.taskId,
        modules: payload.modules,
        createdAt: new Date().toISOString(),
        content: buildLocalReport(task, payload.modules, tools.value)
      }
      reports.value.unshift(local)
      persist()
      return local
    }
  }

  async function loadReports() {
    try {
      const { data } = await reportApi.list()
      reports.value = Array.isArray(data) ? data : reports.value
      persist()
    } catch {
      persist()
    }
  }

  async function exportReport(report, format) {
    try {
      const { data } = await reportApi.exportFile(report.id, format)
      downloadBlob(data, `${report.title}.${format === 'markdown' ? 'md' : 'pdf'}`)
      return
    } catch {
      if (format === 'markdown') {
        downloadBlob(new Blob([report.content], { type: 'text/markdown;charset=utf-8' }), `${report.title}.md`)
      } else {
        const pdf = new jsPDF()
        const textLines = pdf.splitTextToSize(report.content, 180)
        pdf.text(textLines, 12, 18)
        pdf.save(`${report.title}.pdf`)
      }
    }
  }

  function downloadBlob(blobLike, filename) {
    const blob = blobLike instanceof Blob ? blobLike : new Blob([blobLike])
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return {
    initialized,
    auth,
    settings,
    tasks,
    tools,
    reports,
    modules,
    selectedTaskId,
    openTaskIds,
    tasksSyncAt,
    tasksSyncState,
    currentUser,
    isAuthenticated,
    selectedTask,
    initialize,
    login,
    register,
    logout,
    loadSettings,
    saveSettings,
    loadTasks,
    loadTools,
    loadReports,
    createTask,
    openTask,
    closeTask,
    updateTaskStatus,
    syncTaskRuntimeConfig,
    deleteTask,
    loadTaskLogs,
    saveTool,
    testTool,
    generateReport,
    exportReport,
    persist
  }
})
