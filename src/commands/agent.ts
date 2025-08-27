/**
 * Agent Command
 *
 * Run the CLI as an agent that can execute tasks
 */

import { createClient } from '@supabase/supabase-js'
import chalk from 'chalk'
import { config as loadEnv } from 'dotenv'
import ora from 'ora'
import { AgentRegistry } from '../agent/agent-registry.js'
import { RealtimeService } from '../agent/realtime-service.js'
import { TaskExecutor } from '../agent/task-executor.js'
import type { AgentConfig, TaskExecution } from '../agent/types.js'
import { AuthManager } from '../auth/auth-manager.js'
import { MCPClient } from '../mcp/mcp-client.js'

// Load environment variables
loadEnv({ path: '.env.local' })
loadEnv()

interface AgentOptions {
  destinationId?: string
  name?: string
  organizationId?: string
  maxConcurrentTasks?: string
  heartbeatInterval?: string
  capabilities?: string
  debug?: boolean
  verbose?: boolean
}

/**
 * Start the agent
 */
export async function startAgent(options: AgentOptions): Promise<void> {
  const spinner = ora('Starting agent...').start()

  try {
    // Check authentication
    const authManager = AuthManager.getInstance()
    const session = await authManager.getSession()

    if (!session) {
      spinner.fail('Not authenticated. Please run "veas auth login" first.')
      process.exit(1)
    }

    // Get Supabase configuration
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    // Use service role key if available for agent operations (bypasses RLS)
    const supabaseAnonKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      spinner.fail(
        'Supabase configuration not found. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.',
      )
      process.exit(1)
    }

    // Get organization ID
    let organizationId = options.organizationId
    if (!organizationId) {
      // Try to get from environment or session
      organizationId = process.env.VEAS_ORGANIZATION_ID || session.user?.user_metadata?.organization_id

      if (!organizationId) {
        spinner.fail(
          'Organization ID is required. Please provide --organization-id or set VEAS_ORGANIZATION_ID environment variable.',
        )
        process.exit(1)
      }
    }

    // Parse capabilities
    let capabilities: Record<string, unknown> = {}
    if (options.capabilities) {
      try {
        capabilities = JSON.parse(options.capabilities)
      } catch (_error) {
        spinner.warn('Invalid capabilities JSON, using defaults')
      }
    }

    // If destination ID is provided, use it; otherwise create/register destination
    let destinationId = options.destinationId
    let registry: AgentRegistry | null = null

    if (!destinationId) {
      // Create agent configuration for new destination
      const agentConfig: AgentConfig = {
        name: options.name || `veas-agent-${process.env.HOSTNAME || 'unknown'}`,
        organizationId,
        capabilities,
        maxConcurrentTasks: parseInt(options.maxConcurrentTasks || '1', 10),
        heartbeatIntervalMs: parseInt(options.heartbeatInterval || '30000', 10),
        supabaseUrl,
        supabaseAnonKey,
        apiKey: process.env.VEAS_AGENT_API_KEY,
      }

      spinner.text = 'Registering destination with platform...'

      // Create agent registry
      registry = new AgentRegistry(agentConfig)
      destinationId = await registry.register()
    } else {
      // Use existing destination
      spinner.text = 'Using existing destination...'

      // Verify destination exists and belongs to organization
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        },
      })

      const { data: destination, error } = await supabase
        .schema('agents')
        .from('agent_destinations')
        .select('id, name, organization_id')
        .eq('id', destinationId)
        .single()

      if (error || !destination) {
        spinner.fail('Destination not found')
        process.exit(1)
      }

      if (destination.organization_id !== organizationId) {
        spinner.fail('Destination belongs to different organization')
        process.exit(1)
      }

      spinner.succeed(`Using destination: ${destination.name}`)
    }

    spinner.succeed(registry ? `Destination registered: ${destinationId}` : `Using destination: ${destinationId}`)
    console.log(chalk.green(`Destination ID: ${destinationId}`))
    console.log(chalk.green(`Organization: ${organizationId}`))
    if (options.name) console.log(chalk.green(`Agent name: ${options.name}`))
    if (options.verbose) {
      console.log(chalk.yellow(`Verbose mode: ENABLED`))
      console.log(chalk.gray(`[VERBOSE] Supabase URL: ${supabaseUrl}`))
      console.log(chalk.gray(`[VERBOSE] Session User ID: ${session.user?.id}`))
    }

    // Create MCP client
    const mcpClient = new MCPClient(process.env.VEAS_API_URL || 'http://localhost:3000')

    // Create config for realtime service
    const realtimeConfig: AgentConfig = {
      name: options.name || `agent-${Date.now()}`,
      organizationId,
      capabilities,
      maxConcurrentTasks: parseInt(options.maxConcurrentTasks || '1', 10),
      heartbeatIntervalMs: parseInt(options.heartbeatInterval || '30000', 10),
      supabaseUrl,
      supabaseAnonKey,
      verbose: options.verbose || false,
    }

    // Create task executor
    const taskExecutor = new TaskExecutor(
      null as any, // Will be set below
      mcpClient,
      supabaseUrl,
      supabaseAnonKey,
      realtimeConfig.maxConcurrentTasks,
    )

    // Create realtime service
    const realtimeService = new RealtimeService(realtimeConfig, async (execution: TaskExecution) => {
      console.log(chalk.blue(`\n${'='.repeat(60)}`))
      console.log(chalk.blue(`📋 NEW TASK EXECUTION REQUEST`))
      console.log(chalk.blue(`   Execution ID: ${execution.id}`))
      console.log(chalk.blue(`   Task ID: ${execution.taskId}`))
      console.log(chalk.blue(`   Trigger: ${execution.trigger}`))
      console.log(chalk.blue(`   Time: ${new Date().toLocaleTimeString()}`))
      console.log(chalk.blue(`${'='.repeat(60)}\n`))

      if (options.verbose) {
        console.log(chalk.gray('[VERBOSE] Full execution object:'))
        console.log(chalk.gray(JSON.stringify(execution, null, 2)))
      }

      // Automatically start executing the task command
      try {
        if (options.verbose) {
          console.log(chalk.gray('[VERBOSE] Creating task executor...'))
        }

        // Create a simple task executor that handles command execution
        const simpleTaskExecutor = new (await import('../services/task-executor.js')).TaskExecutor(
          createClient(supabaseUrl, supabaseAnonKey, {
            global: {
              headers: {
                Authorization: `Bearer ${session.token}`,
              },
            },
          }),
          destinationId,
          organizationId,
        )

        if (options.verbose) {
          console.log(chalk.gray(`[VERBOSE] Executing task with ID: ${execution.id}`))
        }

        // Execute the task using the simple executor which handles commands directly
        await simpleTaskExecutor.executeTask(execution.id)
      } catch (error) {
        console.error(chalk.red('Failed to execute task:'), error)

        // Update task status to failed
        await realtimeService.updateExecutionStatus(execution.id, 'failed', {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorDetails: {
            stack: error instanceof Error ? error.stack : undefined,
          },
          completedAt: new Date().toISOString(),
        } as any)
      }
    })

    // Set the realtime service in task executor
    // @ts-expect-error - Hacky but works for now
    taskExecutor.realtimeService = realtimeService

    // Set destination ID in realtime service
    realtimeService.setDestinationId(destinationId)

    // Start realtime service
    await realtimeService.start()

    console.log(chalk.green('\n✅ Agent is running and listening for tasks'))
    console.log(chalk.gray('Press Ctrl+C to stop the agent\n'))

    // Handle shutdown
    const shutdown = async () => {
      console.log(chalk.yellow('\n\nShutting down agent...'))

      // Update status to offline if we created the registry
      if (registry) {
        await registry.updateStatus('offline')
      }

      // Stop services
      await realtimeService.stop()
      if (registry) {
        await registry.unregister()
      }

      console.log(chalk.green('Agent stopped'))
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // Keep the process running
    await new Promise(() => {})
  } catch (error: unknown) {
    spinner.fail(`Failed to start agent: ${error instanceof Error ? error.message : String(error)}`)

    if (options.debug) {
      console.error(error)
    }

    process.exit(1)
  }
}

