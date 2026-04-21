<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { healthApi } from '@/api/modules'
import { useAppStore } from '@/stores/app'

const store = useAppStore()

const form = reactive({
  model: '',
  apiBaseUrl: '',
  apiKey: '',
  backendUrl: '',
  mcpEndpoint: '',
  knowledgeBasePath: '',
  targetHostsText: ''
})
const toolTestTarget = ref('127.0.0.1')

function syncFromStore() {
  form.model = store.settings.model
  form.apiBaseUrl = store.settings.apiBaseUrl
  form.apiKey = store.settings.apiKey
  form.backendUrl = store.settings.backendUrl || store.settings.apiBaseUrl || ''
  form.mcpEndpoint = store.settings.mcpEndpoint || ''
  form.knowledgeBasePath = store.settings.knowledgeBasePath || ''
  form.targetHostsText = Array.isArray(store.settings.targetHosts) ? store.settings.targetHosts.join('\n') : ''
}

async function save() {
  const targetHosts = form.targetHostsText
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)

  await store.saveSettings({
    model: form.model.trim(),
    apiBaseUrl: form.apiBaseUrl.trim(),
    apiKey: form.apiKey.trim(),
    backendUrl: form.backendUrl.trim() || form.apiBaseUrl.trim(),
    mcpEndpoint: form.mcpEndpoint.trim(),
    knowledgeBasePath: form.knowledgeBasePath.trim(),
    targetHosts
  })
}

async function checkHealth() {
  try {
    const { data } = await healthApi.check()
    ElMessage.success(`后端状态: ${data.backend}, MCP: ${data.mcp}, 知识库: ${data.knowledgeBase}`)
  } catch {
    ElMessage.warning('健康检查失败，请确认后端地址与服务状态')
  }
}

async function updateTool(tool, payload) {
  await store.saveTool(tool, payload)
  ElMessage.success(`工具 ${tool.name} 设置已保存`)
}

async function testTool(toolId) {
  await store.testTool(toolId, toolTestTarget.value.trim())
}

onMounted(() => {
  syncFromStore()
})
</script>

<template>
  <div class="view-grid">
    <section class="glass-card">
      <div class="section-head">
        <div>
          <div class="eyebrow">Model Settings</div>
          <h3>系统设置</h3>
        </div>
      </div>

      <el-form label-position="top" class="form-stack">
        <el-form-item label="模型名称">
          <el-input v-model="form.model" placeholder="例如 gpt-4o-mini" />
        </el-form-item>

        <el-form-item label="接口 Base URL">
          <el-input v-model="form.apiBaseUrl" placeholder="例如 https://api.openai.com/v1" />
        </el-form-item>

        <el-form-item label="后端服务地址">
          <el-input v-model="form.backendUrl" placeholder="例如 http://192.168.159.132:8001" />
        </el-form-item>

        <el-form-item label="MCP 健康端点">
          <el-input v-model="form.mcpEndpoint" placeholder="例如 http://192.168.159.132:8001/mcp/health" />
        </el-form-item>

        <el-form-item label="知识库路径">
          <el-input v-model="form.knowledgeBasePath" placeholder="例如 /opt/pentestagent/knowledge" />
        </el-form-item>

        <el-form-item label="目标主机列表（每行一个）">
          <el-input v-model="form.targetHostsText" type="textarea" :rows="4" placeholder="192.168.56.110 Vulhub-log4j" />
        </el-form-item>

        <el-form-item label="API Key">
          <el-input v-model="form.apiKey" type="password" show-password placeholder="输入你自己的模型密钥" />
        </el-form-item>

        <el-alert type="info" :closable="false" show-icon>
          保存后，系统会优先使用这里配置的大模型提供商、接口地址和密钥。
        </el-alert>

        <div class="action-row">
          <el-button type="primary" @click="save">保存系统设置</el-button>
          <el-button @click="checkHealth">健康检查</el-button>
        </div>
      </el-form>
    </section>

    <section class="glass-card" style="margin-top: 20px;">
      <div class="section-head">
        <div>
          <div class="eyebrow">Tool Manager</div>
          <h3>工具管理</h3>
        </div>
      </div>

      <el-form label-position="top" class="form-stack">
        <el-form-item label="工具测试目标">
          <el-input v-model="toolTestTarget" placeholder="例如 192.168.56.110" />
        </el-form-item>
      </el-form>

      <el-table :data="store.tools" style="width: 100%">
        <el-table-column prop="name" label="工具" min-width="140" />
        <el-table-column prop="version" label="版本" width="100" />
        <el-table-column label="启用" width="100">
          <template #default="scope">
            <el-switch
              :model-value="scope.row.status"
              @change="(value) => updateTool(scope.row, { status: value })"
            />
          </template>
        </el-table-column>
        <el-table-column label="参数" min-width="260">
          <template #default="scope">
            <el-input
              :model-value="scope.row.args"
              @change="(value) => updateTool(scope.row, { args: value })"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="scope">
            <el-button size="small" @click="testTool(scope.row.id)">测试</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>
