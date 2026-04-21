<script setup>
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const store = useAppStore()
const { isAuthenticated } = storeToRefs(store)

const stats = [
  { number: '75+', suffix: '武器库', label: '深度集成前沿扫描与漏洞利用工具' },
  { number: '4', suffix: '步闭环', label: '从任务下发到专业报告导出的极速路径' },
  { number: '1', suffix: '屏洞察', label: '数据可视化驱动决策' },
  { number: '24/7', suffix: '响应', label: '零时差自动化防御评估' }
]

function openAuth(tab) {
  router.push({ name: 'login', query: { tab } })
}

function enterWorkspace() {
  if (isAuthenticated.value) {
    router.push({ name: 'tasks' })
    return
  }

  openAuth('login')
}
</script>

<template>
  <div class="landing-page">
    <div class="landing-shell">
      <header class="landing-header">
        <div class="landing-brand"></div>
        <nav class="landing-nav">
          <button v-if="!isAuthenticated" type="button" class="landing-link" @click="openAuth('register')">注册</button>
          <button type="button" class="landing-cta" @click="enterWorkspace">登录</button>
        </nav>
      </header>

      <section class="landing-hero">
        <div class="landing-kicker">AUTOMATED PENTEST WORKSPACE</div>
        <h1 class="landing-title">
          无可遁形
          <span>自动化渗透执行与交付</span>
        </h1>
        <p class="landing-copy">
          专为实战交付打造的自动化渗透工作流。一键发起深度探测，全链路追踪攻击路径，让潜藏的安全漏洞无所遁形。
        </p>

        <div class="landing-command">
          <div class="landing-command__label">Command Access</div>
          <div class="landing-command__box">
            <button type="button" class="landing-command__trigger" @click="enterWorkspace">
              启动自动化渗透工作流
            </button>
            <button
              type="button"
              class="landing-command__submit"
              @click="isAuthenticated ? enterWorkspace() : openAuth('login')"
            >
              →
            </button>
          </div>
        </div>
      </section>

      <section class="landing-stats">
        <article v-for="item in stats" :key="item.label" class="landing-stat">
          <strong class="landing-stat__title">
            <span class="landing-stat__number">{{ item.number }}</span>
            <span class="landing-stat__suffix">{{ item.suffix }}</span>
          </strong>
          <span>{{ item.label }}</span>
        </article>
      </section>
    </div>
  </div>
</template>
