<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Position, Loading, CircleCheck, CircleClose, Close } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { chatApi } from '@/api/modules'
import { getTaskDisplayName, getTaskDurationLabel, getTaskMajorVulnCves } from '@/utils/tasks'

const store = useAppStore()
const targetIp = ref('')
const selectedArena = ref('')
const chatInput = ref('')
const messageContainer = ref(null)
const now = ref(Date.now())
let timer = null

const arenaOptions = [
  { label: 'Vulhub', value: 'Vulhub' },
  { label: 'VulnHub', value: 'VulnHub' }
]

const openTasks = computed(() =>
  store.openTaskIds.map((taskId) => store.tasks.find((item) => item.id === taskId)).filter(Boolean)
)
const selectedTaskStatus = computed(() => String(store.selectedTask?.status || ''))
const canPause = computed(() => selectedTaskStatus.value === '运行中')
const canResume = computed(() => selectedTaskStatus.value === '已暂停')
const aiRuntimeMap = ref({})
const selectedTaskStreaming = computed(() => {
  const taskId = store.selectedTaskId
  if (!taskId) return false
  return Boolean(aiRuntimeMap.value[taskId])
})
const selectedAiStatus = computed(() => {
  if (selectedTaskStatus.value === '运行中') return 'running'
  if (selectedTaskStatus.value === '已暂停') return 'paused'
  return 'stopped'
})
const selectedAiStatusLabel = computed(() => {
  if (selectedAiStatus.value === 'running') return '运行中'
  if (selectedAiStatus.value === 'paused') return '已暂停'
  return '已停止'
})
const chatInputDisabled = computed(() => selectedAiStatus.value !== 'running' || selectedTaskStreaming.value)
const selectedAiName = computed(() => {
  const model = String(store.selectedTask?.llmModel || '')
  const labels = {
    'zai/glm-4.7': '智谱 4.7',
    'zai/glm-5.1': '智谱 5.1'
  }
  return labels[model] || model || 'AI'
})
const taskHeartbeatLabel = computed(() => {
  if (store.tasksSyncState === 'syncing') return '任务状态同步中...'
  if (!store.tasksSyncAt) return '等待首次同步'

  const diffMs = Math.max(0, now.value - new Date(store.tasksSyncAt).getTime())
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 3) return '任务状态刚刚更新'
  if (seconds < 60) return `任务状态 ${seconds} 秒前更新`

  const minutes = Math.floor(seconds / 60)
  return `任务状态 ${minutes} 分钟前更新`
})
const taskHeartbeatClass = computed(() => {
  if (store.tasksSyncState === 'error') return 'is-error'
  if (store.tasksSyncState === 'syncing') return 'is-syncing'
  if (!store.tasksSyncAt) return 'is-idle'

  const diffMs = Math.max(0, now.value - new Date(store.tasksSyncAt).getTime())
  return diffMs > 45000 ? 'is-stale' : 'is-fresh'
})

function setAiRuntimeStatus(taskId, running) {
  if (!taskId) return
  aiRuntimeMap.value = {
    ...aiRuntimeMap.value,
    [taskId]: Boolean(running)
  }
}

function parseAiBlocks(content) {
  const lines = String(content || '')
    .replace(/\r\n/g, '\n')
    .split('\n')

  const blocks = []
  let listItems = []

  const flushList = () => {
    if (listItems.length) {
      blocks.push({ kind: 'list', items: listItems })
      listItems = []
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushList()
      continue
    }

    if (/^(\d+\.|[-*])\s+/.test(line)) {
      listItems.push(line.replace(/^(\d+\.|[-*])\s+/, ''))
      continue
    }

    flushList()

    if (/^plan\s*:/i.test(line)) {
      blocks.push({ kind: 'title', text: line.replace(/^plan\s*:/i, '执行计划：') })
      continue
    }

    if (/^渗透测试过程\s*[:：]?/.test(line)) {
      blocks.push({ kind: 'title', text: '渗透测试过程：' })
      continue
    }

    if (/^报告\s*[:：]?/.test(line)) {
      blocks.push({ kind: 'title', text: '报告：' })
      continue
    }

    if (line.startsWith('[系统提示]')) {
      blocks.push({ kind: 'system', text: line.replace('[系统提示]', '').trim() })
      continue
    }

    blocks.push({ kind: 'text', text: line })
  }

  flushList()
  return blocks
}

