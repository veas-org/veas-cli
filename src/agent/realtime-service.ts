/**
 * Task Detection Service
 *
 * Polls for task execution events and handles task assignments
 */

import { createClient } from '@supabase/supabase-js'
import { logger } from '../utils/logger.js'
import type { AgentConfig, TaskExecution } from './types.js'

export class RealtimeService {
  private supabase: any
  private destinationId: string | null = null
  private onTaskAssigned: (execution: TaskExecution) => void
  private verbose: boolean = false

  constructor(config: AgentConfig, onTaskAssigned: (execution: TaskExecution) => void) {
    this.onTaskAssigned = onTaskAssigned
    this.verbose = config.verbose || false

    // Initialize Supabase client
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error('Supabase URL and anon key are required for realtime service')
    }

    if (this.verbose) {
      logger.info(`[VERBOSE] Initializing Supabase client:`)
      logger.info(`[VERBOSE]   URL: ${config.supabaseUrl}`)
      logger.info(`[VERBOSE]   Organization: ${config.organizationId}`)
    }

    this.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  }

  /**
   * Set the destination ID for this agent
   */
  setDestinationId(destinationId: string) {
    this.destinationId = destinationId
    logger.info(`Destination ID set: ${destinationId}`)
    if (this.verbose) {
      logger.info(`[VERBOSE] Agent ready to poll for tasks with destination: ${destinationId}`)
    }
  }

  /**
   * Start listening for task assignments
   */
  async start(): Promise<void> {
    if (!this.destinationId) {
      throw new Error('Destination ID must be set before starting realtime service')
    }

    logger.info('Starting task detection service...')

    try {
      // Try to set up realtime subscriptions
      const subscriptionSuccess = await this.setupRealtimeSubscriptions()

      if (!subscriptionSuccess) {
        logger.warn('Realtime subscriptions failed, falling back to polling-only mode')
      }

      // Always start polling as a backup mechanism
      logger.info('Starting polling for task detection (backup mechanism)')
      this.startPolling()
    } catch (error) {
      logger.error('Failed to start task detection service:', error)
      throw error
    }
  }

  /**
   * Stop the realtime service
   */
  async stop(): Promise<void> {
    logger.info('Stopping task detection service...')
    this.stopPolling()

    // Unsubscribe from all realtime channels
    if (this.channels) {
      for (const channel of this.channels) {
        await this.supabase.removeChannel(channel)
      }
      this.channels = []
    }
  }

  private channels: any[] = []

  /**
   * Set up realtime subscriptions for instant task detection
   */
  private async setupRealtimeSubscriptions(): Promise<boolean> {
    try {
      logger.info('Setting up realtime subscriptions...')

      // Subscribe to executions assigned to this destination
      const assignedChannel = this.supabase
        .channel(`agent-executions-${this.destinationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'agents',
            table: 'executions',
            filter: `destination_id=eq.${this.destinationId}`,
          },
          async (payload: any) => {
            if (this.verbose) {
              logger.info(`[VERBOSE] Realtime event (assigned): ${payload.eventType}`)
              logger.info(`[VERBOSE] Payload:`, JSON.stringify(payload, null, 2))
            }

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const execution = payload.new
              if (execution && (execution.status === 'pending' || execution.status === 'queued')) {
                logger.info(`🎯 Realtime: New assigned execution detected: ${execution.id}`)

                // Map to TaskExecution format
                const taskExecution: TaskExecution = {
                  id: execution.id,
                  taskId: execution.task_id,
                  trigger: execution.trigger || 'manual',
                  status: execution.status,
                  queuedAt: execution.queued_at,
                  startedAt: execution.started_at,
                  completedAt: execution.completed_at,
                  inputParams: execution.input_params || {},
                  outputResult: execution.output_result,
                  errorMessage: execution.error_message,
                  executionLogs: execution.execution_logs || [],
                  toolCalls: execution.tool_calls || [],
                  retryCount: execution.retry_count || 0,
                  context: execution.context || {},
                }

                this.onTaskAssigned(taskExecution)
              }
            }
          },
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            logger.info('✅ Subscribed to assigned executions (realtime)')
          } else {
            logger.warn(`⚠️ Subscription status for assigned executions: ${status}`)
          }
        })

      this.channels.push(assignedChannel)

      // Subscribe to unassigned executions (for claiming)
      const unassignedChannel = this.supabase
        .channel(`agent-unassigned-${this.destinationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'agents',
            table: 'executions',
          },
          async (payload: any) => {
            const execution = payload.new
            if (this.verbose) {
              logger.info(`[VERBOSE] Realtime event (unassigned): INSERT`)
              logger.info(`[VERBOSE] Execution destination: ${execution?.destination_id || 'none'}`)
            }

            // Only process if unassigned
            if (
              execution &&
              !execution.destination_id &&
              (execution.status === 'pending' || execution.status === 'queued')
            ) {
              logger.info(`🔍 Realtime: New unassigned execution detected: ${execution.id}`)
              await this.handlePendingTask(execution)
            }
          },
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            logger.info('✅ Subscribed to unassigned executions (realtime)')
          } else {
            logger.warn(`⚠️ Subscription status for unassigned executions: ${status}`)
          }
        })

      this.channels.push(unassignedChannel)

      // Wait a moment to ensure subscriptions are established
      await new Promise(resolve => setTimeout(resolve, 1000))

      logger.info('✅ Realtime subscriptions set up successfully')
      return true
    } catch (error) {
      logger.error('Failed to set up realtime subscriptions:', error)
      return false
    }
  }

  /**
   * Handle pending tasks that might be claimable
   */
  private async handlePendingTask(execution: TaskExecution) {
    const exec = execution as any
    if (!exec || exec.destination_id) return

    logger.debug(`Found pending task without destination: ${exec.id}`)

    // Try to claim the task
    try {
      const { data, error } = await this.supabase
        .from('executions')
        .update({
          destination_id: this.destinationId,
          assigned_at: new Date().toISOString(),
          claimed_at: new Date().toISOString(),
        })
        .eq('id', exec.id)
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
   * Polling fallback for environments where realtime might not work
   */
  private pollingInterval: NodeJS.Timeout | null = null

  private startPolling() {
    logger.info(`Starting polling for destination: ${this.destinationId}`)

    // Poll every 2 seconds for new tasks (faster response time)
    this.pollingInterval = setInterval(async () => {
      await this.pollForTasks()
    }, 2000) as unknown as NodeJS.Timeout

    // Also poll immediately on start
    this.pollForTasks()
  }

  private stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  }

  private async pollForTasks() {
    try {
      if (this.verbose) {
        logger.info(`[VERBOSE] Polling for tasks - Destination ID: ${this.destinationId}`)
      }

      // First check the agents schema for executions
      const query = this.supabase
        .schema('agents')
        .from('executions')
        .select('*')
        .or(`destination_id.eq.${this.destinationId},destination_id.is.null`)
        .in('status', ['pending', 'queued'])
        .limit(10)

      if (this.verbose) {
        logger.info(
          `[VERBOSE] Query: agents.executions WHERE (destination_id='${this.destinationId}' OR destination_id IS NULL) AND status IN ('pending', 'queued')`,
        )
      }

      const { data: agentExecutions, error: agentError } = await query

      if (agentError) {
        logger.error('Error querying agents.executions:', agentError.message)
        if (this.verbose) {
          logger.error('[VERBOSE] Full error:', agentError)
        }
      } else {
        if (this.verbose) {
          logger.info(`[VERBOSE] Query returned ${agentExecutions?.length || 0} executions`)
          if (agentExecutions && agentExecutions.length > 0) {
            logger.info('[VERBOSE] Executions found:', JSON.stringify(agentExecutions, null, 2))
          }
        }

        if (agentExecutions?.length > 0) {
          logger.info(`Found ${agentExecutions.length} executions in agents schema`)
          for (const execution of agentExecutions) {
            if (this.verbose) {
              logger.info(`[VERBOSE] Processing execution:`)
              logger.info(`[VERBOSE]   ID: ${execution.id}`)
              logger.info(`[VERBOSE]   Task ID: ${execution.task_id}`)
              logger.info(`[VERBOSE]   Status: ${execution.status}`)
              logger.info(`[VERBOSE]   Destination: ${execution.destination_id}`)
              logger.info(`[VERBOSE]   Claimed at: ${execution.claimed_at}`)
            }

            // Check if this execution needs to be claimed
            if (!execution.destination_id || execution.destination_id === this.destinationId) {
              // Try to claim the execution if it's not already claimed
              if (!execution.claimed_at) {
                const { data: claimedExecution, error: claimError } = await this.supabase
                  .schema('agents')
                  .from('executions')
                  .update({
                    destination_id: this.destinationId,
                    claimed_at: new Date().toISOString(),
                  })
                  .eq('id', execution.id)
                  .is('claimed_at', null)
                  .select()
                  .single()

                if (!claimError && claimedExecution) {
                  logger.info(`Successfully claimed execution: ${execution.id}`)
                  if (this.verbose) {
                    logger.info('[VERBOSE] Claimed execution details:', JSON.stringify(claimedExecution, null, 2))
                  }
                  // Map the execution to the expected format
                  const taskExecution: TaskExecution = {
                    id: claimedExecution.id,
                    taskId: claimedExecution.task_id,
                    trigger: claimedExecution.trigger || 'manual',
                    status: claimedExecution.status,
                    queuedAt: claimedExecution.queued_at,
                    startedAt: claimedExecution.started_at,
                    completedAt: claimedExecution.completed_at,
                    inputParams: claimedExecution.input_params || {},
                    outputResult: claimedExecution.output_result,
                    errorMessage: claimedExecution.error_message,
                    executionLogs: claimedExecution.execution_logs || [],
                    toolCalls: claimedExecution.tool_calls || [],
                    retryCount: claimedExecution.retry_count || 0,
                    context: claimedExecution.context || {},
                  }
                  if (this.verbose) {
                    logger.info(
                      '[VERBOSE] Calling onTaskAssigned with TaskExecution:',
                      JSON.stringify(taskExecution, null, 2),
                    )
                  }
                  this.onTaskAssigned(taskExecution)
                } else if (claimError) {
                  logger.debug(`Could not claim execution ${execution.id}: ${claimError.message}`)
                }
              } else if (execution.destination_id === this.destinationId) {
                // Already assigned to us and claimed, trigger execution anyway
                logger.info(`Execution ${execution.id} already assigned to us, processing...`)
                const taskExecution: TaskExecution = {
                  id: execution.id,
                  taskId: execution.task_id,
                  trigger: execution.trigger || 'manual',
                  status: execution.status,
                  queuedAt: execution.queued_at,
                  startedAt: execution.started_at,
                  completedAt: execution.completed_at,
                  inputParams: execution.input_params || {},
                  outputResult: execution.output_result,
                  errorMessage: execution.error_message,
                  executionLogs: execution.execution_logs || [],
                  toolCalls: execution.tool_calls || [],
                  retryCount: execution.retry_count || 0,
                  context: execution.context || {},
                }
                this.onTaskAssigned(taskExecution)
              }
            }
          }
        }
      }

      // Fallback: Check the default schema for executions (if different table structure)
      if (this.verbose) {
        logger.info(`[VERBOSE] Checking fallback: default schema executions table`)
      }

      const { data: assignedTasks, error: assignedError } = await this.supabase
        .from('executions')
        .select('*')
        .eq('destination_id', this.destinationId)
        .eq('status', 'pending')
        .is('claimed_at', null)
        .limit(10)

      if (assignedError) {
        if (this.verbose) {
          logger.info(`[VERBOSE] Fallback query error: ${assignedError.message}`)
        }
      } else if (this.verbose) {
        logger.info(`[VERBOSE] Fallback query returned ${assignedTasks?.length || 0} tasks`)
      }

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
    updates: Partial<TaskExecution> = {},
  ): Promise<void> {
    try {
      // Try to update in agents schema first
      const { error: agentsError } = await this.supabase
        .schema('agents')
        .from('executions')
        .update({
          status,
          ...updates,
          ...(status === 'running' && !(updates as any).started_at ? { started_at: new Date().toISOString() } : {}),
          ...(status === 'completed' || status === 'failed' ? { completed_at: new Date().toISOString() } : {}),
        })
        .eq('id', executionId)

      if (agentsError) {
        // Fallback to default schema
        const { error } = await this.supabase
          .from('executions')
          .update({
            status,
            ...updates,
            ...(status === 'running' && !(updates as any).started_at ? { started_at: new Date().toISOString() } : {}),
            ...(status === 'completed' || status === 'failed' ? { completed_at: new Date().toISOString() } : {}),
          })
          .eq('id', executionId)

        if (error) {
          logger.error(`Failed to update execution status: ${error.message}`)
          throw error
        }
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
    data?: Record<string, unknown>,
  ): Promise<void> {
    try {
      // Try agents schema first
      let execution: any = null
      let useAgentsSchema = true

      const { data: agentsExecution, error: agentsFetchError } = await this.supabase
        .schema('agents')
        .from('executions')
        .select('execution_logs')
        .eq('id', executionId)
        .single()

      if (!agentsFetchError && agentsExecution) {
        execution = agentsExecution
      } else {
        // Fallback to default schema
        const { data: defaultExecution, error: defaultFetchError } = await this.supabase
          .from('executions')
          .select('execution_logs')
          .eq('id', executionId)
          .single()

        if (!defaultFetchError && defaultExecution) {
          execution = defaultExecution
          useAgentsSchema = false
        } else {
          logger.error(`Failed to fetch execution: ${agentsFetchError?.message || defaultFetchError?.message}`)
          return
        }
      }

      const logs = execution?.execution_logs || []
      logs.push({
        timestamp: new Date().toISOString(),
        level,
        message,
        data,
      })

      // Update logs in the correct schema
      if (useAgentsSchema) {
        const { error: updateError } = await this.supabase
          .schema('agents')
          .from('executions')
          .update({ execution_logs: logs })
          .eq('id', executionId)

        if (updateError) {
          logger.error(`Failed to add execution log: ${updateError.message}`)
        }
      } else {
        const { error: updateError } = await this.supabase
          .from('executions')
          .update({ execution_logs: logs })
          .eq('id', executionId)

        if (updateError) {
          logger.error(`Failed to add execution log: ${updateError.message}`)
        }
      }
    } catch (error) {
      logger.error('Error adding execution log:', error)
    }
  }
}
