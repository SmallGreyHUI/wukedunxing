import { createRouter, createWebHistory } from 'vue-router'
import { useAppStore } from '@/stores/app'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeLandingView.vue')
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginPanelView.vue'),
    meta: { guestOnly: true }
  },
  {
    path: '/app',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/app/tasks' },
      { path: 'dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
      { path: 'tasks', name: 'tasks', component: () => import('@/views/TasksView.vue') },
      { path: 'reports', name: 'reports', component: () => import('@/views/ReportsView.vue') },
      { path: 'settings', name: 'settings', component: () => import('@/views/SettingsView.vue') }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const store = useAppStore()
  if (!store.initialized) {
    store.initialize()
  }

  if (to.meta.requiresAuth && !store.isAuthenticated) {
    return { name: 'home' }
  }

  if (to.meta.guestOnly && store.isAuthenticated) {
    return { name: 'tasks' }
  }

  return true
})

export default router
