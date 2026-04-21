# A10 自动化渗透测试前端

基于 `Vue 3 + Vite + Element Plus` 的比赛项目用户前端，提供注册登录、任务管理、工具管理、报告生成与导出等完整流程。

## 功能概览

- 用户注册与登录
- 任务创建、暂停、恢复、重执行、终止、删除
- 工具状态维护与快速测试
- 报告生成、Markdown/PDF 导出
- 本地演示数据兜底，后端不可达时页面仍可运行

## 技术栈

- `Vue 3`
- `Vite`
- `Element Plus`
- `Pinia`
- `Vue Router`
- `Axios`
- `jsPDF`

## 项目结构

```text
.
├─ src
│  ├─ api
│  ├─ layouts
│  ├─ router
│  ├─ stores
│  ├─ styles
│  ├─ utils
│  └─ views
├─ server
├─ index.html
├─ package.json
├─ vite.config.js
├─ vercel.json
└─ netlify.toml
```

## 本地运行

先安装依赖：

```bash
npm install
```

启动本地接口服务：

```bash
npm run api
```

默认会优先启动同级目录的 `pentestagent web_api`（真实交互接口）：

- 优先查找目录：`../../pentestagent`、`../pentestagent`
- 启动命令：`python3 -m pentestagent web_api --host 0.0.0.0 --port 8000`
- 若未找到 pentestagent 或启动失败，会自动回退到本地 Node mock API

你也可以显式指定模式：

```bash
# 仅启动 pentestagent 接口（失败则退出，不回退）
npm run api:pentestagent

# 仅启动本地 Node mock 接口
npm run api:mock
```

如果 pentestagent 不在默认路径，可通过环境变量指定：

```bash
PENTESTAGENT_DIR=/path/to/pentestagent npm run api:pentestagent
```

启动前端开发环境：

```bash
npm run dev
```

生产构建：

```bash
npm run build
```

本地预览构建产物：

```bash
npm run preview
```

## 登录说明

- 默认测试账号：`admin`
- 默认测试密码：`test`
- 也可以在登录页自行注册新账号后登录

登录后即可直接创建任务。默认会请求本地接口；如果后端不可用，任务、工具、报告模块会回退到前端演示流。

## 接口说明

- 前端默认请求接口：`http://192.168.159.132:8001`
- 接口地址优先级：系统设置中的 `接口 Base URL` > 环境变量 `VITE_API_BASE_URL` > 默认本地接口
- 默认对接 pentestagent 的 `web_api` 路由集
- 认证相关接口在 `web_api` 不可用时可由仓库内置 Node 服务兜底
- 任务、工具、报告模块在后端不可用时会自动回退到前端演示流

## 部署说明

### Vercel

- 构建命令：`npm run build`
- 输出目录：`dist`
- 已包含 `vercel.json` 以支持单页应用路由回退

### Netlify

- 构建命令：`npm run build`
- 发布目录：`dist`
- 已包含 `netlify.toml` 以支持单页应用路由回退

## 备注

- 仓库中的 `server/` 提供本地注册登录能力，便于直接演示
- 若接入赛方后端，可按 `api-spec.md` 继续扩展剩余接口
