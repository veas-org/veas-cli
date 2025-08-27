/**
 * Task Executor
 *
 * Executes tasks based on their configuration and workflow
 */

import { createClient } from '@supabase/supabase-js'
import type { MCPClient } from '../mcp/mcp-client.js'
import { logger } from '../utils/logger.js'
import type { RealtimeService } from './realtime-service.js'
import type { Task, TaskExecution, ToolCall, WorkflowStep } from './types.js'

export class TaskExecutor {
  private realtimeService: RealtimeService
  private mcpClient: MCPClient
  private supabase: any
  private activeExecutions: Map<string, TaskExecution> = new Map()
  private maxConcurrentTasks: number

  constructor(
    realtimeService: RealtimeService,
    mcpClient: MCPClient,
    supabaseUrl: string,
    supabaseAnonKey: string,
    maxConcurrentTasks = 1,
  ) {
    this.realtimeService = realtimeService
    this.mcpClient = mcpClient
    this.maxConcurrentTasks = maxConcurrentTasks

    this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }

  /**
   * Check if we can accept more tasks
   */
  canAcceptTask(): boolean {
    return this.activeExecutions.size < this.maxConcurrentTasks
  }

  /**
   * Execute a task
   */
  async executeTask(execution: TaskExecution): Promise<void> {
    if (!this.canAcceptTask()) {
      logger.warn(`Cannot accept task ${execution.id}, at capacity`)
      return
    }

    logger.info(`Starting execution of task ${execution.id}`)
    this.activeExecutions.set(execution.id, execution)

    try {
      // Update status to running
      await this.realtimeService.updateExecutionStatus(execution.id, 'running', {
        startedAt: new Date().toISOString(),
      } as any)

      // Log execution start
      await this.realtimeService.addExecutionLog(execution.id, 'info', 'Task execution started', {
        taskId: execution.taskId,
      })

      // Fetch the full task details
      const task = await this.fetchTask(execution.taskId)
      if (!task) {
        throw new Error(`Task ${execution.taskId} not found`)
      }

      // Execute the task based on its type
      const result = await this.executeTaskWorkflow(execution, task)

      // Update execution with success
      await this.realtimeService.updateExecutionStatus(execution.id, 'completed', {
        outputResult: result,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(execution.startedAt || execution.queuedAt).getTime(),
      } as any)

      // Log execution completion
      await this.realtimeService.addExecutionLog(execution.id, 'info', 'Task execution completed successfully', {
        result,
      })

      logger.info(`Task ${execution.id} completed successfully`)
    } catch (error: unknown) {
      logger.error(`Task ${execution.id} failed:`, error)

      // Update execution with failure
      await this.realtimeService.updateExecutionStatus(execution.id, 'failed', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorDetails: {
          stack: error instanceof Error ? error.stack : undefined,
          code: error instanceof Error ? (error as any).code : undefined,
        },
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(execution.startedAt || execution.queuedAt).getTime(),
      } as any)

      // Log execution failure
      await this.realtimeService.addExecutionLog(execution.id, 'error', 'Task execution failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.activeExecutions.delete(execution.id)
    }
  }

  /**
   * Fetch task details
   */
  private async fetchTask(taskId: string): Promise<Task | null> {
    try {
      const { data, error } = await this.supabase.from('tasks').select('*').eq('id', taskId).single()

      if (error) {
        logger.error(`Failed to fetch task ${taskId}:`, error)
        return null
      }

      return data as Task
    } catch (error) {
      logger.error(`Error fetching task ${taskId}:`, error)
      return null
    }
  }