function appendBackendLikeEvent(target, payload) {
  const line = `data: ${JSON.stringify(payload, ensureAsciiReplacer)}`
  target.content += target.content ? `\n${line}` : line
}

function ensureAsciiReplacer(_key, value) {
  return value
}

function truncateText(value, max = 220) {
  const text = String(value || '')
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
}

function formatAiPayloadLine(payload = {}) {
  const tool = String(payload.tool || payload.name || '')
  const args = payload.args || payload.arguments
  const result = payload.result || payload.output

  if (payload.type === 'tool_start' || payload.type === 'tool_call') {
    const details = args ? truncateText(JSON.stringify(args)) : '无参数'
    return `参数：${details}`
  }

  if (payload.type === 'tool_end' || payload.type === 'tool_result') {
    if (payload.error) {
      return `错误：${truncateText(payload.error)}`
    }
    const details = result ? truncateText(typeof result === 'string' ? result : JSON.stringify(result)) : '无结果返回'
    return `结果：${details}`
  }

  return truncateText(JSON.stringify(payload))
}

function parseAiRawLines(content) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n')
  const runtimeOutput = []
  const planLines = []
  const resultLines = []
  let stepIndex = 0
  let textSection = 'runtime'

  const normalizeHeaderLine = (line) => {
    let value = String(line || '').trim()
    if (!value) return ''

    // Strip common markdown/list wrappers so headers like "### 计划" or "**Plan:**" are recognized.
    value = value.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)?/, '')
    value = value.replace(/^\s*[>#]+\s*/, '')
    value = value.replace(/[*_`]/g, '')
    value = value.replace(/^\s*[【\[(（]\s*/, '')
    value = value.replace(/\s*[】\])）]\s*$/, '')
    value = value.replace(/\s*[:：]\s*$/, '')
    return value.trim().toLowerCase()
  }

  const isPlanHeader = (line) => {
    const normalized = normalizeHeaderLine(line)
    return /^(plan|计划|执行计划|测试计划)$/.test(normalized)
  }

  const isResultHeader = (line) => {
    const normalized = normalizeHeaderLine(line)
    return /^(渗透测试过程|渗透测试结果|测试结果|结果汇总|报告|report|result|findings)$/.test(normalized)
  }

  const stripPlanHeader = (line) => {
    const original = String(line || '').trim()
    return original
      .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)?\s*[>#]*\s*[*_`]*\s*[【\[(（]?\s*(plan|计划|执行计划|测试计划)\s*[:：]?\s*[】\])）]?\s*/i, '')
      .trim()
  }

  const stripResultHeader = (line) => {
    const original = String(line || '').trim()
    return original
      .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)?\s*[>#]*\s*[*_`]*\s*[【\[(（]?\s*(渗透测试过程|渗透测试结果|测试结果|结果汇总|报告|report|result|findings)\s*[:：]?\s*[】\])）]?\s*/i, '')
      .trim()
  }

  const pushPlanLine = (line) => {
    if (!line) return
    planLines.push(line)
  }

  const pushResultLine = (line) => {
    if (!line) return
    resultLines.push(line)
  }

  const pushRuntimeText = (line, isSystem = false) => {
    if (!line) return
    runtimeOutput.push({
      kind: isSystem ? 'system' : 'text',
      label: isSystem ? '系统提示' : '运行',
      content: line
    })
  }

  lines
    .filter((line) => line.trim().length > 0)
    .forEach((line) => {
      const text = line.trim()

      if (!text.startsWith('data: ')) {
        if (isPlanHeader(text)) {
          textSection = 'plan'
          const inlinePlan = stripPlanHeader(text)
          pushPlanLine(inlinePlan)
          return
        }

        if (isResultHeader(text)) {
          textSection = 'result'
          const inlineResult = stripResultHeader(text)
          pushResultLine(inlineResult)
          return
        }

        if (text.startsWith('[系统提示]')) {
          const systemLine = text.replace('[系统提示]', '').trim()
          pushRuntimeText(systemLine, true)
          return
        }

        if (textSection === 'plan') {
          pushPlanLine(text)
          return
        }

        if (textSection === 'result') {
          pushResultLine(text)
          return
        }

        pushRuntimeText(text)
        return
      }

      const rawPayload = text.slice(6).trim()
      try {
        const payload = JSON.parse(rawPayload)
        const tool = String(payload.tool || payload.name || 'unknown')
        const eventType = String(payload.type || 'event')

        if (eventType === 'tool_start' || eventType === 'tool_call') {
          stepIndex += 1
          if (stepIndex > 1) {
            runtimeOutput.push({
              kind: 'separator',
              label: '分隔',
              content: `步骤 ${stepIndex}`
            })
          }
        }

        runtimeOutput.push({
          kind: 'event',
          label: eventType,
          tool,
          content: formatAiPayloadLine(payload),
          raw: truncateText(rawPayload, 360)
        })

        return
      } catch {
        runtimeOutput.push({
          kind: 'event',
          label: 'event',
          tool: 'unknown',
          content: text,
          raw: text
        })
      }
    })

  const output = []

  if (planLines.length) {
    output.push({
      kind: 'section',
      label: 'PLAN',
      content: planLines.join('\n')
    })
  }

  output.push({ kind: 'separator', label: '分区', content: '运行过程' })

  if (runtimeOutput.length) {
    output.push(...runtimeOutput)
  } else {
    output.push({
      kind: 'runtime-empty',
      label: '运行',
      content: '暂无运行事件，等待工具执行输出...'
    })
  }

  if (resultLines.length) {
    output.push({ kind: 'separator', label: '分区', content: '渗透测试结果' })
    output.push({
      kind: 'section',
      label: '结果',
      content: resultLines.join('\n')
    })
  }

  return output
}

