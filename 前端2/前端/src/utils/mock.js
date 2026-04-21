const isoOffset = (minutes) => new Date(Date.now() + minutes * 60 * 1000).toISOString()

export function createDemoState() {
  return {
    auth: {
      user: null,
      token: '',
      initialized: true
    },
    settings: {
      provider: '',
      model: '',
      apiBaseUrl: '',
      apiKey: '',
      backendUrl: '',
      mcpEndpoint: '',
      knowledgeBasePath: '',
      targetHosts: [],
      apiKeyConfigured: false
    },
    tasks: [
      {
        id: 'task-1',
        name: 'Vulhub Log4j 深度扫描',
        target: '192.168.56.110',
        machineType: 'Vulhub',
        scanDepth: '深度',
        toolIds: ['nmap', 'nuclei', 'dirsearch'],
        status: '运行中',
        progress: 68,
        createdAt: isoOffset(-25),
        owner: 'admin',
        logs: [
          { id: 'log-1', time: isoOffset(-24), tool: 'nmap', severity: 'Info', message: '识别开放端口 80/8080/8983。' },
          { id: 'log-2', time: isoOffset(-18), tool: 'nuclei', severity: 'High', message: '发现 Solr 管理面暴露风险。' },
          { id: 'log-3', time: isoOffset(-8), tool: 'nuclei', severity: 'Critical', message: '命中 Log4Shell 相关模板。' }
        ]
      },
      {
        id: 'task-2',
        name: 'Bugku 标准巡检',
        target: '192.168.56.120',
        machineType: 'Bugku PAR',
        scanDepth: '标准',
        toolIds: ['nmap', 'sqlmap', 'whatweb'],
        status: '已完成',
        progress: 100,
        createdAt: isoOffset(-220),
        owner: 'analyst',
        logs: [
          { id: 'log-4', time: isoOffset(-218), tool: 'whatweb', severity: 'Info', message: '识别为 PHP + Apache。' },
          { id: 'log-5', time: isoOffset(-200), tool: 'sqlmap', severity: 'Medium', message: '参数 id 存在可疑注入回显。' }
        ]
      }
    ],
    tools: [
      { id: 'nmap', name: 'Nmap', version: '7.95', status: true, args: '-sV -T4', category: '资产探测' },
      { id: 'nuclei', name: 'Nuclei', version: '3.2.1', status: true, args: '-severity critical,high,medium', category: '模板扫描' },
      { id: 'dirsearch', name: 'Dirsearch', version: '0.4.3', status: true, args: '-x 403,404', category: '目录扫描' },
      { id: 'sqlmap', name: 'SQLMap', version: '1.8.2', status: true, args: '--batch --risk=2', category: '注入检测' },
      { id: 'whatweb', name: 'WhatWeb', version: '0.5.5', status: false, args: '--aggression 3', category: '指纹识别' }
    ],
    reports: [],
    modules: ['执行摘要', '攻击面资产', '漏洞清单', '利用过程', '修复建议', '原始日志']
  }
}

export function buildLocalReport(task, selectedModules, tools) {
  const messages = Array.isArray(task?.messages) ? task.messages : []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i] || {}
    const role = String(msg.role || '').trim().toLowerCase()
    if (role !== 'ai' && role !== 'assistant') continue
    const content = String(msg.content || '').trim()
    if (content) return content
  }

  const findings = task.logs.filter((item) => ['Critical', 'High', 'Medium'].includes(item.severity))
  const toolNames = task.toolIds.map((id) => tools.find((tool) => tool.id === id)?.name || id)
  const lines = [
    `自动化渗透测试报告`,
    `任务：${task.name}`,
    `目标：${task.target}`,
    `靶机类型：${task.machineType}`,
    `扫描深度：${task.scanDepth}`,
    `生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    ''
  ]

  if (selectedModules.includes('执行摘要')) {
    lines.push('[执行摘要]')
    lines.push(`共采集 ${task.logs.length} 条日志，检测到中高危风险 ${findings.length} 项。`)
    lines.push('')
  }
  if (selectedModules.includes('攻击面资产')) {
    lines.push('[攻击面资产]')
    lines.push(`启用工具：${toolNames.join(' / ')}`)
    lines.push('')
  }
  if (selectedModules.includes('漏洞清单')) {
    lines.push('[漏洞清单]')
    findings.forEach((finding, index) => {
      lines.push(`${index + 1}. [${finding.severity}] ${finding.message}`)
    })
    if (!findings.length) lines.push('暂无明确漏洞项。')
    lines.push('')
  }
  if (selectedModules.includes('利用过程')) {
    lines.push('[利用过程]')
    task.logs.forEach((log) => lines.push(`- ${log.time} ${log.tool}: ${log.message}`))
    lines.push('')
  }
  if (selectedModules.includes('修复建议')) {
    lines.push('[修复建议]')
    lines.push('- 升级高危组件并核对版本。')
    lines.push('- 对暴露接口增加访问控制。')
    lines.push('- 持续执行资产与漏洞基线巡检。')
    lines.push('')
  }
  if (selectedModules.includes('原始日志')) {
    lines.push('[原始日志]')
    task.logs.forEach((log) => lines.push(`${log.time} | ${log.tool} | ${log.severity} | ${log.message}`))
  }

  return lines.join('\n')
}