  /**
   * Execute task workflow
   */
  private async executeTaskWorkflow(execution: TaskExecution, task: Task): Promise<any> {
    const workflow = task.workflow || []
    const context: Record<string, unknown> = {
      ...execution.inputParams,
      executionId: execution.id,
      taskId: task.id,
    }

    let result: any = null

    for (const step of workflow) {
      try {
        logger.debug(`Executing workflow step: ${step.name}`)

        // Log step start
        await this.realtimeService.addExecutionLog(execution.id, 'debug', `Starting workflow step: ${step.name}`, {
          step,
        })

        result = await this.executeWorkflowStep(execution, step, context)

        // Update context with step result
        context[step.id] = result

        // Log step completion
        await this.realtimeService.addExecutionLog(execution.id, 'debug', `Completed workflow step: ${step.name}`, {
          result,
        })

        // Handle step success
        if (step.onSuccess) {
          // Jump to specified step
          const nextStepIndex = workflow.findIndex(s => s.id === step.onSuccess)
          if (nextStepIndex >= 0) {
          }
        }
      } catch (error: unknown) {
        logger.error(`Workflow step ${step.name} failed:`, error)

        // Log step failure
        await this.realtimeService.addExecutionLog(execution.id, 'error', `Workflow step failed: ${step.name}`, {
          error: error instanceof Error ? error.message : String(error),
        })

        // Handle step failure
        if (step.retryOnFailure) {
          // Retry the step
          logger.info(`Retrying step ${step.name}`)
          try {
            result = await this.executeWorkflowStep(execution, step, context)
            context[step.id] = result
          } catch (retryError) {
            if (!step.continueOnError) {
              throw retryError
            }
          }
        } else if (!step.continueOnError) {
          throw error
        }

        // Handle failure jump
        if (step.onFailure) {
          const nextStepIndex = workflow.findIndex(s => s.id === step.onFailure)
          if (nextStepIndex >= 0) {
          }
        }
      }
    }

    return result
  }

  /**
   * Execute a single workflow step
   */
  private async executeWorkflowStep(
    execution: TaskExecution,
    step: WorkflowStep,
    context: Record<string, unknown>,
  ): Promise<any> {
    switch (step.type) {
      case 'tool':
        return await this.executeToolStep(execution, step, context)

      case 'condition':
        return await this.executeConditionStep(step, context)

      case 'loop':
        return await this.executeLoopStep(execution, step, context)

      case 'parallel':
        return await this.executeParallelStep(execution, step, context)

      case 'transform':
        return await this.executeTransformStep(step, context)

      default:
        throw new Error(`Unknown step type: ${step.type}`)
    }
  }

  /**
   * Execute a tool step
   */
  private async executeToolStep(
    execution: TaskExecution,
    step: WorkflowStep,
    context: Record<string, unknown>,
  ): Promise<any> {
    if (!step.tool) {
      throw new Error('Tool step missing tool name')
    }

    const params = this.resolveParams(step.params || {}, context)

    // Record tool call
    const toolCall: ToolCall = {
      id: `${execution.id}-${step.id}-${Date.now()}`,
      tool: step.tool,
      params,
      startedAt: new Date().toISOString(),
    }

    try {
      // Execute the MCP tool
      const result = await this.mcpClient.callTool(step.tool, params)

      // Update tool call with result
      toolCall.completedAt = new Date().toISOString()
      toolCall.durationMs = Date.now() - new Date(toolCall.startedAt).getTime()
      toolCall.result = result

      // Save tool call to execution
      await this.recordToolCall(execution.id, toolCall)

      return result
    } catch (error: unknown) {
      // Update tool call with error
      toolCall.completedAt = new Date().toISOString()
      toolCall.durationMs = Date.now() - new Date(toolCall.startedAt).getTime()
      toolCall.error = error instanceof Error ? error.message : String(error)

      // Save tool call to execution
      await this.recordToolCall(execution.id, toolCall)

      throw error
    }
  }

