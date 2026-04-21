const STATUS_LABELS = {
  running: '运行中',
  in_progress: '运行中',
  active: '运行中',
  pending: '排队中',
  queued: '排队中',
  paused: '已暂停',
  pause: '已暂停',
  completed: '已完成',
  success: '已完成',
  done: '已完成',
  finished: '已完成',
  terminated: '已终止',
  stopped: '已终止',
  canceled: '已终止',
  cancelled: '已终止',
  failed: '已终止',
  error: '已终止'
}

const FINISHED_STATUSES = new Set(['已完成', '已终止'])

function normalizeDate(value, fallback = new Date().toISOString()) {
  if (!value) return fallback

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function normalizeProgress(value) {
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return 0
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function normalizeStatus(value) {
  const text = String(value || '').trim()
  const key = text.toLowerCase().replace(/[\s-]+/g, '_')
  return STATUS_LABELS[key] || text || '运行中'
}

function normalizeSeverity(value) {
  const text = String(value || 'Info').trim().toLowerCase()
  if (text === 'critical') return 'Critical'
  if (text === 'high') return 'High'
  if (text === 'medium') return 'Medium'
  if (text === 'low') return 'Low'
  return 'Info'
}

function isPausedStatus(status) {
  return String(status || '').trim() === '已暂停'
}

function parseClockDuration(value) {
  if (typeof value !== 'string' || !value.includes(':')) return null

  const parts = value.split(':').map((item) => Number(item))
  if (parts.some((item) => Number.isNaN(item)) || parts.length < 2 || parts.length > 3) {
    return null
  }

  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]]
  return ((hours * 60 + minutes) * 60 + seconds) * 1000
}

function deriveDurationMs(explicitValue, taskMeta, now = Date.now()) {
  const hasExplicitValue = explicitValue !== undefined && explicitValue !== null && explicitValue !== ''
  if (hasExplicitValue) {
    const numeric = Number(explicitValue)
    if (!Number.isNaN(numeric)) {
      return Math.max(0, numeric)
    }

    const clockDuration = parseClockDuration(explicitValue)
    if (clockDuration !== null) {
      return clockDuration
    }
  }

  const startedAt = new Date(taskMeta.startedAt || taskMeta.createdAt).getTime()
  const shouldFreezeAtEnd = FINISHED_STATUSES.has(taskMeta.status) || isPausedStatus(taskMeta.status)
  const fallbackEnd = shouldFreezeAtEnd ? taskMeta.finishedAt : new Date(now).toISOString()
  const finishedAt = new Date(taskMeta.finishedAt || fallbackEnd).getTime()

  if (Number.isNaN(startedAt) || Number.isNaN(finishedAt)) return 0
  return Math.max(0, finishedAt - startedAt)
}

