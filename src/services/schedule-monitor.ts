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

  constructor(
    supabase: SupabaseClient,
    destinationId: string,
    organizationId: string
  ) {
    this.supabase = supabase
    this.destinationId = destinationId
    this.organizationId = organizationId
    this.taskExecutor = new TaskExecutor(supabase, destinationId, organizationId)
  }

  /**
   * Start monitoring schedules
   */
  async start(): Promise<void> {
    console.log(chalk.blue('🔍 Starting schedule monitor...'))

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

    // Unsubscribe from all channels
    for (const [name, channel] of this.channels.entries()) {
      console.log(chalk.gray(`  Unsubscribing from ${name}...`))
      await channel.unsubscribe()
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
    console.log(chalk.gray('  Subscribing to executions...'))

    // Subscribe to executions assigned to this destination
    const assignedChannel = this.supabase
      .channel(`executions-assigned-${this.destinationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'agents',
          table: 'executions',
          filter: `destination_id=eq.${this.destinationId}`
        },
        async (payload) => {
          console.log(chalk.blue('\n📥 New execution assigned:'), payload.new.id)
          await this.handleNewExecution(payload.new as Execution)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'agents',
          table: 'executions',
          filter: `destination_id=eq.${this.destinationId}`
        },
        async (payload) => {
          const execution = payload.new as Execution
          if (execution.status === 'pending' && !execution.claimed_at) {
            console.log(chalk.blue('\n📥 Execution ready to process:'), execution.id)
            await this.handleNewExecution(execution)
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(chalk.gray('  ✓ Subscribed to assigned executions'))
        }
      })

    this.channels.set('executions-assigned', assignedChannel)

    // Also subscribe to ALL executions in the organization to claim unassigned ones
    const unassignedChannel = this.supabase
      .channel(`executions-org-${this.organizationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'agents',
          table: 'executions'
        },
        async (payload) => {
          const execution = payload.new as Execution
          // Check if this execution is for a task in our organization and not yet assigned
          if (!execution.destination_id) {
            console.log(chalk.yellow('\n🔍 New unassigned execution detected:'), execution.id)
            await this.tryClaimExecution(execution)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'agents',
          table: 'executions'
        },
        async (payload) => {
          const execution = payload.new as Execution
          // Try to claim if status is pending and no destination assigned
          if (execution.status === 'pending' && !execution.destination_id && !execution.claimed_at) {
            console.log(chalk.yellow('\n🔍 Unassigned execution available:'), execution.id)
            await this.tryClaimExecution(execution)
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(chalk.gray('  ✓ Subscribed to organization executions'))
        }
      })

    this.channels.set('executions-unassigned', unassignedChannel)
  }

  /**
   * Subscribe to schedule updates
   */
  private async subscribeToSchedules(): Promise<void> {
    console.log(chalk.gray('  Subscribing to schedules...'))

    // Get tasks in this organization
    const { data: tasks } = await this.supabase
      .schema('agents')
      .from('tasks')
      .select('id')
      .eq('organization_id', this.organizationId)

    if (!tasks || tasks.length === 0) {
      console.log(chalk.gray('  No tasks found for organization'))
      return
    }

    const taskIds = tasks.map(t => t.id)

    const channel = this.supabase
      .channel(`schedules-${this.organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'agents',
          table: 'schedules'
        },
        async (payload) => {
          const schedule = payload.new as Schedule
          if (taskIds.includes(schedule.task_id)) {
            console.log(chalk.blue('\n📅 Schedule updated:'), schedule.id)
            await this.checkSchedule(schedule)
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(chalk.gray('  ✓ Subscribed to schedules'))
        }
      })

    this.channels.set('schedules', channel)
  }

  /**
   * Handle new execution
   */
  private async handleNewExecution(execution: Execution): Promise<void> {
    if (execution.status === 'pending' || execution.status === 'queued') {
      await this.taskExecutor.executeTask(execution.id)
    }
  }

  /**
   * Try to claim an unassigned execution
   */
  private async tryClaimExecution(execution: Execution): Promise<void> {
    console.log(chalk.gray(`  Attempting to claim execution ${execution.id}...`))
    
    // First check if the task belongs to our organization
    const { data: task, error: taskError } = await this.supabase
      .schema('agents')
      .from('tasks')
      .select('organization_id')
      .eq('id', execution.task_id)
      .single()

    if (taskError || !task || task.organization_id !== this.organizationId) {
      console.log(chalk.gray('  Execution not for our organization, skipping'))
      return
    }

    // Try to claim the execution
    const { data: updated, error: claimError } = await this.supabase
      .schema('agents')
      .from('executions')
      .update({
        destination_id: this.destinationId,
        assigned_at: new Date().toISOString()
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
      for (const execution of assignedExecutions) {
        await this.handleNewExecution(execution)
      }
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
        for (const execution of unassignedExecutions) {
          await this.tryClaimExecution(execution)
        }
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
    // First check for any unclaimed executions
    await this.checkUnclaimedExecutions()
    
    // Then check for due schedules
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
      .lte('next_run_at', new Date().toISOString())

    if (error) {
      console.error(chalk.red('Failed to fetch due schedules:'), error)
      return
    }

    if (schedules && schedules.length > 0) {
      console.log(chalk.blue(`\n⏰ Found ${schedules.length} due schedule(s)`))
      
      for (const schedule of schedules) {
        await this.triggerScheduledExecution(schedule)
      }
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
      for (const execution of unclaimedExecutions) {
        await this.tryClaimExecution(execution)
      }
    }
  }

  /**
   * Check a specific schedule
   */
  private async checkSchedule(schedule: Schedule): Promise<void> {
    if (!schedule.is_enabled) {
      return
    }

    const now = new Date()
    const nextRun = schedule.next_run_at ? new Date(schedule.next_run_at) : null

    if (nextRun && nextRun <= now) {
      console.log(chalk.blue(`⏰ Schedule ${schedule.id} is due`))
      await this.triggerScheduledExecution(schedule)
    }
  }

  /**
   * Trigger a scheduled execution
   */
  private async triggerScheduledExecution(schedule: any): Promise<void> {
    console.log(chalk.gray(`  Triggering execution for task: ${schedule.tasks.name}`))

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
        queued_at: new Date().toISOString()
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
      
      case 'once':
        // Disable after running once
        await this.supabase
          .schema('agents')
          .from('schedules')
          .update({ is_enabled: false })
          .eq('id', schedule.id)
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
          run_count: (schedule.run_count || 0) + 1
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
    const { error } = await this.supabase
      .schema('agents')
      .from('destination_heartbeats')
      .insert({
        destination_id: this.destinationId,
        status: 'online',
        active_tasks: 0,
        queued_tasks: 0
      })

    if (error) {
      console.error(chalk.red('Failed to send heartbeat:'), error)
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
        updated_at: new Date().toISOString()
      })
      .eq('id', this.destinationId)

    if (error) {
      console.error(chalk.red(`Failed to update destination status: ${error.message}`))
    }
  }
}