function formatMessageTime(input) {
  if (!input) return '--:--:--'
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

function countAiLines(content) {
  return String(content || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length
}

function getProjectMajorCves(task) {
  return getTaskMajorVulnCves(task, 3)
}

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

async function submitTask() {
  if (!selectedArena.value) {
    ElMessage.warning('请先选择靶场（Vulhub 或 VulnHub）')
    return
  }

  if (!targetIp.value.trim()) {
    ElMessage.warning('请输入靶机 IP')
    return
  }

  try {
    await store.createTask({
      target: targetIp.value.trim(),
      machineType: selectedArena.value
    })
    ElMessage.success('工作区已创建')
    targetIp.value = ''
  } catch (error) {
    ElMessage.warning(error.message)
  }
}

function selectTask(taskId) {
  store.openTask(taskId)
}

function closeTab(taskId) {
  store.closeTask(taskId)
}

async function runTaskAction(action) {
  const task = store.selectedTask
  if (!task) return

  if (action === 'pause') {
    setAiRuntimeStatus(task.id, false)
    await store.updateTaskStatus(task, action)
    ElMessage.success('任务与 AI 已暂停')
    return
  }

  if (action === 'resume') {
    await store.updateTaskStatus(task, action)
    ElMessage.success('任务与 AI 已恢复')
    return
  }

  if (action === 'terminate') {
    setAiRuntimeStatus(task.id, false)
  }

  await store.updateTaskStatus(task, action)
}

async function handleChatModeChange(nextMode) {
  const task = store.selectedTask
  if (!task) return
  await store.syncTaskRuntimeConfig(task, { chatMode: nextMode })
}

async function handleLlmModelChange(nextModel) {
  const task = store.selectedTask
  if (!task) return
  await store.syncTaskRuntimeConfig(task, { llmModel: nextModel })
}

async function removeSelectedTask() {
  const task = store.selectedTask
  if (!task) return

  await store.deleteTask(task.id)
  ElMessage.success('任务已删除')
}

function scrollToBottom() {
  nextTick(() => {
    if (messageContainer.value) {
      messageContainer.value.scrollTop = messageContainer.value.scrollHeight
    }
  })
}

watch(() => store.selectedTaskId, scrollToBottom)
watch(() => store.selectedTask?.messages?.length, scrollToBottom)

async function sendChatMessage() {
  const task = store.selectedTask
  if (!chatInput.value.trim() || !task) return
  if (chatInputDisabled.value) {
    if (selectedTaskStreaming.value) {
      ElMessage.warning('AI 正在运行，请等待当前响应完成')
    } else if (selectedAiStatus.value === 'paused') {
      ElMessage.warning('任务已暂停，请先点击“恢复”')
    } else {
      ElMessage.warning('任务未处于运行中，请先点击“恢复”')
    }
    return
  }

  setAiRuntimeStatus(task.id, true)

  const query = chatInput.value.trim()
  task.messages ??= []
  task.messages.push({
    id: `msg-${Date.now()}`,
    role: 'user',
    type: 'text',
    content: query,
    time: new Date().toISOString()
  })
  chatInput.value = ''
  scrollToBottom()

  const aiTextMsg = {
    id: `msg-${Date.now() + 1}`,
    role: 'ai',
    type: 'text',
    content: '',
    time: new Date().toISOString()
  }
  task.messages.push(aiTextMsg)

  try {
    const response = await chatApi.stream(task.id, {
      prompt: query,
      mode: task.chatMode,
      model: task.llmModel
    })

    if (!response.ok || !response.body) {
      let detail = `请求失败 (${response.status})`
      try {
        const payload = await response.json()
        if (payload?.message) {
          detail = payload.message
        }
      } catch {
        // ignore parse errors and keep fallback detail
      }
      throw new Error(detail)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue

        const dataStr = line.slice(6).trim()
        if (dataStr === '[DONE]') continue

        try {
          const payload = JSON.parse(dataStr)
          if (payload.type === 'text') {
            aiTextMsg.content += payload.content || ''
          } else if (payload.type === 'tool_start' || payload.type === 'tool_call') {
            appendBackendLikeEvent(aiTextMsg, payload)
          } else if (payload.type === 'tool_end' || payload.type === 'tool_result') {
            appendBackendLikeEvent(aiTextMsg, payload)
          }
        } catch (error) {
          console.error('SSE 解析失败:', line, error)
        }
      }

      scrollToBottom()
    }
  } catch (error) {
    const reason = error?.message || '网络或后端接口中断，无法获取后续内容。'
    aiTextMsg.content += `\n\n[系统提示] ${reason}`
  } finally {
    setAiRuntimeStatus(task.id, false)
  }

  store.persist()
}
</script>

<template>
  <div class="grid-chat-workspace">
    <aside class="glass-card project-sidebar">
      <div class="section-head" style="margin-bottom: 16px;">
        <div>
          <div class="eyebrow">Workspaces</div>
          <h3>项目列表</h3>
        </div>
      </div>

      <div class="quick-create">
        <el-select v-model="selectedArena" placeholder="选择靶场" class="quick-create__arena">
          <el-option
            v-for="item in arenaOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>

        <el-input
          v-model="targetIp"
          placeholder="输入靶机 IP 按回车创建"
          @keyup.enter="submitTask"
        >
          <template #suffix>
            <el-button :icon="CircleCheck" class="quick-create__button" @click="submitTask" aria-label="确认创建" />
          </template>
        </el-input>
      </div>

      <div class="list-stack project-list">
        <div
          v-for="task in store.tasks"
          :key="task.id"
          class="item-card selectable"
          :class="{ active: store.selectedTaskId === task.id }"
          @click="selectTask(task.id)"
        >
          <div class="project-name">{{ getTaskDisplayName(task) }}</div>
          <div class="project-vuln">
            主要漏洞：{{ getProjectMajorCves(task).join(' / ') || '未识别CVE' }}
          </div>
          <div class="project-runtime">运行时间：{{ getTaskDurationLabel(task, now) }}</div>
        </div>
      </div>
    </aside>

    <main v-if="openTasks.length" class="glass-card chat-main browser-shell">
      <div class="browser-tabs">
        <button
          v-for="task in openTasks"
          :key="task.id"
          type="button"
          class="browser-tab"
          :class="{ active: store.selectedTaskId === task.id }"
          @click="selectTask(task.id)"
        >
          <span class="browser-tab__dot"></span>
          <span class="browser-tab__title">{{ getTaskDisplayName(task) }}</span>
          <el-icon class="browser-tab__close" @click.stop="closeTab(task.id)">
            <Close />
          </el-icon>
        </button>
      </div>

      <template v-if="store.selectedTask">
        <header class="chat-header">
          <div class="chat-title">
            <span class="eyebrow">Target</span>
            <h3>{{ store.selectedTask.target }}</h3>
            <el-tag
              class="ai-status-tag"
              :class="`is-${selectedAiStatus}`"
              effect="dark"
              size="small"
            >
              {{ selectedAiName }} 状态：{{ selectedAiStatusLabel }}
            </el-tag>
          </div>
          <div class="chat-controls">
            <el-segmented
              v-model="store.selectedTask.chatMode"
              :options="['assist', 'agent', 'crew']"
              @change="handleChatModeChange"
            />
            <el-select
              v-model="store.selectedTask.llmModel"
              style="width: 120px"
              @change="handleLlmModelChange"
            >
              <el-option label="智谱 4.7" value="zai/glm-4.7" />
              <el-option label="智谱 5.1" value="zai/glm-5.1" />
            </el-select>
            <el-button :disabled="!canPause" @click="runTaskAction('pause')">暂停</el-button>
            <el-button :disabled="!canResume" @click="runTaskAction('resume')">恢复</el-button>
            <el-button type="danger" plain @click="removeSelectedTask">删除</el-button>
          </div>
          <div class="task-heartbeat" :class="taskHeartbeatClass">
            {{ taskHeartbeatLabel }}
          </div>
        </header>

        <div ref="messageContainer" class="chat-messages">
          <div
            v-for="msg in store.selectedTask.messages"
            :key="msg.id"
            :class="['message-row', `is-${msg.role}`]"
          >
            <div v-if="msg.role === 'user'" class="message-shell">
              <div class="message-meta">你 · {{ formatMessageTime(msg.time) }}</div>
              <div class="bubble user-bubble">{{ msg.content }}</div>
            </div>
            <div
              v-else-if="msg.role === 'ai' && msg.type === 'text' && msg.content"
              class="message-shell"
            >
              <div class="message-meta">AI · {{ formatMessageTime(msg.time) }}</div>
              <div class="bubble ai-bubble ai-raw-card">
                <div class="ai-raw-card__head">
                  <span class="ai-raw-card__title">实时分析流</span>
                  <span class="ai-raw-card__chip">{{ store.selectedTask?.chatMode || 'agent' }}</span>
                  <span class="ai-raw-card__chip">{{ countAiLines(msg.content) }} 行</span>
                  <span class="ai-raw-card__time">{{ formatMessageTime(msg.time) }}</span>
                </div>
                <div class="ai-stream-list">
                  <div
                    v-for="(line, idx) in parseAiRawLines(msg.content)"
                    :key="`${msg.id}-${idx}`"
                    class="ai-stream-line"
                    :class="`is-${line.kind}`"
                  >
                    <template v-if="line.kind === 'separator'">
                      <span class="ai-stream-separator">
                        <span class="ai-stream-separator__text">{{ line.content }}</span>
                      </span>
                    </template>
                    <template v-else>
                    <div class="ai-stream-head">
                      <span class="ai-stream-badge">{{ line.label }}</span>
                      <span v-if="line.kind === 'event'" class="ai-stream-tool">工具：{{ line.tool }}</span>
                    </div>
                    <span class="ai-stream-content">{{ line.content }}</span>
                    <span v-if="line.kind === 'event'" class="ai-stream-raw">{{ line.raw }}</span>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <el-empty
            v-if="!store.selectedTask.messages || store.selectedTask.messages.length === 0"
            description="暂无对话，请发送消息"
          />
        </div>

        <footer class="chat-input-area">
          <div class="chat-compose">
            <el-input
              v-model="chatInput"
              type="textarea"
              :rows="2"
              resize="none"
              :disabled="chatInputDisabled"
              placeholder="输入提示词，按 Ctrl + Enter 发送"
              @keydown.ctrl.enter.prevent="sendChatMessage"
            />
            <el-button
              type="primary"
              class="chat-send-btn"
              circle
              :disabled="chatInputDisabled"
              @click="sendChatMessage"
              aria-label="发送指令"
            >
              <el-icon><Position /></el-icon>
            </el-button>
          </div>
        </footer>
      </template>
    </main>

    <el-empty v-else description="请在左侧输入 IP 创建一个新工作区，或选择历史项目" />
  </div>
</template>

<style scoped>
.chat-main.browser-shell {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(1200px 420px at 94% -20%, color-mix(in srgb, var(--accent-2) 18%, transparent), transparent),
    radial-gradient(900px 400px at -20% 120%, color-mix(in srgb, var(--accent) 15%, transparent), transparent),
    linear-gradient(160deg, rgba(12, 18, 37, 0.96), rgba(8, 12, 27, 0.92));
}

.chat-header {
  border-bottom: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  padding-bottom: 12px;
  margin-bottom: 8px;
}

.ai-status-tag {
  margin-top: 8px;
  border: 1px solid var(--line);
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
  font-weight: 600;
}

.ai-status-tag.is-running {
  border-color: color-mix(in srgb, var(--accent-2) 62%, transparent);
  color: #ffd7df;
  background: color-mix(in srgb, var(--accent-2) 24%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-2) 22%, transparent) inset;
}

