#!/usr/bin/env node

import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import * as dotenv from 'dotenv'
import { agentStatus, listAgents, startAgent, stopAgent } from './commands/agent.js'
import { login, logout, refresh, status } from './commands/auth.js'
import { deleteDestination, listDestinations, registerDestination, watchDestination } from './commands/destination.js'
import { docsSync as syncDocs } from './commands/docs-sync-mcp.js'
import { configureForClaude, listProjects, test as testMCP } from './commands/mcp.js'
import { createPAT, listPATs, revokePAT } from './commands/pat.js'
import { serve } from './commands/serve.js'

// Load environment variables (prioritize .env.local over .env)
dotenv.config({ path: '.env.local' })
dotenv.config() // Also load .env as fallback

// Load package.json for version
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(fs.readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))

const program = new Command()

program.name('veas').description('Veas CLI - Command-line interface for Veas platform').version(packageJson.version)

// Auth commands
const authCmd = program.command('auth').description('Authentication commands')

authCmd.command('login').description('Login to Veas platform').action(login)

authCmd.command('logout').description('Logout from Veas platform').action(logout)

authCmd.command('status').description('Check authentication status').action(status)

authCmd.command('refresh').description('Refresh authentication token').action(refresh)

// PAT commands
const patCmd = program.command('pat').description('Personal Access Token management')

patCmd
  .command('create')
  .description('Create a new Personal Access Token')
  .option('--name <name>', 'Token name')
  .option('--expires <days>', 'Token expiration in days', '30')
  .action(createPAT)

patCmd.command('list').description('List all Personal Access Tokens').action(listPATs)

patCmd.command('revoke <tokenId>').description('Revoke a Personal Access Token').action(revokePAT)

// MCP commands
const mcpCmd = program.command('mcp').description('Model Context Protocol commands')

mcpCmd
  .command('serve')
  .description('Start MCP server')
  .option('--port <port>', 'Server port', '3000')
  .option('--cache', 'Enable caching', false)
  .option('--cache-ttl <seconds>', 'Cache TTL in seconds', '300')
  .action(serve)

mcpCmd.command('test').description('Test MCP connection').action(testMCP)

mcpCmd.command('list-projects').description('List available projects').action(listProjects)

mcpCmd.command('configure').description('Show Claude Desktop configuration').action(configureForClaude)

mcpCmd
  .command('direct')
  .description('Start MCP server in direct mode (stdio)')
  .action(() => {
    // Set MCP_MODE to ensure quiet operation
    process.env.MCP_MODE = 'true'
    serve({ port: '3000', cache: false, cacheTtl: '0' })
  })

// Docs sync command
const docsCmd = program.command('docs').description('Documentation commands')

docsCmd
  .command('sync')
  .description('Sync documentation to Veas platform')
  .option('--watch', 'Watch for changes', false)
  .option('--dry-run', 'Preview changes without syncing', false)
  .option('--force', 'Force sync all files', false)
  .option('--folder <folder>', 'Specific folder to sync')
  .option('--config <path>', 'Path to veas.yaml config file')
  .action(syncDocs)

// Destination commands
const destCmd = program.command('destination').alias('dest').description('Manage agent destinations')

destCmd
  .command('list')
  .description('List all destinations')
  .option('--organization-id <id>', 'Organization ID')
  .option('--json', 'Output as JSON', false)
  .action(listDestinations)

destCmd
  .command('register')
  .description('Register a new destination')
  .option('--organization-id <id>', 'Organization ID (will prompt if not provided)')
  .action(registerDestination)

destCmd
  .command('delete <destinationId>')
  .description('Delete a destination')
  .option('--force', 'Skip confirmation', false)
  .action(deleteDestination)

destCmd.command('watch <destinationId>').description('Watch executions on a destination').action(watchDestination)

// Agent commands
const agentCmd = program.command('agent').description('Agent execution commands')

agentCmd
  .command('start')
  .description('Start agent to execute tasks')
  .option('--destination-id <id>', 'Destination ID (optional, will create/use existing)')
  .option('--name <name>', 'Agent name')
  .option('--organization-id <id>', 'Organization ID')
  .option('--max-concurrent-tasks <count>', 'Maximum concurrent tasks', '1')
  .option('--heartbeat-interval <ms>', 'Heartbeat interval in milliseconds', '30000')
  .option('--capabilities <json>', 'Agent capabilities as JSON')
  .option('--debug', 'Enable debug logging', false)
  .action(startAgent)

agentCmd.command('stop').description('Stop running agent').action(stopAgent)

agentCmd.command('status').description('Show agent status').action(agentStatus)

agentCmd.command('list').description('List all agents').action(listAgents)

// Serve command (standalone for backward compatibility)
program
  .command('serve')
  .description('Start MCP server')
  .option('--port <port>', 'Server port', '3000')
  .option('--cache', 'Enable caching', false)
  .option('--cache-ttl <seconds>', 'Cache TTL in seconds', '300')
  .action(serve)

// Parse command line arguments
program.parse(process.argv)

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp()
}
