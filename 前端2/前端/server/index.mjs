import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
const usersFile = path.join(dataDir, 'users.json')
const settingsFile = path.join(dataDir, 'settings.json')
const tasksFile = path.join(dataDir, 'tasks.json')
const toolsFile = path.join(dataDir, 'tools.json')
const reportsFile = path.join(dataDir, 'reports.json')
const host = process.env.HOST || '0.0.0.0'
const port = Number(process.env.PORT || 8000)

const defaultSettings = {
  provider: '',
  model: '',
  apiBaseUrl: '',
  apiKey: '',
  backendUrl: `http://${host}:${port}`,
  mcpEndpoint: `http://${host}:${port}/mcp/health`,
  knowledgeBasePath: '',
  targetHosts: [],
  apiKeyConfigured: false
}

const defaultTools = [
  { id: 'nmap', name: 'Nmap', version: '7.95', status: true, args: '-sV -T4', category: '资产探测' },
  { id: 'nuclei', name: 'Nuclei', version: '3.2.1', status: true, args: '-severity critical,high,medium', category: '模板扫描' },
  { id: 'dirsearch', name: 'Dirsearch', version: '0.4.3', status: true, args: '-x 403,404', category: '目录扫描' },
  { id: 'sqlmap', name: 'SQLMap', version: '1.8.2', status: true, args: '--batch --risk=2', category: '注入检测' },
  { id: 'whatweb', name: 'WhatWeb', version: '0.5.5', status: false, args: '--aggression 3', category: '指纹识别' }
]

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Frontend-Origin',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  })
  response.end(JSON.stringify(payload))
}

function sendText(response, statusCode, text, contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Frontend-Origin',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    ...extraHeaders
  })
  response.end(text)
}

function sendSSEHeaders(response) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Frontend-Origin',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  })
}

function writeSSE(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hashPassword(password) {
  return createHash('sha256').update(password).digest('hex')
}

async function ensureDataFiles() {
  await mkdir(dataDir, { recursive: true })

  try {
    await readFile(usersFile, 'utf8')
  } catch {
    const seedUsers = [
      {
        id: 'builtin-admin',
        username: 'admin',
        passwordHash: hashPassword('test'),
        role: 'test',
        useBuiltinApi: true,
        createdAt: new Date().toISOString()
      }
    ]
    await writeFile(usersFile, JSON.stringify(seedUsers, null, 2), 'utf8')
  }

  try {
    await readFile(settingsFile, 'utf8')
  } catch {
    await writeFile(settingsFile, JSON.stringify(defaultSettings, null, 2), 'utf8')
  }

  try {
    await readFile(tasksFile, 'utf8')
  } catch {
    await writeFile(tasksFile, JSON.stringify([], null, 2), 'utf8')
  }

  try {
    await readFile(toolsFile, 'utf8')
  } catch {
    await writeFile(toolsFile, JSON.stringify(defaultTools, null, 2), 'utf8')
  }

  try {
    await readFile(reportsFile, 'utf8')
  } catch {
    await writeFile(reportsFile, JSON.stringify([], null, 2), 'utf8')
  }
}

async function readJson(file, fallback) {
  try {
    const content = await readFile(file, 'utf8')
    return JSON.parse(content)
  } catch {
    return fallback
  }
}

async function writeJson(file, value) {
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8')
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let raw = ''

    request.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1_000_000) {
        reject(new Error('Payload too large'))
        request.destroy()
      }
    })

    request.on('end', () => {
      if (!raw) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })

    request.on('error', reject)
  })
}

function makeToken(user) {
  const payload = `${user.id}:${user.username}:${Date.now()}`
  return Buffer.from(payload).toString('base64url')
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    useBuiltinApi: user.useBuiltinApi
  }
}

function findPathParam(pathname, pattern) {
  const match = pathname.match(pattern)
  if (!match) return null
  return match[1]
}

function mapTaskStatus(action) {
  const mapper = {
    pause: 'paused',
    resume: 'running',
    terminate: 'terminated',
    rerun: 'running'
  }
  return mapper[action] || 'running'
}

function toDurationMs(value) {
  const numeric = Number(value)
  return Number.isNaN(numeric) ? 0 : Math.max(0, Math.round(numeric))
}

