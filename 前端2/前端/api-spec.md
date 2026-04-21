# 前端对接接口规范建议

本文档用于配合当前 `Vue3 + Vite + Element Plus` 前端项目与 Kali 后端联调。前端约定所有请求均读取用户在“系统设置”中填写的 `backendUrl` 作为基础地址。

## 1. 认证模块

### `POST /api/auth/login`

请求体：

```json
{
  "username": "admin",
  "password": "test"
}
```

响应体：

```json
{
  "token": "jwt-token",
  "user": {
    "username": "admin",
    "role": "test",
    "useBuiltinApi": true
  }
}
```

说明：

- `role=test` 代表测试账号，前端应隐藏 API Key 配置项。
- `useBuiltinApi=true` 代表后端已分配内置大模型能力。
- 推荐直接支持默认测试账号 `admin / test`。

### `POST /api/auth/register`

```json
{
  "username": "analyst",
  "password": "analyst123"
}
```

## 2. 系统设置

### `GET /api/settings`

返回当前用户可见设置项：

```json
{
  "backendUrl": "http://192.168.56.101:8000",
  "mcpEndpoint": "http://192.168.56.101:8000/mcp/health",
  "knowledgeBasePath": "/opt/pentestagent/knowledge",
  "targetHosts": [
    "192.168.56.110 Vulhub-log4j",
    "192.168.56.120 Bugku-demo"
  ],
  "apiKeyConfigured": false
}
```

### `PUT /api/settings`

```json
{
  "backendUrl": "http://192.168.56.101:8000",
  "mcpEndpoint": "http://192.168.56.101:8000/mcp/health",
  "knowledgeBasePath": "/opt/pentestagent/knowledge",
  "targetHosts": [
    "192.168.56.110 Vulhub-log4j"
  ],
  "apiKey": "sk-xxx"
}
```

## 3. 任务管理

### `POST /api/tasks`

```json
{
  "target": "192.168.56.110",
  "machineType": "Vulhub",
  "scanDepth": "深度",
  "toolIds": ["nmap", "nuclei", "dirsearch"]
}
```

失败场景：

```json
{
  "code": "API_KEY_REQUIRED",
  "message": "普通用户必须先配置 API Key 才能发起任务"
}
```

### `GET /api/tasks`

```json
[
  {
    "id": "task-1",
    "name": "Vulhub Log4j 深度扫描",
    "target": "192.168.56.110",
    "machineType": "Vulhub",
    "scanDepth": "深度",
    "toolIds": ["nmap", "nuclei"],
    "status": "运行中",
    "progress": 64,
    "createdAt": "2026-04-02T03:00:00.000Z",
    "owner": "test-admin"
  }
]
```

### `POST /api/tasks/{id}/pause`

### `POST /api/tasks/{id}/resume`

### `POST /api/tasks/{id}/terminate`

### `POST /api/tasks/{id}/rerun`

### `DELETE /api/tasks/{id}`

## 4. 日志流

### `GET /api/tasks/{id}/logs`

```json
[
  {
    "id": "log-1",
    "time": "2026-04-02T03:10:00.000Z",
    "tool": "nuclei",
    "severity": "Critical",
    "message": "命中 Log4Shell 模板"
  }
]
```

### `GET /api/tasks/{id}/stream`

建议使用以下两种方式之一：

- `text/event-stream` 的 SSE 推送
- WebSocket 推送

事件负载建议：

```json
{
  "type": "task.log",
  "taskId": "task-1",
  "payload": {
    "time": "2026-04-02T03:15:00.000Z",
    "tool": "nuclei",
    "severity": "High",
    "message": "识别到可疑回显"
  }
}
```

## 5. 工具管理

### `GET /api/tools`

```json
[
  {
    "id": "nmap",
    "name": "Nmap",
    "version": "7.95",
    "status": true,
    "args": "-sV -T4",
    "category": "资产探测"
  }
]
```

### `PUT /api/tools/{id}`

```json
{
  "status": true,
  "args": "-sV -Pn"
}
```

### `POST /api/tools/{id}/test`

```json
{
  "target": "192.168.56.110"
}
```

## 6. 报告模块

### `POST /api/reports`

```json
{
  "taskId": "task-1",
  "title": "自动化渗透测试报告",
  "modules": ["执行摘要", "漏洞清单", "修复建议"]
}
```

### `GET /api/reports/{id}`

### `GET /api/reports/{id}/export?format=markdown`

### `GET /api/reports/{id}/export?format=pdf`

## 7. 状态检测

### `GET /api/health`

```json
{
  "backend": "ok",
  "mcp": "ok",
  "knowledgeBase": "ok"
}
```