.ai-status-tag.is-stopped {
  border-color: color-mix(in srgb, var(--success) 60%, transparent);
  color: #d6fff6;
  background: color-mix(in srgb, var(--success) 20%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--success) 18%, transparent) inset;
}

.ai-status-tag.is-paused {
  border-color: color-mix(in srgb, var(--warning) 58%, transparent);
  color: #ffe3b2;
  background: color-mix(in srgb, var(--warning) 20%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--warning) 16%, transparent) inset;
}

.task-heartbeat {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: color-mix(in srgb, var(--text-soft) 88%, #ffffff);
}

.task-heartbeat.is-fresh {
  color: #8bffd8;
}

.task-heartbeat.is-syncing {
  color: #b8ddff;
}

.task-heartbeat.is-stale,
.task-heartbeat.is-error {
  color: #ffd6a1;
}

.project-vuln {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.45;
  color: color-mix(in srgb, #ffdba6 82%, #a36a36);
}

.chat-messages {
  padding: 18px 16px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--line) 74%, transparent);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.024), rgba(255, 255, 255, 0.01)),
    repeating-linear-gradient(
      0deg,
      rgba(255, 255, 255, 0.015) 0,
      rgba(255, 255, 255, 0.015) 1px,
      transparent 1px,
      transparent 24px
    );
  box-shadow:
    0 12px 26px rgba(0, 0, 0, 0.24),
    0 0 0 1px color-mix(in srgb, var(--accent) 8%, transparent) inset;
}