function parseIsoMs(value) {
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function deriveElapsedMs(task, nowMs = Date.now()) {
  const explicit = toDurationMs(task.durationMs ?? task.duration_ms ?? task.elapsedMs ?? task.elapsed_ms)
  if (explicit > 0) return explicit

  const startedMs = parseIsoMs(task.startedAt || task.started_at || task.createdAt || task.created_at)
  if (!startedMs) return 0

  const status = String(task.status || '').trim().toLowerCase()
  if (['paused', 'terminated', 'completed', 'failed'].includes(status)) {
    const finishedMs = parseIsoMs(task.finishedAt || task.finished_at)
    if (finishedMs) return Math.max(0, finishedMs - startedMs)
  }

  return Math.max(0, nowMs - startedMs)
}

function buildTaskName(target, machineType, scanDepth) {
  const t = String(target || '未提供目标').trim()
  const m = String(machineType || '自动推测').trim()
  const d = String(scanDepth || '标准').trim()
  return `${m} ${t} ${d}扫描`
}

function appendTaskLog(task, item) {
  task.logs = Array.isArray(task.logs) ? task.logs : []
  task.logs.unshift({
    id: item.id || `log-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    time: new Date().toISOString(),
    tool: item.tool || 'system',
    severity: item.severity || 'Info',
    message: item.message || ''
  })
}

function buildReportContent(task, modules, tools) {
  const selected = Array.isArray(modules) ? modules : []
  const toolIds = Array.isArray(task.toolIds) ? task.toolIds : []
  const toolNames = toolIds.map((id) => tools.find((tool) => tool.id === id)?.name || id)
  const logs = Array.isArray(task.logs) ? task.logs : []
  const findings = logs.filter((item) => ['Critical', 'High', 'Medium'].includes(String(item.severity || '')))

  const lines = [
    '自动化渗透测试报告',
    `任务：${task.name || task.target || task.id}`,
    `目标：${task.target || ''}`,
    `生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    ''
  ]

  if (selected.includes('执行摘要')) {
    lines.push('[执行摘要]')
    lines.push(`共采集 ${logs.length} 条日志，检测到中高危风险 ${findings.length} 项。`)
    lines.push('')
  }

  if (selected.includes('攻击面资产')) {
    lines.push('[攻击面资产]')
    lines.push(`启用工具：${toolNames.join(' / ') || '未指定工具'}`)
    lines.push('')
  }

  if (selected.includes('漏洞清单')) {
    lines.push('[漏洞清单]')
    if (findings.length) {
      findings.forEach((finding, index) => {
        lines.push(`${index + 1}. [${finding.severity}] ${finding.message}`)
      })
    } else {
      lines.push('暂无明确漏洞项。')
    }
    lines.push('')
  }

  if (selected.includes('利用过程')) {
    lines.push('[利用过程]')
    logs.forEach((log) => {
      lines.push(`- ${log.time} ${log.tool}: ${log.message}`)
    })
    lines.push('')
  }

  if (selected.includes('修复建议')) {
    lines.push('[修复建议]')
    lines.push('- 升级高危组件并核对版本。')
    lines.push('- 对暴露接口增加访问控制。')
    lines.push('- 持续执行资产与漏洞基线巡检。')
    lines.push('')
  }

  if (selected.includes('原始日志')) {
    lines.push('[原始日志]')
    logs.forEach((log) => {
      lines.push(`${log.time} | ${log.tool} | ${log.severity} | ${log.message}`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`)

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  try {
    if (request.method === 'POST' && url.pathname === '/api/auth/register') {
      const body = await parseBody(request)
      const username = String(body.username || '').trim()
      const password = String(body.password || '')

      if (username.length < 3) {
        sendJson(response, 400, { message: '用户名至少需要 3 个字符' })
        return
      }

      if (password.length < 6) {
        sendJson(response, 400, { message: '密码至少需要 6 个字符' })
        return
      }

      const users = await readJson(usersFile, [])
      const duplicated = users.some((user) => user.username.toLowerCase() === username.toLowerCase())
      if (duplicated) {
        sendJson(response, 409, { message: '用户名已存在，请更换后重试' })
        return
      }

      const newUser = {
        id: randomUUID(),
        username,
        passwordHash: hashPassword(password),
        role: 'user',
        useBuiltinApi: false,
        createdAt: new Date().toISOString()
      }

      users.push(newUser)
      await writeJson(usersFile, users)
      sendJson(response, 201, {
        message: '注册成功',
        user: sanitizeUser(newUser)
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await parseBody(request)
      const username = String(body.username || '').trim()
      const password = String(body.password || '')
      const users = await readJson(usersFile, [])

      const user = users.find((item) => item.username.toLowerCase() === username.toLowerCase())
      if (!user || user.passwordHash !== hashPassword(password)) {
        sendJson(response, 401, { message: '用户名或密码错误' })
        return
      }

      sendJson(response, 200, {
        token: makeToken(user),
        user: sanitizeUser(user)
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/settings') {
      const settings = await readJson(settingsFile, defaultSettings)
      sendJson(response, 200, settings)
      return
    }

    if (request.method === 'PUT' && url.pathname === '/api/settings') {
      const body = await parseBody(request)
      const nextSettings = {
        ...defaultSettings,
        ...body,
        apiKeyConfigured: Boolean(String(body.apiKey || '').trim())
      }
      await writeJson(settingsFile, nextSettings)
      sendJson(response, 200, nextSettings)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/tasks') {
      const tasks = await readJson(tasksFile, [])
      sendJson(response, 200, tasks)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/tasks') {
      const body = await parseBody(request)
      const target = String(body.target || '').trim()

      if (!target) {
        sendJson(response, 400, { message: 'target 不能为空' })
        return
      }

      const tasks = await readJson(tasksFile, [])
      const machineType = String(body.machineType || '自动推测')
      const scanDepth = String(body.scanDepth || '标准')
      const llmModel = String(body.llmModel || 'zai/glm-4.7')
      const chatMode = String(body.chatMode || 'agent')
      const toolIds = Array.isArray(body.toolIds) ? body.toolIds : ['nmap', 'nuclei', 'dirsearch']

      const task = {
        id: `task-${randomUUID()}`,
        name: buildTaskName(target, machineType, scanDepth),
        target,
        machineType,
        scanDepth,
        llmModel,
        chatMode,
        toolIds,
        status: 'running',
        progress: 5,
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        finishedAt: '',
        owner: 'local-user',
        messages: [
          {
            id: `msg-${Date.now()}`,
            role: 'ai',
            type: 'text',
            content: `您好，已成功为您创建目标 ${target} 的独立渗透工作区。`
          }
        ],
        logs: []
      }

      appendTaskLog(task, { tool: 'system', severity: 'Info', message: `任务已创建，目标 ${target}` })

      tasks.unshift(task)
      await writeJson(tasksFile, tasks)
      sendJson(response, 201, task)
      return
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/tasks/') && url.pathname.endsWith('/logs')) {
      const taskId = findPathParam(url.pathname, /^\/api\/tasks\/([^/]+)\/logs$/)
      const tasks = await readJson(tasksFile, [])
      const task = tasks.find((item) => item.id === taskId)

      if (!task) {
        sendJson(response, 404, { message: '任务不存在' })
        return
      }

      sendJson(response, 200, Array.isArray(task.logs) ? task.logs : [])
      return
    }

    if (request.method === 'POST' && url.pathname.startsWith('/api/tasks/') && url.pathname.endsWith('/chat')) {
      const taskId = findPathParam(url.pathname, /^\/api\/tasks\/([^/]+)\/chat$/)
      const tasks = await readJson(tasksFile, [])
      const task = tasks.find((item) => item.id === taskId)

      if (!task) {
        sendJson(response, 404, { message: '任务不存在' })
        return
      }

      const body = await parseBody(request)
      const prompt = String(body.prompt || '').trim()
      const mode = String(body.mode || task.chatMode || 'agent')
      const model = String(body.model || task.llmModel || 'zai/glm-4.7')

      sendSSEHeaders(response)
      response.write(': stream opened\n\n')

      writeSSE(response, {
        type: 'text',
        content: `已接收指令：${prompt || '（空输入）'}。正在使用 ${model}（${mode} 模式）分析目标 ${task.target}。\n`
      })

      await sleep(120)
      writeSSE(response, {
        type: 'tool_start',
        id: `tool-${Date.now()}`,
        tool: 'nmap',
        args: { target: task.target, profile: mode }
      })

      await sleep(120)
      writeSSE(response, {
        type: 'tool_end',
        id: `tool-${Date.now() - 120}`,
        result: `扫描完成：${task.target} 存在 22/80/443 端口响应。`
      })

      await sleep(100)
      const planSection = [
        'plan:',
        `1. 对目标 ${task.target} 执行端口与服务识别。`,
        '2. 针对暴露服务进行目录与漏洞模板探测。',
        '3. 汇总风险并输出可执行修复建议。'
      ].join('\n')

      const processSection = [
        '渗透测试过程:',
        `- 已接收指令并加载上下文：${prompt || '（空输入）'}`,
        `- 执行 nmap 侦察，目标 ${task.target} 响应 22/80/443 端口。`,
        '- 初步判断具备继续进行目录与漏洞验证的条件。'
      ].join('\n')

      const reportSection = [
        '报告:',
        '- 当前结论：已完成第一轮侦察，发现可进一步验证的攻击面。',
        '- 风险等级：中（需继续验证后确认）。',
        '- 下一步建议：执行目录探测与漏洞模板验证，并收敛到漏洞清单。'
      ].join('\n')

      writeSSE(response, {
        type: 'text',
        content: `${planSection}\n\n${processSection}\n\n${reportSection}`
      })

      writeSSE(response, '[DONE]')
      response.end()

      appendTaskLog(task, {
        tool: 'agent',
        severity: 'Info',
        message: `聊天任务执行完成（mode=${mode}, model=${model}）`
      })
      task.progress = Math.min(100, Number(task.progress || 0) + 8)
      await writeJson(tasksFile, tasks)
      return
    }

    if (request.method === 'POST' && url.pathname.startsWith('/api/tasks/')) {
      const actionId = findPathParam(url.pathname, /^\/api\/tasks\/([^/]+)\/(pause|resume|terminate|rerun)$/)
      const actionMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/(pause|resume|terminate|rerun)$/)
      if (actionId && actionMatch) {
        const taskId = actionMatch[1]
        const action = actionMatch[2]
        const tasks = await readJson(tasksFile, [])
        const task = tasks.find((item) => item.id === taskId)

        if (!task) {
          sendJson(response, 404, { message: '任务不存在' })
          return
        }

        task.status = mapTaskStatus(action)
        if (action === 'rerun') {
          task.progress = 5
          task.startedAt = new Date().toISOString()
          task.finishedAt = ''
          task.durationMs = 0
        }
        if (action === 'pause' || action === 'terminate') {
          task.durationMs = deriveElapsedMs(task)
          task.finishedAt = new Date().toISOString()
        }
        if (action === 'resume') {
          const elapsedMs = deriveElapsedMs(task)
          task.durationMs = elapsedMs
          task.startedAt = new Date(Date.now() - elapsedMs).toISOString()
          task.finishedAt = ''
        }

        appendTaskLog(task, {
          tool: 'system',
          severity: action === 'terminate' ? 'High' : 'Info',
          message: `任务状态切换为 ${task.status}`
        })

        await writeJson(tasksFile, tasks)
        sendJson(response, 200, task)
        return
      }
    }

    if (request.method === 'DELETE' && url.pathname.startsWith('/api/tasks/')) {
      const taskId = findPathParam(url.pathname, /^\/api\/tasks\/([^/]+)$/)
      if (taskId) {
        const tasks = await readJson(tasksFile, [])
        const nextTasks = tasks.filter((item) => item.id !== taskId)
        if (nextTasks.length === tasks.length) {
          sendJson(response, 404, { message: '任务不存在' })
          return
        }

        const reports = await readJson(reportsFile, [])
        const nextReports = reports.filter((item) => item.taskId !== taskId)
        await writeJson(tasksFile, nextTasks)
        await writeJson(reportsFile, nextReports)
        sendJson(response, 200, { message: '任务已删除' })
        return
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/tools') {
      const tools = await readJson(toolsFile, defaultTools)
      sendJson(response, 200, tools)
      return
    }

    if (request.method === 'PUT' && url.pathname.startsWith('/api/tools/')) {
      const toolId = findPathParam(url.pathname, /^\/api\/tools\/([^/]+)$/)
      if (toolId) {
        const body = await parseBody(request)
        const tools = await readJson(toolsFile, defaultTools)
        const tool = tools.find((item) => item.id === toolId)

        if (!tool) {
          sendJson(response, 404, { message: '工具不存在' })
          return
        }

        if (typeof body.status === 'boolean') tool.status = body.status
        if (body.args !== undefined) tool.args = String(body.args || '')

        await writeJson(toolsFile, tools)
        sendJson(response, 200, tool)
        return
      }
    }

    if (request.method === 'POST' && url.pathname.startsWith('/api/tools/') && url.pathname.endsWith('/test')) {
      const toolId = findPathParam(url.pathname, /^\/api\/tools\/([^/]+)\/test$/)
      const body = await parseBody(request)
      const target = String(body.target || '').trim()

      if (!toolId) {
        sendJson(response, 400, { message: '工具参数错误' })
        return
      }

      sendJson(response, 200, {
        message: `工具 ${toolId} 测试请求已提交`,
        target: target || '未指定目标',
        status: 'queued'
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/reports') {
      const body = await parseBody(request)
      const taskId = String(body.taskId || '').trim()
      const title = String(body.title || '自动化渗透测试报告').trim()
      const modules = Array.isArray(body.modules) ? body.modules : []

      if (!taskId) {
        sendJson(response, 400, { message: 'taskId 不能为空' })
        return
      }

      const tasks = await readJson(tasksFile, [])
      const tools = await readJson(toolsFile, defaultTools)
      const task = tasks.find((item) => item.id === taskId)

      if (!task) {
        sendJson(response, 404, { message: '任务不存在，无法生成报告' })
        return
      }

      const reports = await readJson(reportsFile, [])
      const report = {
        id: `report-${randomUUID()}`,
        title,
        taskId,
        modules,
        createdAt: new Date().toISOString(),
        content: buildReportContent(task, modules, tools)
      }

      reports.unshift(report)
      await writeJson(reportsFile, reports)
      sendJson(response, 201, report)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/reports') {
      const reports = await readJson(reportsFile, [])
      sendJson(response, 200, Array.isArray(reports) ? reports : [])
      return
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/reports/') && !url.pathname.endsWith('/export')) {
      const reportId = findPathParam(url.pathname, /^\/api\/reports\/([^/]+)$/)
      const reports = await readJson(reportsFile, [])
      const report = reports.find((item) => item.id === reportId)

      if (!report) {
        sendJson(response, 404, { message: '报告不存在' })
        return
      }

      sendJson(response, 200, report)
      return
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/reports/') && url.pathname.endsWith('/export')) {
      const reportId = findPathParam(url.pathname, /^\/api\/reports\/([^/]+)\/export$/)
      const format = String(url.searchParams.get('format') || 'markdown').toLowerCase()
      const reports = await readJson(reportsFile, [])
      const report = reports.find((item) => item.id === reportId)

      if (!report) {
        sendJson(response, 404, { message: '报告不存在' })
        return
      }

      if (format === 'markdown') {
        sendText(
          response,
          200,
          String(report.content || ''),
          'text/markdown; charset=utf-8',
          {
            'Content-Disposition': `attachment; filename="${encodeURIComponent(report.title)}.md"`
          }
        )
        return
      }

      if (format === 'pdf') {
        sendJson(response, 501, { message: '本地 API 暂未内置 PDF 渲染，请由前端降级导出。' })
        return
      }

      sendJson(response, 400, { message: '仅支持 markdown 或 pdf' })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, {
        backend: 'ok',
        mcp: 'ok',
        knowledgeBase: 'ok'
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/mcp/health') {
      sendJson(response, 200, { status: 'ok' })
      return
    }

    sendJson(response, 404, { message: 'Not Found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    sendJson(response, 500, { message })
  }
})

await ensureDataFiles()

server.listen(port, host, () => {
  console.log(`Local API server running at http://${host}:${port}`)
})
