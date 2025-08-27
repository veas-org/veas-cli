/**
 * Destination Command
 *
 * Manage agent destinations
 */

import { hostname as getHostname } from 'node:os'
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
    // For local dev, use service role key to bypass RLS
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      spinner.fail('Supabase configuration not found.')
      process.exit(1)
    }

    // Create Supabase client with service role key for now
    // TODO: This should go through proper API endpoints
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get user's organization
    let organizationId = options.organizationId
    if (!organizationId) {
      console.log(chalk.gray(`Fetching organizations for user: ${session.user.id}`))

      const { data: memberships, error: memberError } = await supabase
        .schema('team_management')
        .from('organization_members')
        .select(`
          organization_id,
          user_id,
          role
        `)
        .eq('user_id', session.user.id)

      // Fetch organization details separately
      let organizationsData: unknown[] = []
      if (memberships && memberships.length > 0) {
        const orgIds = memberships.map(m => m.organization_id)
        const { data: orgs } = await supabase
          .schema('team_management')
          .from('organizations')
          .select('id, name, slug')
          .in('id', orgIds)

        organizationsData = orgs || []
      }

      // Combine the data
      const membershipsWithOrgs =
        memberships?.map(m => ({
          ...m,
          organization: organizationsData.find((o: any) => o.id === m.organization_id),
        })) || []

      if (memberError) {
        console.error(chalk.red('Error fetching organizations:'), memberError)
        spinner.fail(`Failed to fetch organizations: ${memberError.message}`)
        process.exit(1)
      }

      console.log(chalk.gray(`Found ${membershipsWithOrgs?.length || 0} organization memberships`))

      if (!membershipsWithOrgs || membershipsWithOrgs.length === 0) {
        spinner.fail('User must belong to at least one organization')
        process.exit(1)
      }

      // Use first organization if only one exists
      if (membershipsWithOrgs.length === 1) {
        organizationId = membershipsWithOrgs[0]?.organization_id
      } else {
        spinner.stop()
        // Multiple organizations - prompt for selection
        const orgChoice = await prompts.select({
          message: 'Select organization:',
          options: membershipsWithOrgs.map(m => ({
            value: m.organization_id,
            label: (m.organization as any)?.name || m.organization_id,
            hint: (m.organization as any)?.slug,
          })),
        })

        if (prompts.isCancel(orgChoice)) {
          console.log(chalk.yellow('Operation cancelled'))
          process.exit(0)
        }

        organizationId = orgChoice as string
        spinner.start('Fetching destinations...')
      }
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

    for (const dest of destinations) {
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
    }
  } catch (error: unknown) {
    spinner.fail(`Failed to list destinations: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

/**
 * Register a new destination
 */
export async function registerDestination(options: any): Promise<void> {
  const spinner = ora('Registering destination...').start()

  try {
    const authManager = AuthManager.getInstance()
    const session = await authManager.getSession()

    if (!session) {
      spinner.fail('Not authenticated. Please run "veas auth login" first.')
      process.exit(1)
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
    // For local dev, use service role key to bypass RLS
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      spinner.fail('Supabase configuration not found.')
      process.exit(1)
    }

    // Create Supabase client with service role key for now
    // TODO: This should go through proper API endpoints
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get user's organizations first
    console.log(chalk.gray(`Checking organizations for user: ${session.user.id}`))

    const { data: memberships, error: memberError } = await supabase
      .schema('team_management')
      .from('organization_members')
      .select(`
        organization_id,
        user_id,
        role
      `)
      .eq('user_id', session.user.id)

    if (memberError) {
      console.error(chalk.red('Error fetching organizations:'), memberError)
      spinner.fail(`Failed to fetch organizations: ${memberError.message}`)
      process.exit(1)
    }

    // Fetch organization details separately
    let organizationsData: unknown[] = []
    if (memberships && memberships.length > 0) {
      const orgIds = memberships.map(m => m.organization_id)
      const { data: orgs } = await supabase
        .schema('team_management')
        .from('organizations')
        .select('id, name, slug')
        .in('id', orgIds)

      organizationsData = orgs || []
    }

    // Combine the data
    const membershipsWithOrgs =
      memberships?.map(m => ({
        ...m,
        organization: organizationsData.find((o: any) => o.id === m.organization_id),
      })) || []

    console.log(chalk.gray(`Found ${membershipsWithOrgs?.length || 0} organization memberships`))

    if (!membershipsWithOrgs || membershipsWithOrgs.length === 0) {
      spinner.fail('User must belong to at least one organization')
      process.exit(1)
    }

    spinner.stop()

    // Select organization if user has multiple
    let selectedOrgId: string

    // Check if organization ID was provided via command line
    if (options.organizationId) {
      // Validate that the user belongs to this organization
      const membership = membershipsWithOrgs.find(m => m.organization_id === options.organizationId)
      if (!membership) {
        spinner.fail(`You don't have access to organization ${options.organizationId}`)
        process.exit(1)
      }
      selectedOrgId = options.organizationId
      const orgName = (membership.organization as any)?.name || membership.organization_id
      console.log(chalk.gray(`Using organization: ${orgName}`))
    } else if (membershipsWithOrgs.length === 1) {
      const membership = membershipsWithOrgs[0]
      if (!membership) {
        spinner.fail('No organization membership found')
        process.exit(1)
      }
      selectedOrgId = membership.organization_id
      const orgName = (membership.organization as any)?.name || membership.organization_id
      console.log(chalk.gray(`Using organization: ${orgName}`))
    } else {
      const orgChoice = await prompts.select({
        message: 'Select organization:',
        options: membershipsWithOrgs.map(m => ({
          value: m.organization_id,
          label: (m.organization as any)?.name || m.organization_id,
          hint: (m.organization as any)?.slug,
        })),
      })

      if (prompts.isCancel(orgChoice)) {
        console.log(chalk.yellow('Registration cancelled'))
        process.exit(0)
      }

      selectedOrgId = orgChoice as string
    }

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
      initialValue: getHostname(),
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

    // Generate API key
    const apiKey = generateApiKey()
    const apiKeyHash = await hashApiKey(apiKey)

    // Register destination
    const { data: destination, error } = await supabase
      .schema('agents')
      .from('agent_destinations')
      .insert({
        organization_id: selectedOrgId,
        owner_id: session.user.id, // Add the owner_id field
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
    console.log(`\n${chalk.yellow('⚠️  API Key (save this securely):')}`)
    console.log(chalk.bold(`  ${apiKey}`))
    console.log(chalk.gray('\nThis API key will not be shown again.'))
    console.log(chalk.gray('Use it when starting agents on this destination.'))
  } catch (error: unknown) {
    spinner.fail(`Failed to register destination: ${error instanceof Error ? error.message : String(error)}`)
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
    // For local dev, use service role key to bypass RLS
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      spinner.fail('Supabase configuration not found.')
      process.exit(1)
    }

    // Create Supabase client with service role key for now
    // TODO: This should go through proper API endpoints
    const supabase = createClient(supabaseUrl, supabaseKey)

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
  } catch (error: unknown) {
    spinner.fail(`Failed to delete destination: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

/**
 * Watch destination executions and monitor schedules
 */
export async function watchDestination(destinationId: string, options: any): Promise<void> {
  const spinner = ora('Connecting to destination...').start()

  try {
    const authManager = AuthManager.getInstance()
    const session = await authManager.getSession()

    if (!session) {
      spinner.fail('Not authenticated. Please run "veas auth login" first.')
      process.exit(1)
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
    // For local dev, use service role key to bypass RLS
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      spinner.fail('Supabase configuration not found.')
      process.exit(1)
    }

    // Create Supabase client with service role key for now
    // TODO: This should go through proper API endpoints
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get destination info
    const { data: destination, error: destError } = await supabase
      .schema('agents')
      .from('agent_destinations')
      .select('*')
      .eq('id', destinationId)
      .single()

    if (destError || !destination) {
      spinner.fail('Destination not found')
      process.exit(1)
    }

    spinner.succeed(`Connected to destination: ${destination.name}`)
    console.log(chalk.gray('Starting schedule monitor and watching for executions...'))

    if (options.verbose) {
      console.log(chalk.yellow('Verbose mode: ENABLED'))
      console.log(chalk.gray('[VERBOSE] Destination ID:', destinationId))
      console.log(chalk.gray('[VERBOSE] Organization ID:', destination.organization_id))
      console.log(chalk.gray('[VERBOSE] Supabase URL:', supabaseUrl))
    }

    console.log(chalk.gray('Press Ctrl+C to stop\n'))

    // Import and start the schedule monitor
    const { ScheduleMonitor } = await import('../services/schedule-monitor.js')
    const monitor = new ScheduleMonitor(supabase, destinationId, destination.organization_id, options.verbose)

    // Start monitoring
    await monitor.start()

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\nStopping monitor...'))
      await monitor.stop()
      process.exit(0)
    })

    // Keep the process alive
    await new Promise(() => {})
  } catch (error: unknown) {
    spinner.fail(`Failed to watch destination: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

// Helper functions (keeping for potential future use)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

/**
 * List schedules for a destination
 */
export async function listDestinationSchedules(destinationId: string, options: any): Promise<void> {
  const spinner = ora('Fetching schedules...').start()

  try {
    const authManager = AuthManager.getInstance()
    const session = await authManager.getSession()

    if (!session) {
      spinner.fail('Not authenticated. Please run "veas auth login" first.')
      process.exit(1)
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      spinner.fail('Supabase configuration not found.')
      process.exit(1)
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch schedules for destination
    const { data: schedules, error } = await supabase
      .schema('agents')
      .from('schedules')
      .select(`
        *,
        tasks!inner(
          id,
          name,
          description
        )
      `)
      .eq('destination_id', destinationId)
      .order('priority', { ascending: false })
      .order('start_time', { ascending: true })

    if (error) {
      throw error
    }

    spinner.stop()

    if (!schedules || schedules.length === 0) {
      console.log(chalk.yellow('No schedules found for this destination'))
      return
    }

    if (options.json) {
      console.log(JSON.stringify(schedules, null, 2))
      return
    }

    // Display schedules
    console.log(chalk.bold('\nDestination Schedules:'))
    console.log(chalk.gray('─'.repeat(80)))

    for (const schedule of schedules) {
      const task = (schedule as any).tasks
      console.log(chalk.bold(`\n📅 ${schedule.title || task.name}`))
      if (schedule.description) {
        console.log(chalk.gray(`   ${schedule.description}`))
      }
      console.log(chalk.cyan(`   Task: ${task.name}`))
      console.log(chalk.gray(`   Type: ${schedule.schedule_type}`))

      if (schedule.schedule_type === 'calendar') {
        console.log(chalk.gray(`   Start: ${new Date(schedule.start_time).toLocaleString()}`))
        if (schedule.end_time) {
          console.log(chalk.gray(`   End: ${new Date(schedule.end_time).toLocaleString()}`))
        } else if (schedule.duration_minutes) {
          console.log(chalk.gray(`   Duration: ${schedule.duration_minutes} minutes`))
        }
        if (schedule.recurrence_rule) {
          console.log(chalk.gray(`   Recurrence: ${schedule.recurrence_rule}`))
        }
        if (schedule.all_day) {
          console.log(chalk.gray(`   All Day: Yes`))
        }
      } else if (schedule.schedule_type === 'cron') {
        console.log(chalk.gray(`   Cron: ${schedule.cron_expression}`))
      } else if (schedule.schedule_type === 'interval') {
        console.log(chalk.gray(`   Interval: ${schedule.interval_seconds} seconds`))
      }

      console.log(
        chalk.gray(
          `   Priority: ${schedule.priority === 0 ? 'Low' : schedule.priority === 1 ? 'Normal' : schedule.priority === 2 ? 'High' : 'Critical'}`,
        ),
      )
      console.log(chalk.gray(`   Timezone: ${schedule.timezone}`))
      console.log(chalk.gray(`   Enabled: ${schedule.is_enabled ? 'Yes' : 'No'}`))

      if (schedule.next_run_at) {
        console.log(chalk.yellow(`   Next Run: ${new Date(schedule.next_run_at).toLocaleString()}`))
      }
      if (schedule.last_run_at) {
        console.log(chalk.gray(`   Last Run: ${new Date(schedule.last_run_at).toLocaleString()}`))
      }
      console.log(chalk.gray(`   Run Count: ${schedule.run_count}`))
    }

    console.log(chalk.gray(`\n${'─'.repeat(80)}`))
    console.log(chalk.green(`Total: ${schedules.length} schedule(s)`))
  } catch (error: unknown) {
    spinner.fail(`Failed to fetch schedules: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
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

// Keeping for potential future use - formats duration in human-readable format
// function formatDuration(ms: number): string {
//   if (ms < 1000) return `${ms}ms`
//   if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
//   const minutes = Math.floor(ms / 60000)
//   const seconds = Math.floor((ms % 60000) / 1000)
//   return `${minutes}m ${seconds}s`
// }
