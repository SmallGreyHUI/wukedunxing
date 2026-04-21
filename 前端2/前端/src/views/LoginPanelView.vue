<script setup>
import { nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const route = useRoute()
const store = useAppStore()
const activeTab = ref('login')
const passwordInput = ref(null)

const loginForm = reactive({
  username: '',
  password: ''
})

const registerForm = reactive({
  username: '',
  password: '',
  confirmPassword: ''
})

const loginPasswordError = ref(false)
const registerPasswordError = ref(false)

watch(
  () => route.query.tab,
  (tab) => {
    activeTab.value = tab === 'register' ? 'register' : 'login'
    loginPasswordError.value = false
    registerPasswordError.value = false
  },
  { immediate: true }
)

async function focusPassword() {
  await nextTick()
  passwordInput.value?.focus()
}

async function handleLogin() {
  loginPasswordError.value = false
  try {
    store.persist()
    await store.login(loginForm)
    ElMessage.success('登录成功')
    router.push({ name: 'tasks' })
  } catch (error) {
    loginPasswordError.value = true
    ElMessage.warning(error?.response?.data?.message || '密码错误，请重新输入。')
  }
}

async function handleRegister() {
  registerPasswordError.value = false
  if (registerForm.password !== registerForm.confirmPassword) {
    registerPasswordError.value = true
    ElMessage.warning('两次密码不一致，请重新输入。')
    return
  }

  store.persist()
  try {
    await store.register({
      username: registerForm.username.trim(),
      password: registerForm.password
    })
    loginForm.username = registerForm.username.trim()
    loginForm.password = ''
    registerForm.password = ''
    registerForm.confirmPassword = ''
    activeTab.value = 'login'
    router.replace({ name: 'login', query: { tab: 'login' } })
  } catch (error) {
    ElMessage.warning(error?.response?.data?.message || '注册失败，请稍后重试。')
  }
}
</script>

<template>
  <div class="auth-page auth-page--single">
    <section class="auth-form-card glass-card auth-form-card--single">
      <div class="auth-top">
        <div>
          <div class="eyebrow">Authentication</div>
          <h2>{{ activeTab === 'login' ? '登录' : '注册' }}</h2>
          <p class="auth-form-card__hint">
            {{ activeTab === 'login' ? '登录后即可进入统一安全工作台。' : '创建新账号后即可切换回登录。' }}
          </p>
        </div>
      </div>

      <div class="auth-switch" role="tablist" aria-label="认证方式切换">
        <button
          type="button"
          class="auth-switch__item"
          :class="{ 'is-active': activeTab === 'login' }"
          @click="activeTab = 'login'"
        >
          登录
        </button>
        <button
          type="button"
          class="auth-switch__item"
          :class="{ 'is-active': activeTab === 'register' }"
          @click="activeTab = 'register'"
        >
          注册
        </button>
      </div>

      <el-form v-if="activeTab === 'login'" label-position="top" @submit.prevent="handleLogin">
        <el-form-item label="用户名">
          <el-input v-model="loginForm.username" @keyup.enter="focusPassword" />
        </el-form-item>
        <el-form-item label="密码" :class="{ 'is-error': loginPasswordError }">
          <el-input
            ref="passwordInput"
            v-model="loginForm.password"
            type="password"
            show-password
            @keyup.enter="handleLogin"
          />
          <p v-if="loginPasswordError" class="auth-field-error">密码错误，请重新输入。</p>
        </el-form-item>
        <el-button type="primary" class="full-width" @click="handleLogin">登录</el-button>
      </el-form>

      <el-form v-else label-position="top" @submit.prevent="handleRegister">
        <el-form-item label="用户名">
          <el-input v-model="registerForm.username" />
        </el-form-item>
        <el-form-item label="密码" :class="{ 'is-error': registerPasswordError }">
          <el-input v-model="registerForm.password" type="password" show-password />
          <p v-if="registerPasswordError" class="auth-field-error">两次密码不一致，请重新输入。</p>
        </el-form-item>
        <el-form-item label="确认密码" :class="{ 'is-error': registerPasswordError }">
          <el-input v-model="registerForm.confirmPassword" type="password" show-password />
        </el-form-item>
        <el-button type="primary" class="full-width" @click="handleRegister">注册</el-button>
      </el-form>
    </section>
  </div>
</template>
