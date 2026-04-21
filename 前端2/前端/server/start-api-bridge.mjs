import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import http from 'node:http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const pentestOnly = args.includes('--pentest-only')
const host = process.env.HOST || '0.0.0.0'
const port = String(process.env.PORT || '8000')

function waitForever() {
  setInterval(() => {
    // Keep bridge process alive when reusing an existing backend.
  }, 60_000)
}

function probeHealth() {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port: Number(port),
        path: '/api/health',
        timeout: 1500,
        headers: {
          Accept: 'application/json'
        }
      },
      (res) => {
        const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 300
        res.resume()
        resolve(Boolean(ok))
      }
    )

    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

function resolvePentestagentRoot() {
  const candidates = [
    process.env.PENTESTAGENT_DIR,
    path.resolve(frontendRoot, '..', '..', 'pentestagent'),
    path.resolve(frontendRoot, '..', 'pentestagent')
  ].filter(Boolean)

  return candidates.find((dir) => {
    const marker = path.join(dir, 'pentestagent', 'interface', 'web_api.py')
    return existsSync(marker)
  })
}

function startLocalMock() {
  console.log('[api-bridge] 启动本地 Node mock API: server/index.mjs')
  const child = spawn(process.execPath, [path.join(__dirname, 'index.mjs')], {
    cwd: frontendRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      HOST: host,
      PORT: port
    }
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code || 0)
  })
}

function startPentestApi(pentestRoot) {
  const pythonCandidates = [
    process.env.PENTESTAGENT_PYTHON,
    path.resolve(frontendRoot, '..', '..', 'my_venv', 'bin', 'python'),
    path.resolve(frontendRoot, '..', 'my_venv', 'bin', 'python'),
    'python3',
    'python'
  ].filter(Boolean)

  const python = pythonCandidates.find((candidate) => {
    if (candidate === 'python3' || candidate === 'python') return true
    return existsSync(candidate)
  })

  console.log(`[api-bridge] 启动 pentestagent web_api: ${pentestRoot}`)

  const webApiPath = path.join(pentestRoot, 'pentestagent', 'interface', 'web_api.py')

  const runCode = [
    'import asyncio',
    'import runpy',
    `mod = runpy.run_path(${JSON.stringify(webApiPath)})`,
    `asyncio.run(mod['run_frontend_web_api'](host=${JSON.stringify(host)}, port=${Number(port)}))`
  ].join('; ')

  const child = spawn(
    python,
    ['-c', runCode],
    {
      cwd: pentestRoot,
      stdio: 'inherit',
      env: process.env
    }
  )

  child.on('error', (error) => {
    console.error(`[api-bridge] 启动 pentestagent 失败: ${error.message}`)
    if (pentestOnly) {
      process.exit(1)
      return
    }
    console.warn('[api-bridge] 自动回退到本地 Node mock API')
    startLocalMock()
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }

    if (code === 0) {
      process.exit(0)
      return
    }

    console.error(`[api-bridge] pentestagent 已退出，code=${code}`)

    if (code === 1) {
      probeHealth().then((healthy) => {
        if (healthy) {
          console.log(`[api-bridge] 检测到现有后端正在监听 :${port}，已复用该服务`) 
          waitForever()
          return
        }

        if (pentestOnly) {
          process.exit(code || 1)
          return
        }

        console.warn('[api-bridge] 自动回退到本地 Node mock API')
        startLocalMock()
      })
      return
    }

    if (pentestOnly) {
      process.exit(code || 1)
      return
    }

    console.warn('[api-bridge] 自动回退到本地 Node mock API')
    startLocalMock()
  })
}

const existingHealthyBackend = await probeHealth()
if (existingHealthyBackend) {
  console.log(`[api-bridge] 检测到现有后端正在监听 :${port}，无需重复启动`)
  waitForever()
} else {
  const pentestRoot = resolvePentestagentRoot()
  if (!pentestRoot) {
    console.warn('[api-bridge] 未找到 pentestagent 项目目录')
    if (pentestOnly) {
      process.exit(1)
    } else {
      startLocalMock()
    }
  } else {
    startPentestApi(pentestRoot)
  }
}