.message-row {
  display: flex;
  margin-bottom: 14px;
  animation: message-enter 220ms ease-out;
}

.message-row.is-user {
  justify-content: flex-end;
}

.message-row.is-ai {
  justify-content: flex-start;
}

.message-shell {
  width: 76%;
  display: grid;
  gap: 6px;
}

.message-row.is-user .message-shell {
  justify-items: end;
}

.message-meta {
  font-size: 13px;
  letter-spacing: 0.02em;
  color: color-mix(in srgb, var(--text-soft) 84%, #fff);
}

.bubble {
  border-radius: 14px;
  padding: 11px 12px;
  font-size: 17px;
  line-height: 1.75;
}

.user-bubble {
  border: 1px solid color-mix(in srgb, #6ee7c8 45%, transparent);
  background:
    linear-gradient(135deg, rgba(33, 96, 84, 0.72), rgba(28, 64, 60, 0.7)),
    rgba(255, 255, 255, 0.02);
  color: #dcfff4;
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.28),
    0 0 0 1px color-mix(in srgb, #67e8d9 12%, transparent) inset;
}

.message-row.is-user .user-bubble {
  max-width: min(84%, 980px);
}

.message-row.is-ai .ai-bubble {
  max-width: min(88%, 1120px);
}

.ai-raw-card {
  border-radius: 16px 16px 16px 6px;
  border: 1px solid color-mix(in srgb, var(--accent-2) 34%, transparent);
  background:
    linear-gradient(180deg, rgba(15, 20, 44, 0.94), rgba(10, 14, 31, 0.96)),
    rgba(255, 255, 255, 0.02);
  box-shadow:
    0 14px 28px rgba(0, 0, 0, 0.28),
    0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent) inset;
  position: relative;
  overflow: hidden;
}

.ai-raw-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 2px;
  background: linear-gradient(90deg, #6bb8ff, #9f87ff, #73efd4);
  opacity: 0.78;
}

.ai-raw-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 66%, transparent);
}

