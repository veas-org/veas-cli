/**
 * Destination Command
 *
 * Manage agent destinations
 */

import * as prompts from '@clack/prompts'
import { createClient } from '@supabase/supabase-js'
import chalk from 'chalk'
import { config as loadEnv } from 'dotenv'
import ora from 'ora'
import { AuthManager } from '../auth/auth-manager.js'

// Load environment variables
loadEnv({ path: '.env.local' })
loadEnv()

interface DestinationOptions {
  organizationId?: string
  json?: boolean
}

/**
 * List destinations
 */
export async function listDestinations(options: DestinationOptions): Promise<void> {
  const spinner = ora('Fetching destinations...').start()

  try {
    const authManager = AuthManager.getInstance()
    const session = await authManager.getSession()

    if (!session) {
      spinner.fail('Not authenticated. Please run "veas auth login" first.')
      process.exit(1)
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      spinner.fail('Supabase configuration not found.')
      process.exit(1)
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      },
    })

    // Get user's organization
    let organizationId = options.organizationId
    if (!organizationId) {
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', session.user.id)
        .single()

      organizationId = member?.organization_id
    }

    if (!organizationId) {
      spinner.fail('Organization ID required')
      process.exit(1)
    }

    // Fetch destinations
    const { data: destinations, error } = await supabase
      .schema('agents')
      .from('agent_destinations')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    spinner.succeed('Destinations fetched')

    if (options.json) {
      console.log(JSON.stringify(destinations, null, 2))
      return
    }

    if (!destinations || destinations.length === 0) {
      console.log(chalk.yellow('No destinations found'))
      return
    }

    console.log(chalk.bold('\nAgent Destinations:'))
    console.log(chalk.gray('─'.repeat(80)))

    destinations.forEach(dest => {
      const status = getStatusColor(dest.status)
      console.log(`\n${chalk.bold(dest.name)} ${status(dest.status)}`)
      console.log(`  ID: ${chalk.gray(dest.id)}`)
      console.log(`  Hostname: ${dest.hostname}`)
      console.log(`  Max Tasks: ${dest.max_concurrent_tasks}`)
      console.log(
        `  Last Heartbeat: ${dest.last_heartbeat_at ? new Date(dest.last_heartbeat_at).toLocaleString() : 'Never'}`,
      )
      console.log(`  Total Executions: ${dest.total_executions || 0}`)
      console.log(
        `  Success Rate: ${
          dest.total_executions > 0 ? Math.round((dest.successful_executions / dest.total_executions) * 100) : 0
        }%`,
      )

      if (dest.tags?.length > 0) {
        console.log(`  Tags: ${dest.tags.join(', ')}`)
      }
    })
  } catch (error: any) {
    spinner.fail(`Failed to list destinations: ${error.message}`)
    process.exit(1)
  }
}

/**
 * Register a new destination
 */
export async function registerDestination(_options: any): Promise<void> {
  const spinner = ora('Registering destination...').start()

  try {
    const authManager = AuthManager.getInstance()
    const session = await authManager.getSession()

    if (!session) {
      spinner.fail('Not authenticated. Please run "veas auth login" first.')
      process.exit(1)
    }

    spinner.stop()

    // Prompt for destination details
    const name = await prompts.text({
      message: 'Destination name:',
      placeholder: 'my-agent-server',
      validate: value => {
        if (!value) return 'Name is required'
        return undefined
      },
    })

    if (prompts.isCancel(name)) {
      console.log(chalk.yellow('Registration cancelled'))
      process.exit(0)
    }

    const hostname = await prompts.text({
      message: 'Hostname:',
      placeholder: 'agent-server-1.example.com',
      initialValue: require('node:os').hostname(),
    })

    if (prompts.isCancel(hostname)) {
      console.log(chalk.yellow('Registration cancelled'))
      process.exit(0)
    }

    const maxTasks = await prompts.text({
      message: 'Max concurrent tasks:',
      placeholder: '3',
      initialValue: '3',
      validate: value => {
        const num = parseInt(value, 10)
        if (Number.isNaN(num) || num < 1) return 'Must be a positive number'
        return undefined
      },
    })

    if (prompts.isCancel(maxTasks)) {
      console.log(chalk.yellow('Registration cancelled'))
      process.exit(0)
    }

    spinner.start('Registering destination...')

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      spinner.fail('Supabase configuration not found.')
      process.exit(1)
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      },
    })

    // Get user's organization
    const { data: member, error: memberError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', session.user.id)
      .single()

    if (memberError || !member) {
      spinner.fail('User must belong to an organization')
      process.exit(1)
    }

    // Generate API key
    const apiKey = generateApiKey()
    const apiKeyHash = await hashApiKey(apiKey)

    // Register destination
    const { data: destination, error } = await supabase
      .schema('agents')
      .from('agent_destinations')
      .insert({
        organization_id: member.organization_id,
        name,
        hostname,
        max_concurrent_tasks: parseInt(maxTasks as string, 10),
        api_key_hash: apiKeyHash,
        status: 'offline',
        is_active: true,
        capabilities: {},
        supported_tools: [],
        allowed_task_types: ['workflow', 'single', 'batch'],
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    spinner.succeed('Destination registered successfully!')

    console.log(chalk.green('\n✅ Destination Details:'))
    console.log(`  ID: ${destination.id}`)
    console.log(`  Name: ${destination.name}`)
    console.log(`  Hostname: ${destination.hostname}`)
    console.log('\n' + chalk.yellow('⚠️  API Key (save this securely):'))
    console.log(chalk.bold(`  ${apiKey}`))
    console.log(chalk.gray('\nThis API key will not be shown again.'))
    console.log(chalk.gray('Use it when starting agents on this destination.'))
  } catch (error: any) {
    spinner.fail(`Failed to register destination: ${error.message}`)
    process.exit(1)
  }
}

/**
 * Delete a destination
 */
export async function deleteDestination(destinationId: string, options: any): Promise<void> {
  const spinner = ora('Checking destination...').start()

  try {
    const authManager = AuthManager.getInstance()
    const session = await authManager.getSession()

    if (!session) {
      spinner.fail('Not authenticated. Please run "veas auth login" first.')
      process.exit(1)
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      spinner.fail('Supabase configuration not found.')
      process.exit(1)
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      },
    })

    // Check destination
    const { data: destination, error: checkError } = await supabase
      .schema('agents')
      .from('agent_destinations')
      .select('id, name, status')
      .eq('id', destinationId)
      .single()

    if (checkError || !destination) {
      spinner.fail('Destination not found')
      process.exit(1)
    }

    spinner.stop()

    if (!options.force) {
      const confirm = await prompts.confirm({
        message: `Delete destination "${destination.name}"?`,
      })

      if (!confirm || prompts.isCancel(confirm)) {
        console.log(chalk.yellow('Deletion cancelled'))
        process.exit(0)
      }
    }

    spinner.start('Deleting destination...')

    // Delete destination
    const { error: deleteError } = await supabase
      .schema('agents')
      .from('agent_destinations')
      .delete()
      .eq('id', destinationId)

    if (deleteError) {
      throw deleteError
    }

    spinner.succeed(`Destination "${destination.name}" deleted successfully`)
  } catch (error: any) {
    spinner.fail(`Failed to delete destination: ${error.message}`)
    process.exit(1)
  }
}

