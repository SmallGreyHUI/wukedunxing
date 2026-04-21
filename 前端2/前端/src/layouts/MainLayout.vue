<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

const menuItems = [
  {
    index: '/app/dashboard',
    label: '安全总览',
    icon: 'DataAnalysis',
    brief: '全局资产与威胁态势监控',
    eyebrow: 'Customer Security Workspace'
  },
  {
    index: '/app/tasks',
    label: '任务管理',
    icon: 'Operation',
    brief: '渗透指令与全链路追踪',
    eyebrow: 'Task Operations'
  },
  {
    index: '/app/reports',
    label: '报告中心',
    icon: 'Document',
    brief: '实战成果与标准化交付',
    eyebrow: 'Report Delivery'
  },
  {
    index: '/app/settings',
    label: '系统设置',
    icon: 'Setting',
    brief: '模型提供商与密钥配置',
    eyebrow: 'Model Settings'
  }
]

const currentMenuItem = computed(() => menuItems.find((item) => item.index === route.path))
const currentTitle = computed(() => currentMenuItem.value?.label || '自动化渗透测试系统')
const currentEyebrow = computed(() => currentMenuItem.value?.eyebrow || 'Workspace')
const currentUserLabel = computed(() => store.currentUser?.username || '未命名用户')
const latestRunningTask = computed(() => {
  return [...store.tasks]
    .filter((item) => item.status === '运行中')
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] || null
})
const latestRunningTaskHasCritical = computed(() => {
  return Boolean(latestRunningTask.value?.logs?.some((log) => log.severity === 'Critical'))
})
const routeTransitionKey = computed(() => route.fullPath)
let pollingTimer = null
let disposed = false

function handleMenu(index) {
  router.push(index)
}

function logout() {
  store.logout()
  router.push({ name: 'home' })
}

onMounted(async () => {
  await Promise.all([store.loadSettings(), store.loadTasks(), store.loadTools(), store.loadReports()])

  const schedulePoll = async () => {
    if (disposed) return
    await store.loadTasks()

    if (store.selectedTaskId) {
      await store.loadTaskLogs(store.selectedTaskId)
    }

    const hasRunningTask = store.tasks.some((item) => item.status === '运行中')
    const nextDelay = hasRunningTask ? 5000 : 15000
    pollingTimer = window.setTimeout(schedulePoll, nextDelay)
  }

  pollingTimer = window.setTimeout(schedulePoll, 3000)
})

onBeforeUnmount(() => {
  disposed = true
  if (pollingTimer) {
    window.clearTimeout(pollingTimer)
    pollingTimer = null
  }
})
</script>

<template>
  <div class="shell">
    <aside class="shell-sidebar">
      <div class="sidebar-noise"></div>

      <div class="brand-card">
        <div>
          <h1>无可遁形</h1>
          <p>AUTOMATED PENTEST & EXPLOIT</p>
        </div>
      </div>

      <el-menu
        class="shell-menu"
        :default-active="route.path"
        background-color="transparent"
        text-color="#9db0c8"
        active-text-color="#ffffff"
        @select="handleMenu"
      >
        <el-menu-item v-for="item in menuItems" :key="item.index" :index="item.index">
          <el-icon><component :is="item.icon" /></el-icon>
          <div class="menu-copy">
            <span>{{ item.label }}</span>
            <small>{{ item.brief }}</small>
          </div>
        </el-menu-item>
      </el-menu>

      <div class="sidebar-divider" aria-hidden="true"></div>

      <section
        class="sidebar-runtime-card"
        :class="{ 'is-critical': latestRunningTaskHasCritical }"
      >
        <div class="sidebar-runtime-card__head">
          <span class="sidebar-runtime-card__eyebrow">任务运行状态</span>
          <span class="sidebar-runtime-card__badge">
            {{ latestRunningTask ? latestRunningTask.status : '空闲' }}
          </span>
        </div>
        <template v-if="latestRunningTask">
          <strong class="sidebar-runtime-card__title">{{ latestRunningTask.name }}</strong>
          <p class="sidebar-runtime-card__meta">
            {{ latestRunningTask.target }} · {{ latestRunningTask.scanDepth }}
          </p>
        </template>
        <template v-else>
          <strong class="sidebar-runtime-card__title">当前没有运行中的任务</strong>
        </template>
      </section>

      <div class="sidebar-footer">
        <div class="sidebar-user-card">
          <el-dropdown trigger="click" popper-class="user-menu-dropdown">
            <button type="button" class="user-chip user-chip--trigger user-chip--sidebar">
              <el-icon><User /></el-icon>
              <span>{{ currentUserLabel }}</span>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="logout">退出</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </aside>

    <section class="shell-main">
      <header class="shell-header">
        <div class="shell-header__title-row">
          <h2>{{ currentTitle }}</h2>
          <div class="eyebrow shell-header__eyebrow">{{ currentEyebrow }}</div>
        </div>
      </header>

      <main class="page-content">
        <router-view v-slot="{ Component }">
          <transition name="page-fade-slide" mode="out-in">
            <component :is="Component" :key="routeTransitionKey" />
          </transition>
        </router-view>
      </main>
    </section>
  </div>
</template>