/**
 * Stop the agent
 */
export async function stopAgent(_options: any): Promise<void> {
  console.log(chalk.yellow('Agent stop command not yet implemented'))
  console.log(chalk.gray('Use Ctrl+C to stop a running agent'))
}

/**
 * Show agent status
 */
export async function agentStatus(_options: any): Promise<void> {
  const spinner = ora('Checking agent status...').start()

  try {
    // Check authentication
    const authManager = AuthManager.getInstance()
    const session = await authManager.getSession()

    if (!session) {
      spinner.fail('Not authenticated. Please run "veas auth login" first.')
      process.exit(1)
    }

    // Get Supabase configuration
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      spinner.fail('Supabase configuration not found.')
      process.exit(1)
    }

    // TODO: Query agent destinations table to show status
    spinner.succeed('Agent status check complete')
    console.log(chalk.yellow('Status display not yet implemented'))
  } catch (error: unknown) {
    spinner.fail(`Failed to check agent status: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

/**
 * List all agents
 */
export async function listAgents(_options: any): Promise<void> {
  const spinner = ora('Fetching agents...').start()

  try {
    // Check authentication
    const authManager = AuthManager.getInstance()
    const session = await authManager.getSession()

    if (!session) {
      spinner.fail('Not authenticated. Please run "veas auth login" first.')
      process.exit(1)
    }

    // TODO: Query agent destinations table to list agents
    spinner.succeed('Agents fetched')
    console.log(chalk.yellow('Agent listing not yet implemented'))
  } catch (error: unknown) {
    spinner.fail(`Failed to list agents: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