/**
 * Watch destination executions
 */
export async function watchDestination(destinationId: string, _options: any): Promise<void> {
  const spinner = ora('Connecting to destination...').start()

  try {
    const authManager = AuthManager.getInstance()
    const session = await authManager.getSession()

    if (!session) {
      spinner.fail('Not authenticated. Please run "veas auth login" first.')
      process.exit(1)
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      spinner.fail('Supabase configuration not found.')
      process.exit(1)
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      },
    })

    // Get destination info
    const { data: destination, error: destError } = await supabase
      .schema('agents')
      .from('agent_destinations')
      .select('id, name, status')
      .eq('id', destinationId)
      .single()

    if (destError || !destination) {
      spinner.fail('Destination not found')
      process.exit(1)
    }

    spinner.succeed(`Connected to destination: ${destination.name}`)
    console.log(chalk.gray('Watching for executions... (Press Ctrl+C to stop)\n'))

    // Set up real-time subscription
    const channel = supabase
      .channel(`destination-${destinationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'agents',
          table: 'executions',
          filter: `destination_id=eq.${destinationId}`,
        },
        (payload: any) => {
          const { eventType, new: newRecord, old: oldRecord } = payload
          const record = newRecord || oldRecord

          if (eventType === 'INSERT') {
            console.log(chalk.blue(`📥 New execution: ${record.id}`))
            console.log(`   Task: ${record.task_id}`)
            console.log(`   Status: ${record.status}`)
          } else if (eventType === 'UPDATE') {
            const statusColor = getStatusColor(record.status)
            console.log(statusColor(`📝 Execution updated: ${record.id}`))
            console.log(`   Status: ${statusColor(record.status)}`)
            if (record.error_message) {
              console.log(chalk.red(`   Error: ${record.error_message}`))
            }
            if (record.duration_ms) {
              console.log(`   Duration: ${formatDuration(record.duration_ms)}`)
            }
          }
        },
      )
      .subscribe()

    // Keep process running
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n\nStopping watch...'))
      supabase.removeChannel(channel)
      process.exit(0)
    })

    // Keep the process alive
    await new Promise(() => {})
  } catch (error: any) {
    spinner.fail(`Failed to watch destination: ${error.message}`)
    process.exit(1)
  }
}

// Helper functions
function getStatusColor(status: string) {
  switch (status) {
    case 'online':
      return chalk.green
    case 'offline':
      return chalk.gray
    case 'busy':
      return chalk.yellow
    case 'maintenance':
      return chalk.blue
    case 'error':
      return chalk.red
    case 'completed':
      return chalk.green
    case 'failed':
      return chalk.red
    case 'running':
      return chalk.cyan
    case 'pending':
      return chalk.yellow
    default:
      return chalk.white
  }
}

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let key = 'dest_'
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return key
}

async function hashApiKey(apiKey: string): Promise<string> {
  const crypto = await import('node:crypto')
  return crypto.createHash('sha256').update(apiKey).digest('hex')
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}