.ai-raw-card__title {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #e8f1ff;
  font-weight: 700;
}

.ai-raw-card__chip {
  font-size: 11px;
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  color: #cddcff;
  background: color-mix(in srgb, #1b2958 86%, transparent);
  padding: 4px 7px;
  border-radius: 999px;
}

.ai-raw-card__time {
  margin-left: auto;
  font-size: 11px;
  color: color-mix(in srgb, #c9d6ff 72%, #8f9ec1);
}

.ai-stream-list {
  display: grid;
  gap: 9px;
}

.ai-stream-line {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  align-items: start;
  border: 1px solid color-mix(in srgb, var(--line) 64%, transparent);
  background: color-mix(in srgb, #0d1530 82%, transparent);
  border-radius: 10px;
  padding: 8px 9px;
  transition: transform 160ms ease, border-color 160ms ease;
}

.ai-stream-line:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 44%, transparent);
}

.ai-stream-line.is-separator {
  border: 0;
  background: transparent;
  padding: 2px 0;
}

.ai-stream-line.is-text {
  border-color: color-mix(in srgb, #8fb8ff 30%, transparent);
}

.ai-stream-line.is-event {
  border-color: color-mix(in srgb, var(--accent-2) 44%, transparent);
}

.ai-stream-line.is-system {
  border-color: color-mix(in srgb, var(--warning) 46%, transparent);
  background: color-mix(in srgb, var(--warning) 12%, #0d1530);
}

.ai-stream-line.is-section {
  border-color: color-mix(in srgb, #7ea9ff 42%, transparent);
  background: color-mix(in srgb, #112146 84%, transparent);
}

.ai-stream-line.is-runtime-empty {
  border-style: dashed;
  border-color: color-mix(in srgb, #9cb0d6 42%, transparent);
  background: color-mix(in srgb, #0b1228 86%, transparent);
}

.ai-stream-separator {
  display: block;
  position: relative;
  padding: 6px 0;
}

.ai-stream-separator::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 1px dashed color-mix(in srgb, var(--accent-2) 46%, transparent);
}

.ai-stream-separator__text {
  position: relative;
  z-index: 1;
  display: inline-block;
  padding: 0 10px;
  font-size: 11px;
  color: color-mix(in srgb, #d8e2ff 75%, #94a3c6);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: color-mix(in srgb, #0d1530 88%, transparent);
}

.ai-stream-badge {
  font-size: 11px;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 4px 6px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--line) 62%, transparent);
  color: #c8d4ff;
  background: color-mix(in srgb, #1c274f 88%, transparent);
}

.ai-stream-head {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.ai-stream-tool {
  font-size: 12px;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent-2) 45%, transparent);
  color: #f0d7ff;
  background: color-mix(in srgb, var(--accent-2) 18%, transparent);
}

.ai-stream-content {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  color: #e8ecff;
  font-size: 16px;
  line-height: 1.75;
}

.ai-stream-raw {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
  color: color-mix(in srgb, #dbe6ff 70%, #9ca9c8);
  opacity: 0.85;
  border-top: 1px dashed color-mix(in srgb, var(--line) 60%, transparent);
  padding-top: 6px;
}

:deep(.chat-compose .el-textarea__inner) {
  font-size: 17px;
  line-height: 1.75;
}

:deep(.chat-compose .el-textarea__inner::placeholder) {
  font-size: 15px;
}

.chat-input-area {
  margin-top: 12px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
}

.chat-compose {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: end;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
}

.chat-send-btn {
  width: 40px;
  height: 40px;
  border: 1px solid color-mix(in srgb, var(--accent) 60%, transparent);
  background:
    radial-gradient(circle at 28% 25%, rgba(255, 255, 255, 0.28), transparent 40%),
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 78%, #11243f), color-mix(in srgb, var(--accent-2) 72%, #2d153f));
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.34);
}

.chat-send-btn:hover {
  transform: translateY(-1px);
}

@keyframes message-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 900px) {
  .chat-messages {
    padding: 14px 10px;
  }

  .message-shell {
    width: 94%;
  }

  .chat-compose {
    grid-template-columns: 1fr;
    padding: 8px;
  }

  .chat-send-btn {
    justify-self: end;
  }
}
</style>
