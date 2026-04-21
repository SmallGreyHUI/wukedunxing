<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { getTaskMajorVulnCves } from '@/utils/tasks'

const store = useAppStore()
const now = ref(Date.now())
const severityFilter = ref('All')
const arenaFilter = ref('Vulhub')
const selectedArenaTaskId = ref('')
let timer = null

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) {
    window.clearInterval(timer)
  }
})

const demoLogs = [
  {
    id: 'demo-log-1',
    time: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    tool: 'nmap',
    severity: 'Info',
    message: '已识别目标主机开放端口 80、443 和 22。'
  },
  {
    id: 'demo-log-2',
    time: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    tool: 'nuclei',
    severity: 'High',
    message: '发现管理后台存在默认路径暴露风险。'
  },
  {
    id: 'demo-log-3',
    time: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
    tool: 'system',
    severity: 'Critical',
    message: '高危组件命中可利用模板，建议立即复核。'
  },
  {
    id: 'demo-log-4',
    time: new Date(Date.now() - 45 * 1000).toISOString(),
    tool: 'crawler',
    severity: 'Info',
    message: '已完成站点目录爬取，新增 18 个可访问路径。'
  },
  {
    id: 'demo-log-5',
    time: new Date(Date.now() - 30 * 1000).toISOString(),
    tool: 'dirsearch',
    severity: 'Medium',
    message: '发现 /backup/ 目录返回 403，建议继续验证是否存在可列目录风险。'
  },
  {
    id: 'demo-log-6',
    time: new Date(Date.now() - 18 * 1000).toISOString(),
    tool: 'sqlmap',
    severity: 'High',
    message: '参数 id 出现异常响应差异，已加入 SQL 注入候选队列。'
  },
  {
    id: 'demo-log-7',
    time: new Date(Date.now() - 8 * 1000).toISOString(),
    tool: 'agent',
    severity: 'Info',
    message: '正在整理阶段性发现，准备生成下一步验证计划。'
  }
]
const metrics = computed(() => [
  { label: '漏洞检测率', value: '98.7%', eyebrow: 'Completed Delivery' },
  { label: '误码率', value: '2.8%', eyebrow: 'Tool Availability' },
  { label: 'CVE 覆盖度', value: '6.2%', eyebrow: 'Risk Snapshot' },
  { label: 'MCP 工具集成', value: '75+', eyebrow: 'Integration Scale' }
])

function normalizeArenaLabel(machineType) {
  const value = String(machineType || '').trim().toLowerCase()
  if (value === 'vulnhub') return 'VulnHub'
  return 'Vulhub'
}

function getArenaFullName(machineType) {
  const arena = normalizeArenaLabel(machineType)
  return arena === 'VulnHub' ? 'VulnHub 靶场' : 'Vulhub 靶场'
}

function getTaskVulnTypes(task) {
  const cves = getTaskMajorVulnCves(task, 2)
  if (cves.length) return cves.join(' / ')
  return '未识别漏洞类型'
}

const arenaOptions = ['Vulhub', 'VulnHub']

const arenaTasks = computed(() =>
  store.tasks.filter((item) => normalizeArenaLabel(item.machineType) === arenaFilter.value)
)

const spotlightTask = computed(
  () => arenaTasks.value.find((item) => item.status === '运行中') || arenaTasks.value[0] || null
)

const selectedArenaTask = computed(
  () => arenaTasks.value.find((item) => item.id === selectedArenaTaskId.value) || spotlightTask.value || null
)

const spotlight = computed(() => {
  if (!selectedArenaTask.value) {
    return {
      title: '暂无任务正在执行',
      description: '创建任务后，这里会突出展示当前最值得关注的一条执行链路。',
      meta: ['等待任务创建', '等待环境接入']
    }
  }

  return {
    title: selectedArenaTask.value.name,
    description: `当前目标 ${selectedArenaTask.value.target} 正在进行 ${selectedArenaTask.value.scanDepth} 扫描，适合继续查看进度、日志与风险输出。`,
    meta: [selectedArenaTask.value.machineType, selectedArenaTask.value.status, selectedArenaTask.value.owner]
  }
})

const severityOptions = ['All', 'Info', 'Medium', 'High', 'Critical']

