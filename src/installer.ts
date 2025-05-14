#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import chalk from 'chalk'
import os from 'os'
import packageJson from '../package.json'
import { runClient } from './client'
import { findAvailablePort } from './lib/utils'

const homeDir = os.homedir()
const NPX_TOOL_NAME = '@ownid/mcp-remote'

function getNpxPath(): string {
  try {
    if (process.platform === 'win32') {
      return execSync('where npx', { encoding: 'utf8' }).trim().split('\n')[0]
    } else {
      return execSync('which npx', { encoding: 'utf8' }).trim()
    }
  } catch (error) {
    console.log(chalk.yellow(`Warning: Could not find npx path: ${(error as Error).message}`))
    return 'npx'
  }
}

function printUsage(): void {
  console.log(`
Usage: npx @ownid/mcp-desktop-installer <install-target> <server-name> <server-url>

Install Target: "Claude Desktop", "VSCode", or "Cursor"
Example: npx @ownid/mcp-desktop-installer "Claude Desktop" acme https://abc.server.ownid.ai/mcp/ai
`)
}

function getConfigPath(installTarget: string): { configDir: string; configPath: string } {
  let configDir: string
  let configPath: string

  switch (installTarget) {
    case 'Claude Desktop':
      switch (process.platform) {
        case 'darwin':
          configDir = path.join(homeDir, 'Library', 'Application Support', 'Claude')
          configPath = path.join(configDir, 'claude_desktop_config.json')
          break
        case 'win32':
          configDir = path.join(process.env.APPDATA || '', 'Claude')
          configPath = path.join(configDir, 'claude_desktop_config.json')
          break
        default:
          configDir = path.join(homeDir, '.anthropic')
          configPath = path.join(configDir, 'config.json')
          console.log(chalk.yellow('Note: Using fallback config location for unsupported platform.'))
          break
      }
      break
    case 'VSCode':
      configDir = path.join(homeDir, '.vscode')
      configPath = path.join(configDir, 'mcp.json')
      break
    case 'Cursor':
      configDir = path.join(homeDir, '.cursor')
      configPath = path.join(configDir, 'mcp.json')
      break
    default:
      console.log(chalk.red(`Unsupported install target: ${installTarget}`))
      process.exit(1)
  }

  return { configDir, configPath }
}

interface McpServer {
  command: string
  args: string[]
}

interface Config {
  mcpServers?: Record<string, McpServer>

  [key: string]: unknown
}

function readConfig(configPath: string, installTarget: string): Config {
  if (!fs.existsSync(configPath)) {
    return {}
  }

  try {
    const configContent = fs.readFileSync(configPath, 'utf8')
    const config = JSON.parse(configContent) as Config
    console.log(chalk.blue(`Found existing ${installTarget} configuration`))
    return config
  } catch (error) {
    console.log(chalk.yellow(`Warning: Could not parse existing config: ${(error as Error).message}`))
    console.log(chalk.blue('Creating new configuration'))
    return {}
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage()
    process.exit(0)
  }

  if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
    console.log(`v${packageJson.version}`)
    process.exit(0)
  }

  if (args.length !== 3) {
    console.log(chalk.red('Error: Expected exactly 3 arguments'))
    printUsage()
    process.exit(1)
  }

  let installTarget = args[0]
  const serverName = args[1]
  const serverUrl = args[2]

  const targetMap: Record<string, string> = {
    'claude desktop': 'Claude Desktop',
    claudedesktop: 'Claude Desktop',
    claude: 'Claude Desktop',
    vscode: 'VSCode',
    'vs code': 'VSCode',
    cursor: 'Cursor',
  }

  const normalizedTarget = installTarget.toLowerCase().replace(/\s+/g, ' ').trim()
  if (targetMap[normalizedTarget]) {
    installTarget = targetMap[normalizedTarget]
  }

  if (!installTarget || !serverName || !serverUrl) {
    console.log(chalk.red('Error: Install target, server name and URL are required'))
    printUsage()
    process.exit(1)
  }

  const validTargets = ['Claude Desktop', 'VSCode', 'Cursor']
  if (!validTargets.includes(installTarget)) {
    console.log(chalk.red(`Error: Install target must be "Claude Desktop", "VSCode", or "Cursor", got "${installTarget}"`))
    printUsage()
    process.exit(1)
  }

  const { configDir, configPath } = getConfigPath(installTarget)

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
    console.log(chalk.blue(`Created directory: ${configDir}`))
  }

  let config = readConfig(configPath, installTarget)

  if (!config.mcpServers) {
    config.mcpServers = {}
  }

  try {
    console.log(chalk.blue(`Verifying connection to server...`))

    const callbackPort = await findAvailablePort(3334)
    await runClient(serverUrl, callbackPort, {}, 'http-first', true)

    const npxPath = getNpxPath()
    config.mcpServers = config.mcpServers || {}
    config.mcpServers[serverName] = {
      command: npxPath,
      args: ['-y', NPX_TOOL_NAME, serverUrl],
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    console.log(chalk.green(`\nSuccessfully added MCP server "${serverName}" to ${installTarget}!`))
    console.log(chalk.green(`Configuration saved to: ${configPath}`))
    console.log(chalk.blue(`\nServer details:`))
    console.log(chalk.blue(`  Name: ${serverName}`))
    console.log(chalk.blue(`  URL: ${serverUrl}`))
    console.log(chalk.blue(`\nRestart ${installTarget} to apply changes.`))
  } catch (error) {
    console.log(chalk.red(`Error: Server verification failed. Configuration not updated.`))
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
