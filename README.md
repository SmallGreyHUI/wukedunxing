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

## 使用说明
-安全控制页面用于查询观察各个项目的运行日志
-任务创建页面创建新项目，要先选择新的靶子属于哪个靶场，再输入靶子所在的靶场IP，AI会在交互界面创建了自动渗透测试的工作台，选择AI运行模式（assist/agent/crew），根据任务难度，选择智谱-4.7或5.1版本，避免消耗资源，然后在聊天框中输入靶机IP和端口号，让大模型进行规划和测试，最终生成报告
-报告中心页面选择我们运行过的项目，点击生成报告，会在右侧结构化预览中生成报告的具体形式，此时可以点生成MarkDown文件或pdf文件将报告保存为外部文件形式
-系统设置页面可以对模型名称和API Key进行填写，可以使用自己想要使用的大模型保存到系统当中

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

# PentestAgent
### AI Penetration Testing

## 环境要求

- Python 3.10+
- API key for OpenAI, Anthropic, or other LiteLLM-supported provider

## 安装

```bash
# 克隆
git clone https://github.com/GH05TCREW/pentestagent.git
cd pentestagent

# 设置 (创建虚拟环境，安装依赖)
.\scripts\setup.ps1   # Windows
./scripts/setup.sh    # Linux/macOS

# 手动设置
python -m venv venv
.\venv\Scripts\Activate.ps1  # Windows
source venv/bin/activate     # Linux/macOS
pip install -e ".[all]"
playwright install chromium  # Required for browser tool
```

## 配置

在醒目根目录创建.env文件：
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

## 运行

```bash
pentestagent                    # Launch TUI
pentestagent -t 192.168.1.1     # Launch with target
pentestagent --docker           # Run tools in Docker container
```

## 前端API桥接

如果你想将独立的 Vue 前端连接到 PentestAgent，请启动内置的兼容前端的 API 服务：

```bash
pentestagent web_api --host 0.0.0.0 --port 8000
```

该服务提供仪表板使用的路由，例如：
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

### 选项1：拉取预构建镜像

```bash
# 包含 nmap, netcat, curl的基础镜像
docker run -it --rm \
  -e ANTHROPIC_API_KEY=your-key \
  -e PENTESTAGENT_MODEL=claude-sonnet-4-20250514 \
  ghcr.io/gh05tcrew/pentestagent:latest

# 包含 metasploit, sqlmap ,hydra 等的 Kali 镜像
docker run -it --rm \
  -e ANTHROPIC_API_KEY=your-key \
  ghcr.io/gh05tcrew/pentestagent:kali
```

### 选项 2: 本地构建

```bash
# 构建
docker compose build

# 运行
docker compose run --rm pentestagent

# 或使用 Kali
docker compose --profile kali build
docker compose --profile kali run --rm pentestagent-kali
```

容器运行 PentestAgent 并可以访问 Linux 渗透测试工具。 代理 (agent) 可以直接通过 terminal 工具使用 nmap、msfconsole、sqlmap 等。

需要安装并运行 Docker。

## 模式

PentestAgent具有三种模式，可通过 TUI 中的命令访问：

| 模式| 命令 | 描述 |
|------|---------|-------------|
| Assist | `/assist <task>` | One single-shot instruction, with tool execution |
| Agent | `/agent <task>` | Autonomous execution of a single task. |
| Crew | `/crew <task>` | Multi-agent mode. Orchestrator spawns specialized workers. |
| Interact | `/interact <task>` | Interactive mode. Chat with the agent, it will help you and guide during the pentesting procedure |

### TUI 命令

|命令|描述|
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

按 Esc 停止运行中的代理。按 Ctrl+Q 退出。

## Playbooks

PentestAgent 包含用于黑盒安全测试的预构建 attack playbooks。Playbooks 为特定的安全评估定义了结构化的方法。 

**运行 playbook:**

```bash
pentestagent run -t example.com --playbook thp3_web
```

![Playbook Demo](assets/playbook.gif)

## 工具

PentestAgent 包含内置工具，并支持 MCP (Model Context Protocol) 以实现扩展性。
 内置工具： terminal, browser, notes, web_search（需要 TAVILY_API_KEY）

### MCP 集成

PentestAgent 支持 MCP (Model Context Protocol) 服务器。为计划使用的任何 MCP 服务器配置 mcp_servers.json。 
配置示例（放置在 mcp_servers.json 下）：

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

### CLI 工具管理

```bash
pentestagent tools list         # List all tools
pentestagent tools info <name>  # Show tool details
pentestagent mcp list           # List MCP servers
pentestagent mcp add <name> <command> [args...]  # Add MCP server
pentestagent mcp test <name>    # Test MCP connection
```

## 知识库

- **RAG:** Place methodologies, CVEs, or wordlists in `pentestagent/knowledge/sources/` for automatic context injection.
- **Notes:** Agents save findings to `loot/notes.json` with categories (`credential`, `vulnerability`, `finding`, `artifact`). Notes persist across sessions and are injected into agent context.
- **Shadow Graph:** In Crew mode, the orchestrator builds a knowledge graph from notes to derive strategic insights (e.g., "We have credentials for host X").

## 项目结构

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

## 开发

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
