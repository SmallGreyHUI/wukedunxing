前端
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

后端
<div align="center">

<img src="assets/pentestagent-logo.png" alt="PentestAgent Logo" width="220" style="margin-bottom: 20px;"/>

# PentestAgent
### AI Penetration Testing

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/) [![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE.txt) [![Version](https://img.shields.io/badge/Version-0.2.0-orange.svg)](https://github.com/GH05TCREW/pentestagent/releases) [![Security](https://img.shields.io/badge/Security-Penetration%20Testing-red.svg)](https://github.com/GH05TCREW/pentestagent) [![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://github.com/GH05TCREW/pentestagent)

</div>

https://github.com/user-attachments/assets/a67db2b5-672a-43df-b709-149c8eaee975

## Requirements

- Python 3.10+
- API key for OpenAI, Anthropic, or other LiteLLM-supported provider

## Install

```bash
# Clone
git clone https://github.com/GH05TCREW/pentestagent.git
cd pentestagent

# Setup (creates venv, installs deps)
.\scripts\setup.ps1   # Windows
./scripts/setup.sh    # Linux/macOS

# Or manual
python -m venv venv
.\venv\Scripts\Activate.ps1  # Windows
source venv/bin/activate     # Linux/macOS
pip install -e ".[all]"
playwright install chromium  # Required for browser tool
```

## Configure

Create `.env` in the project root:

```
OPENAI_API_KEY=your-zai-compatible-key
TAVILY_API_KEY=tvly-...  # optional, enables web_search tool
PENTESTAGENT_MODEL=zai/glm-5.1
PENTESTAGENT_AVAILABLE_MODELS=zai/glm-5.1,zai/glm-4.7
```

切换到 GLM 4.7：

```
PENTESTAGENT_MODEL=zai/glm-4.7
```

运行时也可切换：

```bash
pentestagent run -t 192.168.1.1 -m zai/glm-5.1 "recon target"
pentestagent run -t 192.168.1.1 -m zai/glm-4.7 "recon target"
```

在 TUI 中可用 `/model` 查看当前模型，用 `/model zai/glm-4.7` 或 `/model zai/glm-5.1` 进行切换。

## Run

```bash
pentestagent                    # Launch TUI
pentestagent -t 192.168.1.1     # Launch with target
pentestagent --docker           # Run tools in Docker container
```

## Frontend API Bridge

If you want to connect a separate Vue frontend to PentestAgent, start the built-in
frontend-compatible API server:

```bash
pentestagent web_api --host 0.0.0.0 --port 8000
```

The server provides routes used by the dashboard, such as:

- `POST /api/auth/login`
- `GET/PUT /api/settings`
- `GET/POST /api/tasks`
- `POST /api/tasks/{id}/chat` (SSE)
- `GET/PUT/POST /api/tools...`
- `GET/POST /api/reports...`
- `GET /api/health`

Data is stored under `workspaces/frontend_api/`.

## Docker

Run tools inside a Docker container for isolation and pre-installed pentesting tools.

### Option 1: Pull pre-built image (fastest)

```bash
# Base image with nmap, netcat, curl
docker run -it --rm \
  -e ANTHROPIC_API_KEY=your-key \
  -e PENTESTAGENT_MODEL=claude-sonnet-4-20250514 \
  ghcr.io/gh05tcrew/pentestagent:latest

# Kali image with metasploit, sqlmap, hydra, etc.
docker run -it --rm \
  -e ANTHROPIC_API_KEY=your-key \
  ghcr.io/gh05tcrew/pentestagent:kali
```

### Option 2: Build locally

```bash
# Build
docker compose build

# Run
docker compose run --rm pentestagent

# Or with Kali
docker compose --profile kali build
docker compose --profile kali run --rm pentestagent-kali
```

The container runs PentestAgent with access to Linux pentesting tools. The agent can use `nmap`, `msfconsole`, `sqlmap`, etc. directly via the terminal tool.

Requires Docker to be installed and running.

## Modes

PentestAgent has three modes, accessible via commands in the TUI:

| Mode | Command | Description |
|------|---------|-------------|
| Assist | `/assist <task>` | One single-shot instruction, with tool execution |
| Agent | `/agent <task>` | Autonomous execution of a single task. |
| Crew | `/crew <task>` | Multi-agent mode. Orchestrator spawns specialized workers. |
| Interact | `/interact <task>` | Interactive mode. Chat with the agent, it will help you and guide during the pentesting procedure |

### TUI Commands

```
/assist <task>    One single-shot instruction.
/agent <task>     Run autonomous agent on task
/crew <task>      Run multi-agent crew on task
/interact <task> Chat with the agent in guided mode
/target <host>    Set target
/tools            List available tools
/notes            Show saved notes
/report           Generate report from session
/memory           Show token/memory usage
/prompt           Show system prompt
/mcp <list/add>   Visualizes or adds a new MCP server.
/clear            Clear chat and history
/quit             Exit (also /exit, /q)
/help             Show help (also /h, /?)
```

Press `Esc` to stop a running agent. `Ctrl+Q` to quit.

## Playbooks

PentestAgent includes prebuilt **attack playbooks** for black-box security testing. Playbooks define a structured approach to specific security assessments.

**Run a playbook:**

```bash
pentestagent run -t example.com --playbook thp3_web
```

![Playbook Demo](assets/playbook.gif)

## Tools

PentestAgent includes built-in tools and supports MCP (Model Context Protocol) for extensibility.

**Built-in tools:** `terminal`, `browser`, `notes`, `web_search` (requires `TAVILY_API_KEY`)

### MCP Integration

PentestAgent supports MCP (Model Context Protocol) servers. Configure `mcp_servers.json` for any MCP servers they intend to use. Example
config (place under `mcp_servers.json`):

```json
{
  "mcpServers": {
    "nmap": {
      "command": "npx",
      "args": ["-y", "gc-nmap-mcp"],
      "env": {
        "NMAP_PATH": "/usr/bin/nmap"
      }
    }
  }
}
```

### CLI Tool Management

```bash
pentestagent tools list         # List all tools
pentestagent tools info <name>  # Show tool details
pentestagent mcp list           # List MCP servers
pentestagent mcp add <name> <command> [args...]  # Add MCP server
pentestagent mcp test <name>    # Test MCP connection
```

## Knowledge

- **RAG:** Place methodologies, CVEs, or wordlists in `pentestagent/knowledge/sources/` for automatic context injection.
- **Notes:** Agents save findings to `loot/notes.json` with categories (`credential`, `vulnerability`, `finding`, `artifact`). Notes persist across sessions and are injected into agent context.
- **Shadow Graph:** In Crew mode, the orchestrator builds a knowledge graph from notes to derive strategic insights (e.g., "We have credentials for host X").

## Project Structure

```
pentestagent/
  agents/         # Agent implementations
  config/         # Settings and constants
  interface/      # TUI and CLI
  knowledge/      # RAG system and shadow graph
  llm/            # LiteLLM wrapper
  mcp/            # MCP client and server configs
  playbooks/      # Attack playbooks
  runtime/        # Execution environment
  tools/          # Built-in tools
```

## Development

```bash
pip install -e ".[dev]"
pytest                       # Run tests
pytest --cov=pentestagent    # With coverage
black pentestagent           # Format
ruff check pentestagent      # Lint
```

## Legal

Only use against systems you have explicit authorization to test. Unauthorized access is illegal.

## License

MIT