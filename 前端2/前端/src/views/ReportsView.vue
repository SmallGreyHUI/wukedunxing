<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useAppStore } from '@/stores/app'
import { getTaskDisplayName, getTaskMajorVulnCves } from '@/utils/tasks'

const store = useAppStore()
const REPORT_MODULES_STORAGE_KEY = 'a10-pentest-report-modules-draft'
const reportTitle = ref('自动化渗透测试报告')
const form = reactive({
  taskId: '',
  modules: []
})

const currentReport = computed(() => {
  if (!form.taskId) return null
  const selectedId = String(form.taskId)
  return store.reports.find((item) => String(item.taskId) === selectedId) || null
})
const selectedTask = computed(() => store.tasks.find((item) => item.id === form.taskId) || null)

function getReportTaskLabel(task) {
  return getTaskDisplayName(task)
}

function getReportTaskMajorCves(task) {
  return getTaskMajorVulnCves(task, 3)
}

watch(
  () => [store.selectedTaskId, store.tasks],
  () => {
    const exists = store.tasks.some((item) => item.id === form.taskId)
    if (exists) return

    if (store.selectedTaskId && store.tasks.some((item) => item.id === store.selectedTaskId)) {
      form.taskId = store.selectedTaskId
      return
    }

    form.taskId = store.tasks[0]?.id || ''
  },
  { immediate: true, deep: true }
)

const savedReportModules = localStorage.getItem(REPORT_MODULES_STORAGE_KEY)
if (savedReportModules) {
  try {
    const parsed = JSON.parse(savedReportModules)
    form.modules = Array.isArray(parsed) && parsed.length ? parsed : [...store.modules]
  } catch {
    localStorage.removeItem(REPORT_MODULES_STORAGE_KEY)
    form.modules = [...store.modules]
  }
} else if (!form.modules.length) {
  form.modules = [...store.modules]
}

watch(
  () => form.modules,
  (value) => {
    localStorage.setItem(REPORT_MODULES_STORAGE_KEY, JSON.stringify(value))
  },
  { deep: true }
)

async function generate() {
  if (!form.taskId) {
    ElMessage.warning('请先选择任务')
    return
  }

  if (!form.modules.length) {
    ElMessage.warning('请至少选择一个报告模块')
    return
  }

  const report = await store.generateReport({
    taskId: form.taskId,
    title: reportTitle.value,
    modules: form.modules
  })
  form.taskId = report.taskId ? String(report.taskId) : form.taskId
  ElMessage.success(`报告《${report.title}》已生成`)
}

onMounted(async () => {
  await store.loadReports()
})
</script>

<template>
  <div class="grid-two">
    <section class="glass-card">
      <div class="section-head">
        <div>
          <div class="eyebrow">Report Builder</div>
          <h3>报告生成与导出</h3>
        </div>
      </div>

      <div class="section-intro">
        <strong>让报告输出更稳定。</strong>
        <p>选择任务和内容模块后即可生成结构化报告，便于复盘、交付和归档。</p>
      </div>

      <el-form label-position="top" class="form-stack">
        <el-form-item label="选择项目">
          <el-select v-model="form.taskId">
            <el-option
              v-for="task in store.tasks"
              :key="task.id"
              :label="getReportTaskLabel(task)"
              :value="task.id"
            >
              <div class="report-task-option">
                <div class="report-task-option__name">{{ getReportTaskLabel(task) }}</div>
                <div class="report-task-option__meta">
                  主要漏洞：{{ getReportTaskMajorCves(task).join(' / ') || '未识别CVE' }}
                </div>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="报告标题">
          <el-input v-model="reportTitle" />
        </el-form-item>
        <el-form-item label="内容模块">
          <el-checkbox-group v-model="form.modules">
            <div class="checkbox-panel">
              <el-checkbox v-for="item in store.modules" :key="item" :label="item">{{ item }}</el-checkbox>
            </div>
          </el-checkbox-group>
        </el-form-item>
        <div class="action-row">
          <el-button type="primary" @click="generate">生成报告</el-button>
          <el-button :disabled="!currentReport" @click="store.exportReport(currentReport, 'markdown')">导出 Markdown</el-button>
          <el-button :disabled="!currentReport" @click="store.exportReport(currentReport, 'pdf')">导出 PDF</el-button>
        </div>
      </el-form>
    </section>

    <section class="glass-card">
      <div class="section-head">
        <div>
          <div class="eyebrow">Preview</div>
          <h3>结构化预览</h3>
        </div>
        <el-tag v-if="selectedTask" effect="dark">{{ getReportTaskLabel(selectedTask) }}</el-tag>
      </div>
      <pre v-if="currentReport" class="report-preview">{{ currentReport.content }}</pre>
      <el-empty v-else description="生成报告后将在这里预览" />
    </section>
  </div>
</template>

<style scoped>
.report-task-option {
  display: grid;
  gap: 2px;
  line-height: 1.35;
}

.report-task-option__name {
  font-weight: 600;
}

.report-task-option__meta {
  font-size: 12px;
  color: color-mix(in srgb, #ffdba6 82%, #a36a36);
}
</style>
