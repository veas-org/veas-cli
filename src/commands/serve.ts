import { spinner } from '@clack/prompts'
import * as dotenv from 'dotenv'
import pc from 'picocolors'
import { AuthManager } from '../auth/auth-manager.js'
import { DirectMCPServer } from '../mcp/direct-server.js'
import { logger } from '../utils/logger.js'

// Load environment variables (prioritize .env.local over .env)
dotenv.config({ path: '.env.local' })
dotenv.config() // Also load .env as fallback

interface ServeOptions {
  port: string
  cacheTtl: string
  cache: boolean
  showConfig?: boolean
}

export async function serve(options: ServeOptions) {
  // If showConfig is set, just display the configuration and exit
  if (options.showConfig) {
    const config = {
      mcpServers: {
        veas: {
          command: 'veas',
          args: ['serve'],
        },
      },
    }
    console.log(JSON.stringify(config, null, 2))
    return
  }

  // In MCP mode, we must not output anything to stdout/stderr
  // as it interferes with the JSON-RPC protocol
  const isMCPMode = process.env.MCP_MODE === 'true' || !process.stdout.isTTY

  // Redirect console output to stderr in MCP mode
  if (isMCPMode) {
    const originalLog = console.log
    // const originalError = console.error;
    console.log = (...args: unknown[]) => {
      // Only output to stderr if it's not JSON-RPC
      const msg = args.join(' ')
      if (!msg.trim().startsWith('{')) {
        process.stderr.write(`${msg}\n`)
      } else {
        // This is JSON-RPC, use original stdout
        originalLog(...args)
      }
    }
    console.error = (...args: unknown[]) => process.stderr.write(`${args.join(' ')}\n`)
  }

  const s = isMCPMode ? null : spinner()
  if (!isMCPMode) {
    s!.start('Starting MCP server...')
  }

  try {
    const authManager = AuthManager.getInstance()
    const isAuthenticated = await authManager.isAuthenticated()

    if (!isAuthenticated) {
      if (!isMCPMode) {
        s!.stop(pc.red('Not authenticated'))
        logger.info(pc.yellow('Please run "veas login" first'))
      }
      process.exit(1)
    }

    // Create DirectMCPServer with caching disabled
    const server = new DirectMCPServer({
      port: Number.parseInt(options.port, 10),
    })

    await server.initialize()
    if (!isMCPMode) {
      s!.stop(pc.green('MCP server initialized'))

      logger.info(
        pc.cyan(`
Veas MCP Server (Direct Connection)
===================================
Port: ${options.port}
Cache: Disabled
Mode: Direct MCP connection

The server is running in stdio mode for MCP protocol.
To use with Claude Desktop or other MCP clients, configure:

{
  "mcpServers": {
    "veas": {
      "command": "veas",
      "args": ["serve"]
    }
  }
}
`),
      )
    }

    await server.start()

    process.on('SIGINT', async () => {
      logger.info(pc.yellow('\nShutting down...'))
      await server.stop()
      process.exit(0)
    })
  } catch (error) {
    if (!isMCPMode && s) {
      s.stop(pc.red('Failed to start server'))
    }
    logger.error((error as Error).message)
    process.exit(1)
  }
}
