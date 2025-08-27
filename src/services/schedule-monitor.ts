/**
 * Schedule Monitor Service
 *
 * Monitors scheduled tasks and triggers executions
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import chalk from 'chalk'
import type { Execution, Schedule } from '../types/agents.js'
import { TaskExecutor } from './task-executor.js'

export class ScheduleMonitor {
  private supabase: SupabaseClient
  private destinationId: string
  private organizationId: string
  private taskExecutor: TaskExecutor
  private channels: Map<string, RealtimeChannel> = new Map()
  private checkInterval?: NodeJS.Timeout | number
  private heartbeatInterval?: NodeJS.Timeout | number
  private verbose: boolean = false

  constructor(supabase: SupabaseClient, destinationId: string, organizationId: string, verbose: boolean = false) {
    this.supabase = supabase
    this.destinationId = destinationId
    this.organizationId = organizationId
    this.verbose = verbose
    this.taskExecutor = new TaskExecutor(supabase, destinationId, organizationId)
  }

  /**
   * Start monitoring schedules
   */
  async start(): Promise<void> {
    console.log(chalk.blue('🔍 Starting schedule monitor...'))

    if (this.verbose) {
      console.log(chalk.gray('[VERBOSE] Initializing with:'))
      console.log(chalk.gray(`[VERBOSE]   Destination ID: ${this.destinationId}`))
      console.log(chalk.gray(`[VERBOSE]   Organization ID: ${this.organizationId}`))
    }

    // Update destination status to online
    await this.updateDestinationStatus('online')

    // Start heartbeat
    this.startHeartbeat()

    // Check for any pending executions that need to be processed
    await this.checkPendingExecutions()

    // Subscribe to executions for this destination
    await this.subscribeToExecutions()

    // Subscribe to schedule updates
    await this.subscribeToSchedules()

    // Start periodic check for due schedules
    this.startScheduleChecker()

    console.log(chalk.green('✅ Schedule monitor started'))
    console.log(chalk.cyan('   Watching for:'))
    console.log(chalk.cyan('   • Executions assigned to this destination'))
    console.log(chalk.cyan('   • Unassigned executions for organization tasks'))
    console.log(chalk.cyan('   • Scheduled tasks that are due'))
    console.log(chalk.cyan('   • Manual task triggers\n'))
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    console.log(chalk.yellow('Stopping schedule monitor...'))

    // Clear intervals
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    // Unsubscribe from all realtime channels
    for (const [name, channel] of this.channels) {
      console.log(chalk.gray(`  Unsubscribing from ${name}...`))
      await this.supabase.removeChannel(channel)
    }
    this.channels.clear()

    // Update destination status to offline
    await this.updateDestinationStatus('offline')

    console.log(chalk.yellow('Schedule monitor stopped'))
  }

  /**
   * Subscribe to executions for this destination
   */
  private async subscribeToExecutions(): Promise<void> {
    try {
      // Subscribe to executions assigned to this destination
      const assignedChannel = this.supabase
        .channel(`executions-assigned-${this.destinationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'agents',
            table: 'executions',
            filter: `destination_id=eq.${this.destinationId}`,
          },
          async payload => {
            if (this.verbose) {
              console.log(chalk.gray('[VERBOSE] Assigned execution event:'))
              console.log(chalk.gray(`[VERBOSE]   Event: ${payload.eventType}`))
              const newExec = payload.new as any
              const oldExec = payload.old as any
              console.log(chalk.gray(`[VERBOSE]   Execution ID: ${newExec?.id || oldExec?.id}`))
            }
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const execution = payload.new as Execution
              if (execution && (execution.status === 'pending' || execution.status === 'queued')) {
                console.log(chalk.cyan(`\n📨 New assigned execution detected: ${execution.id}`))
                await this.handleNewExecution(execution)
              }
            }
          },
        )
        .subscribe(status => {
          if (status === 'SUBSCRIBED') {
            console.log(chalk.gray('  ✓ Subscribed to assigned executions (realtime)'))
          } else if (status === 'CHANNEL_ERROR') {
            console.log(chalk.yellow('  ⚠ Failed to subscribe to assigned executions, using polling only'))
          }
        })

      this.channels.set('executions-assigned', assignedChannel)

      // Subscribe to unassigned executions for our organization's tasks
      // First get our organization's task IDs
      const { data: tasks } = await this.supabase
        .schema('agents')
        .from('tasks')
        .select('id')
        .eq('organization_id', this.organizationId)

      if (tasks && tasks.length > 0) {
        // Subscribe to unassigned executions
        const unassignedChannel = this.supabase
          .channel(`executions-unassigned-${this.organizationId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'agents',
              table: 'executions',
            },
            async payload => {
              const execution = payload.new as Execution
              if (this.verbose) {
                console.log(chalk.gray('[VERBOSE] Unassigned execution event:'))
                console.log(chalk.gray(`[VERBOSE]   Execution ID: ${execution.id}`))
                console.log(chalk.gray(`[VERBOSE]   Task ID: ${execution.task_id}`))
                console.log(chalk.gray(`[VERBOSE]   Destination ID: ${execution.destination_id || 'none'}`))
              }
              // Check if this execution is for one of our tasks and not assigned
              if (!execution.destination_id && tasks.some(t => t.id === execution.task_id)) {
                if (execution.status === 'pending' || execution.status === 'queued') {
                  console.log(chalk.yellow(`\n🔍 New unassigned execution detected: ${execution.id}`))
                  await this.tryClaimExecution(execution)
                }
              }
            },
          )
          .subscribe(status => {
            if (status === 'SUBSCRIBED') {
              console.log(chalk.gray('  ✓ Subscribed to unassigned executions (realtime)'))
            } else if (status === 'CHANNEL_ERROR') {
              console.log(chalk.yellow('  ⚠ Failed to subscribe to unassigned executions, using polling only'))
            }
          })

        this.channels.set('executions-unassigned', unassignedChannel)
      }

      // Keep polling as a backup mechanism
      console.log(chalk.gray('  ✓ Polling enabled as backup (30s interval)'))
    } catch (error) {
      console.error(chalk.red('Failed to set up execution subscriptions:'), error)
      console.log(chalk.yellow('  Falling back to polling-only mode'))
    }
  }

  /**
   * Subscribe to schedule updates
   */
  private async subscribeToSchedules(): Promise<void> {
    try {
      // Subscribe to schedule changes for this destination and organization
      const scheduleChannel = this.supabase
        .channel(`schedules-${this.destinationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'agents',
            table: 'schedules',
          },
          async payload => {
            if (this.verbose) {
              console.log(chalk.gray('[VERBOSE] Schedule event:'))
              console.log(chalk.gray(`[VERBOSE]   Event: ${payload.eventType}`))
              const newSched = payload.new as any
              const oldSched = payload.old as any
              console.log(chalk.gray(`[VERBOSE]   Schedule ID: ${newSched?.id || oldSched?.id}`))
            }

            if ((payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') && payload.new) {
              const schedule = payload.new as Schedule

              // Check if schedule is for this destination or unassigned
              if (schedule.destination_id === this.destinationId || !schedule.destination_id) {
                // Check if the schedule is due
                if (schedule.is_enabled && schedule.next_run_at) {
                  const nextRun = new Date(schedule.next_run_at)
                  const now = new Date()

                  if (nextRun <= now) {
                    console.log(chalk.blue(`\n⏰ Schedule ${schedule.id} is due`))
                    // Fetch full schedule with task info
                    const { data: fullSchedule } = await this.supabase
                      .schema('agents')
                      .from('schedules')
                      .select(`
                        *,
                        tasks!inner(
                          id,
                          name,
                          organization_id,
                          status
                        )
                      `)
                      .eq('id', schedule.id)
                      .single()

                    if (fullSchedule && fullSchedule.tasks.organization_id === this.organizationId) {
                      await this.triggerScheduledExecution(fullSchedule)
                    }
                  }
                }
              }
            }
          },
        )
        .subscribe(status => {
          if (status === 'SUBSCRIBED') {
            console.log(chalk.gray('  ✓ Subscribed to schedule updates (realtime)'))
          } else if (status === 'CHANNEL_ERROR') {
            console.log(chalk.yellow('  ⚠ Failed to subscribe to schedules, using polling only'))
          }
        })

      this.channels.set('schedules', scheduleChannel)

      // Keep polling as a backup mechanism for checking due schedules
      console.log(chalk.gray('  ✓ Schedule checking via polling enabled (30s interval)'))
    } catch (error) {
      console.error(chalk.red('Failed to set up schedule subscriptions:'), error)
      console.log(chalk.yellow('  Falling back to polling-only mode'))
    }
  }

  /**
   * Handle new execution
   */
  private async handleNewExecution(execution: Execution): Promise<void> {
    if (this.verbose) {
      console.log(chalk.gray('[VERBOSE] Handling new execution:'))
      console.log(chalk.gray(`[VERBOSE]   ID: ${execution.id}`))
      console.log(chalk.gray(`[VERBOSE]   Task ID: ${execution.task_id}`))
      console.log(chalk.gray(`[VERBOSE]   Status: ${execution.status}`))
    }
    if (execution.status === 'pending' || execution.status === 'queued') {
      await this.taskExecutor.executeTask(execution.id)
    }
  }

  /**
   * Try to claim an unassigned execution
   */
  private async tryClaimExecution(execution: Execution): Promise<void> {
    console.log(chalk.gray(`  Attempting to claim execution ${execution.id}...`))

    if (this.verbose) {
      console.log(chalk.gray('[VERBOSE] Execution details:'))
      console.log(chalk.gray(JSON.stringify(execution, null, 2)))
    }

    // First check if the task belongs to our organization
    const { data: task, error: taskError } = await this.supabase
      .schema('agents')
      .from('tasks')
      .select('organization_id')
      .eq('id', execution.task_id)
      .single()

    if (taskError || !task || task.organization_id !== this.organizationId) {
      if (this.verbose) {
        console.log(chalk.gray('[VERBOSE] Task error or org mismatch:'))
        console.log(chalk.gray(`[VERBOSE]   Task Error: ${taskError?.message || 'none'}`))
        console.log(chalk.gray(`[VERBOSE]   Task Org: ${task?.organization_id || 'N/A'}`))
        console.log(chalk.gray(`[VERBOSE]   Our Org: ${this.organizationId}`))
      }
      console.log(chalk.gray('  Execution not for our organization, skipping'))
      return
    }

    // Try to claim the execution
    const { data: updated, error: claimError } = await this.supabase
      .schema('agents')
      .from('executions')
      .update({
        destination_id: this.destinationId,
        assigned_at: new Date().toISOString(),
      })
      .eq('id', execution.id)
      .is('destination_id', null) // Only claim if not already assigned
      .select()
      .single()

    if (!claimError && updated) {
      console.log(chalk.green(`  ✓ Successfully claimed execution ${execution.id}`))
      await this.handleNewExecution(updated as Execution)
    } else if (claimError) {
      console.log(chalk.gray(`  Could not claim execution (may be claimed by another destination)`))
    }
  }

  /**
   * Check for any pending executions on startup
   */
  private async checkPendingExecutions(): Promise<void> {
    console.log(chalk.gray('  Checking for pending executions...'))

    if (this.verbose) {
      console.log(chalk.gray('[VERBOSE] Querying for pending executions...'))
      console.log(chalk.gray(`[VERBOSE]   Destination: ${this.destinationId}`))
      console.log(chalk.gray(`[VERBOSE]   Organization: ${this.organizationId}`))
    }

    // Look for executions that are either:
    // 1. Already assigned to us but not claimed
    // 2. Not assigned to anyone and for tasks in our organization

    // Check assigned but unclaimed
    const { data: assignedExecutions, error: assignedError } = await this.supabase
      .schema('agents')
      .from('executions')
      .select('*')
      .eq('destination_id', this.destinationId)
      .in('status', ['pending', 'queued'])
      .is('claimed_at', null)

    if (!assignedError && assignedExecutions && assignedExecutions.length > 0) {
      console.log(chalk.blue(`  Found ${assignedExecutions.length} assigned pending execution(s)`))
      if (this.verbose) {
        console.log(chalk.gray('[VERBOSE] Assigned executions:'))
        console.log(chalk.gray(JSON.stringify(assignedExecutions, null, 2)))
      }
      for (const execution of assignedExecutions) {
        await this.handleNewExecution(execution)
      }
    } else if (this.verbose && assignedError) {
      console.log(chalk.gray(`[VERBOSE] Error fetching assigned executions: ${assignedError.message}`))
    }

    // Check unassigned executions for our organization's tasks
    const { data: tasks } = await this.supabase
      .schema('agents')
      .from('tasks')
      .select('id')
      .eq('organization_id', this.organizationId)

    if (tasks && tasks.length > 0) {
      const taskIds = tasks.map(t => t.id)

      const { data: unassignedExecutions, error: unassignedError } = await this.supabase
        .schema('agents')
        .from('executions')
        .select('*')
        .in('task_id', taskIds)
        .in('status', ['pending', 'queued'])
        .is('destination_id', null)

      if (!unassignedError && unassignedExecutions && unassignedExecutions.length > 0) {
        console.log(chalk.yellow(`  Found ${unassignedExecutions.length} unassigned execution(s)`))
        if (this.verbose) {
          console.log(chalk.gray('[VERBOSE] Unassigned executions:'))
          console.log(chalk.gray(JSON.stringify(unassignedExecutions, null, 2)))
        }
        for (const execution of unassignedExecutions) {
          await this.tryClaimExecution(execution)
        }
      } else if (this.verbose && unassignedError) {
        console.log(chalk.gray(`[VERBOSE] Error fetching unassigned executions: ${unassignedError.message}`))
      }
    }
  }

  /**
   * Start periodic schedule checker
   */
  private startScheduleChecker(): void {
    console.log(chalk.gray('  Starting schedule checker (30s interval)...'))

    // Check immediately
    this.checkDueSchedules()

    // Then check every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkDueSchedules()
    }, 30000)
  }

  /**
   * Check for due schedules and unclaimed executions
   */
  private async checkDueSchedules(): Promise<void> {
    if (this.verbose) {
      console.log(chalk.gray('[VERBOSE] Checking for due schedules...'))
    }

    // First check for any unclaimed executions
    await this.checkUnclaimedExecutions()

    // Then check for due schedules (both destination-specific and general)
    const { data: schedules, error } = await this.supabase
      .schema('agents')
      .from('schedules')
      .select(`
        *,
        tasks!inner(
          id,
          name,
          organization_id,
          status
        )
      `)
      .eq('is_enabled', true)
      .eq('tasks.organization_id', this.organizationId)
      .eq('tasks.status', 'active')
      .or(`destination_id.eq.${this.destinationId},destination_id.is.null`) // Filter for this destination or unassigned
      .lte('next_run_at', new Date().toISOString())

    if (error) {
      console.error(chalk.red('Failed to fetch due schedules:'), error)
      return
    }

    if (schedules && schedules.length > 0) {
      console.log(chalk.blue(`\n⏰ Found ${schedules.length} due schedule(s)`))
      if (this.verbose) {
        console.log(chalk.gray('[VERBOSE] Due schedules:'))
        console.log(chalk.gray(JSON.stringify(schedules, null, 2)))
      }
      for (const schedule of schedules) {
        await this.triggerScheduledExecution(schedule)
      }
    } else if (this.verbose && !error) {
      console.log(chalk.gray('[VERBOSE] No due schedules found'))
    }
  }

  /**
   * Periodically check for unclaimed executions
   */
  private async checkUnclaimedExecutions(): Promise<void> {
    // Get tasks in our organization
    const { data: tasks } = await this.supabase
      .schema('agents')
      .from('tasks')
      .select('id')
      .eq('organization_id', this.organizationId)

    if (!tasks || tasks.length === 0) {
      return
    }

    const taskIds = tasks.map(t => t.id)

    // Check for unclaimed executions
    const { data: unclaimedExecutions } = await this.supabase
      .schema('agents')
      .from('executions')
      .select('*')
      .in('task_id', taskIds)
      .in('status', ['pending', 'queued'])
      .is('destination_id', null)

    if (unclaimedExecutions && unclaimedExecutions.length > 0) {
      console.log(chalk.yellow(`\n🔄 Found ${unclaimedExecutions.length} unclaimed execution(s)`))
      if (this.verbose) {
        console.log(chalk.gray('[VERBOSE] Unclaimed executions in periodic check:'))
        console.log(chalk.gray(JSON.stringify(unclaimedExecutions, null, 2)))
      }
      for (const execution of unclaimedExecutions) {
        await this.tryClaimExecution(execution)
      }
    } else if (this.verbose) {
      console.log(chalk.gray('[VERBOSE] No unclaimed executions found in periodic check'))
    }
  }

  /**
   * Trigger a scheduled execution
   */
  private async triggerScheduledExecution(schedule: any): Promise<void> {
    console.log(chalk.gray(`  Triggering execution for task: ${schedule.tasks.name}`))

    // Check if this is a destination-specific schedule
    if (schedule.destination_id && schedule.destination_id !== this.destinationId) {
      console.log(chalk.gray(`  Schedule is for a different destination, skipping`))
      return
    }

    // Create new execution
    const { data: execution, error } = await this.supabase
      .schema('agents')
      .from('executions')
      .insert({
        task_id: schedule.task_id,
        schedule_id: schedule.id,
        destination_id: this.destinationId,
        status: 'pending',
        trigger: 'scheduled',
        trigger_source: `schedule:${schedule.id}`,
        input_params: {},
        queued_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error(chalk.red('Failed to create execution:'), error)
      return
    }

    console.log(chalk.green(`  ✓ Created execution: ${execution.id}`))

    // Update schedule's next run time
    await this.updateScheduleNextRun(schedule)

    // Execute the task
    await this.taskExecutor.executeTask(execution.id)
  }

  /**
   * Update schedule's next run time based on its type
   */
  private async updateScheduleNextRun(schedule: Schedule): Promise<void> {
    let nextRunAt: Date | null = null

    switch (schedule.schedule_type) {
      case 'interval':
        if (schedule.interval_seconds) {
          nextRunAt = new Date(Date.now() + schedule.interval_seconds * 1000)
        }
        break

      case 'calendar':
        // For calendar events, calculate next occurrence based on recurrence rule
        nextRunAt = await this.calculateNextCalendarOccurrence(schedule)
        break

      case 'once':
        // Disable after running once
        await this.supabase.schema('agents').from('schedules').update({ is_enabled: false }).eq('id', schedule.id)
        return

      case 'cron':
        // TODO: Implement cron expression parsing
        // For now, just add 1 hour
        nextRunAt = new Date(Date.now() + 3600000)
        break

      default:
        // Manual, webhook, event - don't update next_run_at
        return
    }

    if (nextRunAt) {
      const { error } = await this.supabase
        .schema('agents')
        .from('schedules')
        .update({
          next_run_at: nextRunAt.toISOString(),
          last_run_at: new Date().toISOString(),
          run_count: (schedule.run_count || 0) + 1,
        })
        .eq('id', schedule.id)

      if (error) {
        console.error(chalk.red('Failed to update schedule:'), error)
      }
    }
  }

  /**
   * Start heartbeat to keep destination online
   */
  private startHeartbeat(): void {
    console.log(chalk.gray('  Starting heartbeat (60s interval)...'))

    // Send immediate heartbeat
    this.sendHeartbeat()

    // Then send every 60 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat()
    }, 60000)
  }

  /**
   * Send heartbeat
   */
  private async sendHeartbeat(): Promise<void> {
    if (this.verbose) {
      console.log(chalk.gray('[VERBOSE] Sending heartbeat...'))
    }

    const { error } = await this.supabase.schema('agents').from('destination_heartbeats').insert({
      destination_id: this.destinationId,
      status: 'online',
      active_tasks: 0,
      queued_tasks: 0,
    })

    if (error) {
      console.error(chalk.red('Failed to send heartbeat:'), error)
    } else if (this.verbose) {
      console.log(chalk.gray('[VERBOSE] Heartbeat sent successfully'))
    }
  }

  /**
   * Update destination status
   */
  private async updateDestinationStatus(status: 'online' | 'offline'): Promise<void> {
    const { error } = await this.supabase
      .schema('agents')
      .from('agent_destinations')
      .update({
        status,
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', this.destinationId)

    if (error) {
      console.error(chalk.red(`Failed to update destination status: ${error.message}`))
    }
  }

  /**
   * Calculate next occurrence for calendar-based schedules
   */
  private async calculateNextCalendarOccurrence(schedule: Schedule): Promise<Date | null> {
    if (!schedule.recurrence_rule) {
      // One-time calendar event
      return null
    }

    // Parse RRULE and calculate next occurrence
    // This is a simplified implementation - in production you'd use a library like rrule.js
    const now = new Date()
    const rule = schedule.recurrence_rule.toUpperCase()

    if (rule.includes('FREQ=DAILY')) {
      const interval = this.extractInterval(rule) || 1
      return new Date(now.getTime() + interval * 24 * 60 * 60 * 1000)
    } else if (rule.includes('FREQ=WEEKLY')) {
      const interval = this.extractInterval(rule) || 1
      return new Date(now.getTime() + interval * 7 * 24 * 60 * 60 * 1000)
    } else if (rule.includes('FREQ=MONTHLY')) {
      const interval = this.extractInterval(rule) || 1
      const nextDate = new Date(now)
      nextDate.setMonth(nextDate.getMonth() + interval)
      return nextDate
    } else if (rule.includes('FREQ=YEARLY')) {
      const interval = this.extractInterval(rule) || 1
      const nextDate = new Date(now)
      nextDate.setFullYear(nextDate.getFullYear() + interval)
      return nextDate
    }

    return null
  }

  /**
   * Extract interval from RRULE string
   */
  private extractInterval(rule: string): number | null {
    const match = rule.match(/INTERVAL=(\d+)/)
    return match?.[1] ? parseInt(match[1], 10) : null
  }

  // TODO: Implement checkScheduleExceptions when schedule_exceptions table is available
  // private async checkScheduleExceptions(scheduleId: string, date: Date): Promise<boolean> {
  //   const { data: exceptions } = await this.supabase
  //     .schema('agents')
  //     .from('schedule_exceptions')
  //     .select('*')
  //     .eq('schedule_id', scheduleId)
  //     .eq('exception_date', date.toISOString().split('T')[0])

  //   if (exceptions && exceptions.length > 0) {
  //     const exception = exceptions[0]
  //     if (exception.exception_type === 'cancelled') {
  //       return false // Skip this occurrence
  //     }
  //   }

  //   return true // No exception, proceed with execution
  // }

  /**
   * Get calendar events for a date range
   */
  async getCalendarEvents(startDate: Date, endDate: Date): Promise<any[]> {
    const { data: schedules } = await this.supabase
      .schema('agents')
      .from('schedules')
      .select(`
        *,
        tasks!inner(
          id,
          name,
          organization_id
        )
      `)
      .eq('schedule_type', 'calendar')
      .eq('tasks.organization_id', this.organizationId)
      .or(`destination_id.eq.${this.destinationId},destination_id.is.null`)
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString())

    return schedules || []
  }
}