export function formatTaskDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}小时${minutes}分`
  }

  if (minutes > 0) {
    return `${minutes}分${seconds}秒`
  }

  return `${seconds}秒`
}

export function normalizeLogs(input) {
  const logs = Array.isArray(input) ? input : []

  return logs
    .map((log, index) => ({
      ...log,
      id: String(log.id || `log-${index + 1}`),
      time: normalizeDate(log.time || log.timestamp || log.createdAt),
      tool: String(log.tool || log.source || log.module || 'system'),
      severity: normalizeSeverity(log.severity || log.level),
      message: String(log.message || log.content || log.detail || '')
    }))
    .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
}

export function normalizeTask(task = {}) {
  const createdAt = normalizeDate(task.createdAt || task.created_at || task.startTime || task.start_time)
  const startedAt = normalizeDate(task.startedAt || task.started_at || task.startTime || task.start_time || createdAt, createdAt)
  const status = normalizeStatus(task.status || task.state || task.phase)
  const finishedAtSource =
    task.finishedAt || task.finished_at || task.pausedAt || task.paused_at || task.endedAt || task.ended_at || task.completedAt || task.completed_at
  const finishedAt = finishedAtSource ? normalizeDate(finishedAtSource, createdAt) : ''
  const progress = normalizeProgress(task.progress || task.percent || task.percentage || task.progressRate)
  const logs = normalizeLogs(task.logs || task.records || task.events)
  const durationMs = deriveDurationMs(
    task.durationMs || task.duration_ms || task.elapsedMs || task.elapsed_ms || task.runtimeMs || task.runtime_ms || task.runTimeMs || task.run_time_ms || task.duration || task.runtime,
    { createdAt, startedAt, finishedAt, status }
  )

  return {
    ...task,
    id: String(task.id || task.taskId || task.task_id || `task-${Date.now()}`),
    
    // 1. 将 name 直接回退为目标 IP (因为不需要选择靶机类型了)
    name: String(task.target || task.host || task.url || task.asset || '未提供目标'),
    target: String(task.target || task.host || task.url || task.asset || '未提供目标'),
    
    // 2. 新增多 Agent 模式专属字段
    llmModel: task.llmModel || 'zai/glm-4.7', 
    chatMode: task.chatMode || 'agent',
    messages: task.messages || [], // 核心：聊天记录和日志混排的数组
    
    // 兼容旧字段（防止后端还需要这些字段报错）
    machineType: String(task.machineType || task.machine_type || task.platform || '自动推测'),
    scanDepth: String(task.scanDepth || task.scan_depth || task.mode || '标准'),
    toolIds: Array.isArray(task.toolIds || task.tool_ids) ? task.toolIds || task.tool_ids : [],
    
    status,
    progress,
    createdAt,
    startedAt,
    finishedAt,
    owner: String(task.owner || task.createdBy || task.username || 'unknown'),
    logs,
    durationMs,
    durationLabel: formatTaskDuration(durationMs)
  }
}

export function getTaskDurationMs(task = {}, now = Date.now()) {
  return deriveDurationMs(
    task.durationMs ||
      task.duration_ms ||
      task.elapsedMs ||
      task.elapsed_ms ||
      task.runtimeMs ||
      task.runtime_ms ||
      task.runTimeMs ||
      task.run_time_ms ||
      task.duration ||
      task.runtime,
    {
      createdAt: task.createdAt || task.created_at || task.startTime || task.start_time,
      startedAt: task.startedAt || task.started_at || task.startTime || task.start_time || task.createdAt || task.created_at,
      finishedAt:
        task.finishedAt ||
        task.finished_at ||
        task.pausedAt ||
        task.paused_at ||
        task.endedAt ||
        task.ended_at ||
        task.completedAt ||
        task.completed_at,
      status: task.status || task.state || task.phase
    },
    now
  )
}

export function getTaskDurationLabel(task = {}, now = Date.now()) {
  return formatTaskDuration(getTaskDurationMs(task, now))
}

function extractPathFromText(input) {
  const text = String(input || '')
  if (!text) return ''

  const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i)
  if (urlMatch) {
    try {
      const url = new URL(urlMatch[0])
      if (url.pathname && url.pathname !== '/') {
        return url.pathname.length > 64 ? `${url.pathname.slice(0, 61)}...` : url.pathname
      }
    } catch {
      // ignore invalid URL parsing
    }
  }

  const pathMatch = text.match(/\/(?:[A-Za-z0-9._~%!$&'()*+,;=:@-]+\/)*[A-Za-z0-9._~%!$&'()*+,;=:@-]+(?:\?[A-Za-z0-9._~%!$&'()*+,;=:@/?-]*)?/) 
  if (!pathMatch) return ''

  const path = pathMatch[0]
  return path.length > 64 ? `${path.slice(0, 61)}...` : path
}

function extractCveFromText(input) {
  const text = String(input || '')
  if (!text) return ''
  const matched = text.match(/CVE-\d{4}-\d{4,7}/i)
  return matched ? matched[0].toUpperCase() : ''
}

function extractCvesFromText(input) {
  const text = String(input || '')
  if (!text) return []
  const matched = text.match(/CVE-\d{4}-\d{4,7}/gi)
  if (!matched) return []

  return Array.from(new Set(matched.map((item) => item.toUpperCase())))
}

function normalizeVulnName(value) {
  const text = String(value || '')
    .replace(/^[-:：,，;；\s]+/, '')
    .replace(/[。.!！?？\s]+$/, '')
    .trim()
  if (!text) return ''
  return text.length > 40 ? `${text.slice(0, 37)}...` : text
}

function extractCveNameFromText(cve, input) {
  const text = String(input || '')
  if (!cve || !text) return ''

  const escapedCve = String(cve).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Pattern: "CVE-XXXX-YYYY Name"
  const afterMatch = text.match(new RegExp(`${escapedCve}\\s*[-:：,，()（）]*\\s*([^\\n。.!！?？]{2,50})`, 'i'))
  if (afterMatch?.[1]) {
    return normalizeVulnName(afterMatch[1])
  }

  // Pattern: "Name (CVE-XXXX-YYYY)"
  const beforeMatch = text.match(new RegExp(`([^\\n。.!！?？]{2,50})\\s*[（(]\\s*${escapedCve}\\s*[)）]`, 'i'))
  if (beforeMatch?.[1]) {
    return normalizeVulnName(beforeMatch[1])
  }

  return ''
}

function getTaskCveName(task = {}, cve = '') {
  if (!cve) return ''

  const logs = Array.isArray(task.logs) ? task.logs : []
  for (const log of logs) {
    const text = String(log?.message || log?.content || '')
    const name = extractCveNameFromText(cve, text)
    if (name) return name
  }

  const messages = Array.isArray(task.messages) ? task.messages : []
  for (const msg of messages) {
    if (String(msg?.role || '') !== 'ai') continue
    const name = extractCveNameFromText(cve, msg?.content)
    if (name) return name
  }

  return ''
}

function getSeverityScore(level) {
  const value = String(level || '').trim()
  if (value === 'Critical') return 4
  if (value === 'High') return 3
  if (value === 'Medium') return 2
  if (value === 'Low') return 1
  return 0
}

function isMajorVulnLog(log = {}) {
  const severityScore = getSeverityScore(log.severity)
  if (severityScore >= 2) return true

  const text = String(log.message || log.content || '').toLowerCase()
  if (!text) return false
  return /cve-\d{4}-\d{4,7}|漏洞|vulnerability|exploit|rce|sqli|xss/.test(text)
}

export function getTaskPrimaryVulnerability(task = {}) {
  const logs = Array.isArray(task.logs) ? task.logs : []
  if (!logs.length) return null

  const candidates = logs.filter((log) => isMajorVulnLog(log))
  if (!candidates.length) return null

  const maxSeverity = Math.max(...candidates.map((log) => getSeverityScore(log.severity)))
  const majorCandidates = candidates.filter((log) => getSeverityScore(log.severity) === maxSeverity)
  const selected = majorCandidates[0] || candidates[0]
  if (!selected) return null

  const rawMessage = String(selected.message || selected.content || '')
  const cve = extractCveFromText(rawMessage)
  const path = extractPathFromText(rawMessage)

  return {
    severity: String(selected.severity || 'Info'),
    cve,
    path,
    logId: String(selected.id || ''),
    time: String(selected.time || ''),
    summary: rawMessage
  }
}

export function getTaskMajorVulnCves(task = {}, limit = 3) {
  const cveStats = new Map()

  const upsertCve = (cve, score) => {
    const key = String(cve || '').toUpperCase()
    if (!key) return
    const current = cveStats.get(key)
    if (!current) {
      cveStats.set(key, { cve: key, score, count: 1 })
      return
    }

    current.score = Math.max(current.score, score)
    current.count += 1
  }

  const logs = Array.isArray(task.logs) ? task.logs : []
  logs.forEach((log) => {
    const text = String(log?.message || log?.content || '')
    const cves = extractCvesFromText(text)
    if (!cves.length) return

    const score = getSeverityScore(log?.severity) || 2
    cves.forEach((cve) => upsertCve(cve, score))
  })

  const messages = Array.isArray(task.messages) ? task.messages : []
  messages.forEach((msg) => {
    if (String(msg?.role || '') !== 'ai') return
    const cves = extractCvesFromText(msg?.content)
    if (!cves.length) return

    // AI 对话中出现 CVE 视为中等级线索，若日志有更高等级会自动覆盖。
    cves.forEach((cve) => upsertCve(cve, 2))
  })

  return Array.from(cveStats.values())
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      if (right.count !== left.count) return right.count - left.count
      return left.cve.localeCompare(right.cve)
    })
    .slice(0, Math.max(1, Number(limit) || 1))
    .map((item) => item.cve)
}

export function getTaskPrimaryVulnPath(task = {}) {
  const vuln = getTaskPrimaryVulnerability(task)
  return vuln?.path || ''
}

export function getTaskPrimaryVulnCve(task = {}) {
  const majorCves = getTaskMajorVulnCves(task, 1)
  if (majorCves.length) {
    return majorCves[0]
  }

  const vuln = getTaskPrimaryVulnerability(task)
  return vuln?.cve || ''
}

export function getTaskDisplayName(task = {}) {
  const base = String(task.target || task.name || '未命名项目')
  const primaryCve = getTaskPrimaryVulnCve(task)
  if (primaryCve) {
    const cveName = getTaskCveName(task, primaryCve)
    return cveName ? `${base} · ${primaryCve} ${cveName}` : `${base} · ${primaryCve}`
  }

  const vuln = getTaskPrimaryVulnerability(task)
  if (!vuln) return base

  if (vuln.path) {
    return `${base} · ${vuln.path}`
  }

  return `${base} · ${vuln.severity}`
}

export function normalizeTaskList(input) {
  return (Array.isArray(input) ? input : [])
    .map((task) => normalizeTask(task))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}