const spotlightLogs = computed(() => {
  const logs = selectedArenaTask.value?.logs || []
  return logs.length ? logs : demoLogs
})

const filteredLogs = computed(() => {
  if (severityFilter.value === 'All') return spotlightLogs.value
  return spotlightLogs.value.filter((log) => log.severity === severityFilter.value)
})

watch(
  () => arenaTasks.value,
  (tasks) => {
    if (!tasks.length) {
      selectedArenaTaskId.value = ''
      return
    }

    if (tasks.some((item) => item.id === selectedArenaTaskId.value)) {
      return
    }

    const preferred = tasks.find((item) => item.status === '运行中') || tasks[0]
    selectedArenaTaskId.value = preferred?.id || ''
  },
  { immediate: true, deep: true }
)

watch(
  () => selectedArenaTask.value?.id,
  async (taskId) => {
    if (!taskId) return
    await store.loadTaskLogs(taskId)
  },
  { immediate: true }
)

function severityClass(level) {
  if (level === 'Critical') return 'is-critical'
  if (level === 'High') return 'is-high'
  if (level === 'Medium') return 'is-medium'
  return 'is-info'
}
</script>

<template>
  <div class="view-grid">
    <section class="glass-card spotlight-panel hover-lift hover-spotlight">
      <div>
        <div class="eyebrow">Current Focus</div>
        <h3>{{ spotlight.title }}</h3>
        <p>{{ spotlight.description }}</p>
      </div>
      <div class="spotlight-meta">
        <span v-for="item in spotlight.meta" :key="item">{{ item }}</span>
      </div>
    </section>

    <div class="metrics-grid">
      <div v-for="item in metrics" :key="item.label" class="metric-panel glass-card hover-lift hover-spotlight">
        <div class="eyebrow">{{ item.eyebrow }}</div>
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </div>
    </div>

    <section class="glass-card task-list-panel">
      <div class="section-head">
        <div>
          <div class="eyebrow">Live Stream</div>
          <h3>实时日志</h3>
        </div>        <div class="severity-filter" aria-label="按靶场筛选">
          <button
            v-for="arena in arenaOptions"
            :key="arena"
            type="button"
            class="severity-filter__item"
            :class="{ active: arenaFilter === arena }"
            @click="arenaFilter = arena"
          >
            {{ getArenaFullName(arena) }}
          </button>
        </div>
      </div>

      <div class="severity-filter" aria-label="当前靶场项目列表" style="margin-bottom: 10px;">
        <button
          v-for="task in arenaTasks"
          :key="task.id"
          type="button"
          class="severity-filter__item"
          :class="{ active: selectedArenaTaskId === task.id }"
          @click="selectedArenaTaskId = task.id"
        >
          {{ getArenaFullName(task.machineType) }} · {{ task.target }} · {{ getTaskVulnTypes(task) }}
        </button>
      </div>

      <div v-if="selectedArenaTask" class="item-head">
        <div>
          <strong class="task-title-line">
            <span>{{ selectedArenaTask.target }}</span>
            <span class="task-runtime">{{ new Date(now).toLocaleString('zh-CN', { hour12: false }) }}</span>
          </strong>
          <div class="item-meta">
            <span>{{ getArenaFullName(selectedArenaTask.machineType) }}</span>
            <span>{{ selectedArenaTask.scanDepth }}</span>
            <span>{{ selectedArenaTask.status }}</span>
          </div>
        </div>
        <el-button class="log-refresh-btn" @click="store.loadTaskLogs(selectedArenaTask.id)">刷新</el-button>
      </div>

      <el-empty v-else description="当前靶场暂无项目" />

      <div v-if="selectedArenaTask" class="log-list">
        <div v-for="log in filteredLogs" :key="log.id" class="log-item">
          <div class="log-item__meta">
            <div class="log-item__meta-main">
              <span>{{ new Date(log.time).toLocaleString('zh-CN', { hour12: false }) }}</span>
              <span class="log-item__tool">{{ log.tool }}</span>
            </div>
            <span class="log-item__severity" :class="severityClass(log.severity)">
              {{ log.severity }}
            </span>
          </div>
          <div>{{ log.message }}</div>
        </div>
      </div>
    </section>
  </div>
</template>