  /**
   * Execute a condition step
   */
  private async executeConditionStep(step: WorkflowStep, context: Record<string, unknown>): Promise<boolean> {
    if (!step.condition) {
      throw new Error('Condition step missing condition')
    }

    const { type, expression, left, operator, right } = step.condition

    if (type === 'expression') {
      // Evaluate JavaScript expression (be careful with this!)
      // In production, use a safe expression evaluator
      try {
        const func = new Function('context', `return ${expression}`)
        return func(context)
      } catch (_error) {
        throw new Error(`Invalid condition expression: ${expression}`)
      }
    } else if (type === 'comparison') {
      const leftValue = this.resolveValue(left, context)
      const rightValue = this.resolveValue(right, context)

      switch (operator) {
        case '==':
        case '===':
          return leftValue === rightValue
        case '!=':
        case '!==':
          return leftValue !== rightValue
        case '>':
          return leftValue > rightValue
        case '>=':
          return leftValue >= rightValue
        case '<':
          return leftValue < rightValue
        case '<=':
          return leftValue <= rightValue
        case 'contains':
          return String(leftValue).includes(String(rightValue))
        case 'startsWith':
          return String(leftValue).startsWith(String(rightValue))
        case 'endsWith':
          return String(leftValue).endsWith(String(rightValue))
        default:
          throw new Error(`Unknown operator: ${operator}`)
      }
    }

    return false
  }

  /**
   * Execute a loop step
   */
  private async executeLoopStep(
    _execution: TaskExecution,
    _step: WorkflowStep,
    _context: Record<string, unknown>,
  ): Promise<any[]> {
    // TODO: Implement loop execution
    logger.warn('Loop steps not yet implemented')
    return []
  }

  /**
   * Execute a parallel step
   */
  private async executeParallelStep(
    _execution: TaskExecution,
    _step: WorkflowStep,
    _context: Record<string, unknown>,
  ): Promise<any[]> {
    // TODO: Implement parallel execution
    logger.warn('Parallel steps not yet implemented')
    return []
  }

  /**
   * Execute a transform step
   */
  private async executeTransformStep(step: WorkflowStep, context: Record<string, unknown>): Promise<any> {
    const params = this.resolveParams(step.params || {}, context)

    // Simple JSON transformation
    // In production, use a proper transformation library
    return params
  }

  /**
   * Resolve parameters with context values
   */
  private resolveParams(params: Record<string, unknown>, context: Record<string, unknown>): Record<string, unknown> {
    const resolved: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(params)) {
      resolved[key] = this.resolveValue(value, context)
    }

    return resolved
  }

  /**
   * Resolve a value with context
   */
  private resolveValue(value: any, context: Record<string, unknown>): any {
    if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
      // Template variable: {{variable}}
      const varName = value.slice(2, -2).trim()
      return this.getNestedValue(context, varName)
    } else if (typeof value === 'object' && value !== null) {
      // Recursively resolve object values
      if (Array.isArray(value)) {
        return value.map(v => this.resolveValue(v, context))
      } else {
        const resolved: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value)) {
          resolved[k] = this.resolveValue(v, context)
        }
        return resolved
      }
    }

    return value
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.')
    let current = obj

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined
      }
      current = current[part]
    }

    return current
  }

  /**
   * Record a tool call
   */
  private async recordToolCall(executionId: string, toolCall: ToolCall): Promise<void> {
    try {
      // Get current tool calls
      const { data: execution, error: fetchError } = await this.supabase
        .from('executions')
        .select('tool_calls')
        .eq('id', executionId)
        .single()

      if (fetchError) {
        logger.error(`Failed to fetch execution: ${fetchError.message}`)
        return
      }

      const toolCalls = execution?.tool_calls || []
      toolCalls.push(toolCall)

      // Update tool calls and count
      const { error: updateError } = await this.supabase
        .from('executions')
        .update({
          tool_calls: toolCalls,
          tool_calls_count: toolCalls.length,
        })
        .eq('id', executionId)

      if (updateError) {
        logger.error(`Failed to record tool call: ${updateError.message}`)
      }
    } catch (error) {
      logger.error('Error recording tool call:', error)
    }
  }

  /**
   * Get active executions count
   */
  getActiveExecutionsCount(): number {
    return this.activeExecutions.size
  }

  /**
   * Get active execution IDs
   */
  getActiveExecutionIds(): string[] {
    return Array.from(this.activeExecutions.keys())
  }
}
