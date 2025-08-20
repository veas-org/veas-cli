/**
 * Realtime Service
 * 
 * Manages Supabase Realtime subscriptions for task execution events
 */

import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import type { AgentConfig, RealtimeMessage, TaskExecution } from './types.js'
import { logger } from '../utils/logger.js'

export class RealtimeService {
  private supabase: any
  private channel: RealtimeChannel | null = null
  private config: AgentConfig
  private destinationId: string | null = null
  private onTaskAssigned: (execution: TaskExecution) => void
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000

  constructor(
    config: AgentConfig,
    onTaskAssigned: (execution: TaskExecution) => void
  ) {
    this.config = config
    this.onTaskAssigned = onTaskAssigned

    // Initialize Supabase client
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error('Supabase URL and anon key are required for realtime service')
    }

    this.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    })
  }

  /**
   * Set the destination ID for this agent
   */
  setDestinationId(destinationId: string) {
    this.destinationId = destinationId
    logger.debug(`Destination ID set: ${destinationId}`)
  }

  /**
   * Start listening for task assignments
   */
  async start(): Promise<void> {
    if (!this.destinationId) {
      throw new Error('Destination ID must be set before starting realtime service')
    }

    logger.info('Starting realtime service...')

    try {
      // Create a channel for task executions
      this.channel = this.supabase
        .channel('agent-executions')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'agents',
            table: 'executions',
            filter: `destination_id=eq.${this.destinationId}`
          },
          (payload: RealtimePostgresChangesPayload<TaskExecution>) => {
            this.handleExecutionChange(payload)
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'agents',
            table: 'executions',
            filter: `status=eq.pending`
          },
          (payload: RealtimePostgresChangesPayload<TaskExecution>) => {
            // Also listen for unassigned tasks that we might be able to claim
            if (!payload.new?.destination_id) {
              this.handlePendingTask(payload.new as TaskExecution)
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            logger.info('Successfully subscribed to realtime events')
            this.reconnectAttempts = 0
          } else if (status === 'CHANNEL_ERROR') {
            logger.error('Channel error, attempting to reconnect...')
            this.handleReconnect()
          } else if (status === 'TIMED_OUT') {
            logger.error('Subscription timed out, attempting to reconnect...')
            this.handleReconnect()
          }
        })

      // Also listen for task assignments via polling (fallback)
      this.startPolling()

    } catch (error) {
      logger.error('Failed to start realtime service:', error)
      throw error
    }
  }

  /**
   * Stop the realtime service
   */
  async stop(): Promise<void> {
    logger.info('Stopping realtime service...')

    if (this.channel) {
      await this.supabase.removeChannel(this.channel)
      this.channel = null
    }

    this.stopPolling()
  }

  /**
   * Handle execution change events
   */
  private handleExecutionChange(payload: RealtimePostgresChangesPayload<TaskExecution>) {
    const { eventType, new: newRecord, old: oldRecord } = payload

    logger.debug(`Execution change event: ${eventType}`, {
      executionId: newRecord?.id || oldRecord?.id
    })

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      const execution = newRecord as TaskExecution
      
      // Check if this is a new assignment for us
      if (
        execution.status === 'pending' &&
        execution.destination_id === this.destinationId &&
        !execution.claimed_at
      ) {
        logger.info(`New task assigned: ${execution.id}`)
        this.onTaskAssigned(execution)
      }
    }
  }

  /**
   * Handle pending tasks that might be claimable
   */
  private async handlePendingTask(execution: TaskExecution) {
    if (!execution || execution.destination_id) return

    logger.debug(`Found pending task without destination: ${execution.id}`)

    // Try to claim the task
    try {
      const { data, error } = await this.supabase
        .from('executions')
        .update({
          destination_id: this.destinationId,
          assigned_at: new Date().toISOString(),
          claimed_at: new Date().toISOString()
        })
        .eq('id', execution.id)
        .is('destination_id', null)
        .eq('status', 'pending')
        .select()
        .single()

      if (!error && data) {
        logger.info(`Successfully claimed task: ${execution.id}`)
        this.onTaskAssigned(data as TaskExecution)
      }
    } catch (error) {
      logger.debug(`Failed to claim task ${execution.id}:`, error)
    }
  }

  /**
   * Handle reconnection logic
   */
  private async handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached. Giving up.')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    logger.info(`Attempting to reconnect (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`)

    setTimeout(async () => {
      if (this.channel) {
        await this.supabase.removeChannel(this.channel)
      }
      await this.start()
    }, delay)
  }

  /**
   * Polling fallback for environments where realtime might not work
   */
  private pollingInterval: NodeJS.Timeout | null = null

  private startPolling() {
    // Poll every 5 seconds for new tasks
    this.pollingInterval = setInterval(async () => {
      await this.pollForTasks()
    }, 5000)
  }

  private stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  }

  private async pollForTasks() {
    try {
      // Check for tasks assigned to us
      const { data: assignedTasks, error: assignedError } = await this.supabase
        .from('executions')
        .select('*')
        .eq('destination_id', this.destinationId)
        .eq('status', 'pending')
        .is('claimed_at', null)
        .limit(10)

      if (!assignedError && assignedTasks?.length > 0) {
        for (const task of assignedTasks) {
          // Claim the task
          const { data: claimedTask, error: claimError } = await this.supabase
            .from('executions')
            .update({ claimed_at: new Date().toISOString() })
            .eq('id', task.id)
            .is('claimed_at', null)
            .select()
            .single()

          if (!claimError && claimedTask) {
            logger.info(`Claimed task via polling: ${task.id}`)
            this.onTaskAssigned(claimedTask as TaskExecution)
          }
        }
      }

      // Also check for unassigned tasks we can claim
      const { data: unassignedTasks, error: unassignedError } = await this.supabase
        .from('executions')
        .select('*')
        .is('destination_id', null)
        .eq('status', 'pending')
        .limit(5)

      if (!unassignedError && unassignedTasks?.length > 0) {
        for (const task of unassignedTasks) {
          await this.handlePendingTask(task as TaskExecution)
        }
      }
    } catch (error) {
      logger.debug('Error polling for tasks:', error)
    }
  }

  /**
   * Update execution status
   */
  async updateExecutionStatus(
    executionId: string,
    status: TaskExecution['status'],
    updates: Partial<TaskExecution> = {}
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('executions')
        .update({
          status,
          ...updates,
          ...(status === 'running' && !updates.started_at
            ? { started_at: new Date().toISOString() }
            : {}),
          ...(status === 'completed' || status === 'failed'
            ? { completed_at: new Date().toISOString() }
            : {})
        })
        .eq('id', executionId)

      if (error) {
        logger.error(`Failed to update execution status: ${error.message}`)
        throw error
      }
    } catch (error) {
      logger.error('Error updating execution status:', error)
      throw error
    }
  }

  /**
   * Add execution log
   */
  async addExecutionLog(
    executionId: string,
    level: 'debug' | 'info' | 'warning' | 'error',
    message: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      // Get current logs
      const { data: execution, error: fetchError } = await this.supabase
        .from('executions')
        .select('execution_logs')
        .eq('id', executionId)
        .single()

      if (fetchError) {
        logger.error(`Failed to fetch execution: ${fetchError.message}`)
        return
      }

      const logs = execution?.execution_logs || []
      logs.push({
        timestamp: new Date().toISOString(),
        level,
        message,
        data
      })

      // Update logs
      const { error: updateError } = await this.supabase
        .from('executions')
        .update({ execution_logs: logs })
        .eq('id', executionId)

      if (updateError) {
        logger.error(`Failed to add execution log: ${updateError.message}`)
      }
    } catch (error) {
      logger.error('Error adding execution log:', error)
    }
  }
}