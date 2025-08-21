/**
 * Tests for Task Executor Service
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/agents.js'
import { TaskExecutor } from './task-executor.js'

describe('TaskExecutor', () => {
  let mockSupabase: any
  let executor: TaskExecutor
  let consoleLogSpy: any
  let consoleErrorSpy: any

  const destinationId = 'dest-123'
  const organizationId = 'org-456'
  const executionId = 'exec-789'

  beforeEach(() => {
    // Mock console
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Mock Supabase client with proper chaining
    mockSupabase = {
      schema: vi.fn(() => mockSupabase),
      from: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
      eq: vi.fn(() => mockSupabase),
      is: vi.fn(() => mockSupabase),
      update: vi.fn(() => mockSupabase),
      single: vi.fn(() => mockSupabase),
    }

    executor = new TaskExecutor(mockSupabase, destinationId, organizationId)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('executeTask', () => {
    const mockTask: Task = {
      id: 'task-1',
      organization_id: organizationId,
      created_by: 'user-1',
      name: 'Test Task',
      description: 'A test task',
      task_type: 'single',
      status: 'active',
      configuration: {},
      tools: ['tool1', 'tool2'],
      parameters: {},
      workflow: [],
      require_auth: true,
      max_retries: 3,
      timeout_seconds: 300,
      version: 1,
      is_public: false,
      execution_count: 0,
      success_count: 0,
      failure_count: 0,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const mockExecution = {
      id: executionId,
      task_id: 'task-1',
      status: 'pending',
      queued_at: new Date().toISOString(),
      tasks: mockTask,
    }

    it('should execute a single task successfully', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockExecution,
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      await executor.executeTask(executionId)

      // Verify execution was fetched
      expect(mockSupabase.select).toHaveBeenCalledWith('*, tasks(*)')
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', executionId)

      // Verify execution was claimed
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          destination_id: destinationId,
          claimed_at: expect.any(String),
        }),
      )

      // Verify status updates
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
          started_at: expect.any(String),
        }),
      )

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          completed_at: expect.any(String),
          output_result: expect.objectContaining({
            status: 'success',
            message: expect.stringContaining('Test Task'),
          }),
        }),
      )

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Task execution completed successfully'))
    })

    it('should handle workflow task type', async () => {
      const workflowTask = {
        ...mockTask,
        task_type: 'workflow' as const,
        workflow: [{ name: 'Step 1' }, { name: 'Step 2' }, { name: 'Step 3' }],
      }

      mockSupabase.single.mockResolvedValue({
        data: { ...mockExecution, tasks: workflowTask },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      await executor.executeTask(executionId)

      // Verify workflow execution
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          output_result: expect.objectContaining({
            status: 'success',
            steps_completed: 3,
            results: expect.arrayContaining([
              expect.objectContaining({ step: 1, name: 'Step 1' }),
              expect.objectContaining({ step: 2, name: 'Step 2' }),
              expect.objectContaining({ step: 3, name: 'Step 3' }),
            ]),
          }),
        }),
      )
    })

    it('should handle batch task type', async () => {
      const batchTask = {
        ...mockTask,
        task_type: 'batch' as const,
      }

      mockSupabase.single.mockResolvedValue({
        data: {
          ...mockExecution,
          tasks: batchTask,
          input_params: { batch_size: 20 },
        },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      await executor.executeTask(executionId)

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          output_result: expect.objectContaining({
            status: 'success',
            items_processed: 20,
          }),
        }),
      )
    })

    it('should handle report task type', async () => {
      const reportTask = {
        ...mockTask,
        task_type: 'report' as const,
      }

      mockSupabase.single.mockResolvedValue({
        data: {
          ...mockExecution,
          tasks: reportTask,
          input_params: { report_type: 'analytics' },
        },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      await executor.executeTask(executionId)

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          output_result: expect.objectContaining({
            status: 'success',
            report_type: 'analytics',
          }),
        }),
      )
    })

    it('should handle monitoring task type', async () => {
      const monitoringTask = {
        ...mockTask,
        task_type: 'monitoring' as const,
      }

      mockSupabase.single.mockResolvedValue({
        data: { ...mockExecution, tasks: monitoringTask },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      await executor.executeTask(executionId)

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          output_result: expect.objectContaining({
            status: 'success',
            checks_performed: 5,
            alerts_triggered: 0,
          }),
        }),
      )
    })

    it('should handle custom task type', async () => {
      const customTask = {
        ...mockTask,
        task_type: 'custom' as const,
        configuration: { custom_field: 'value' },
      }

      mockSupabase.single.mockResolvedValue({
        data: { ...mockExecution, tasks: customTask },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      await executor.executeTask(executionId)

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          output_result: expect.objectContaining({
            status: 'success',
            configuration: { custom_field: 'value' },
          }),
        }),
      )
    })

    it('should handle execution fetch error', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: new Error('Execution not found'),
      })

      await executor.executeTask(executionId)

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch execution'),
        expect.any(Error),
      )
    })

    it('should handle missing task', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { ...mockExecution, tasks: null },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      await executor.executeTask(executionId)

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: 'Task not found',
        }),
      )
    })

    it('should handle task execution failure', async () => {
      // Mock task that will throw an error
      const errorTask = {
        ...mockTask,
        task_type: 'invalid' as any, // Invalid type to trigger error
      }

      mockSupabase.single.mockResolvedValue({
        data: { ...mockExecution, tasks: errorTask },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      await executor.executeTask(executionId)

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: expect.any(String),
          error_details: expect.any(Object),
        }),
      )
    })

    it('should handle claim conflict', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockExecution,
        error: null,
      })

      // Simulate claim failure (already claimed by another destination)
      mockSupabase.update.mockResolvedValueOnce({
        error: new Error('Execution already claimed'),
      })

      await executor.executeTask(executionId)

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Task execution failed'), expect.any(Error))
    })
  })

  describe('handleToolCalls', () => {
    it('should handle tool calls successfully', async () => {
      const tools = ['tool1', 'tool2', 'tool3']

      const results = await executor.handleToolCalls(tools)

      expect(results).toHaveLength(3)
      expect(results[0]).toEqual({
        tool: 'tool1',
        status: 'success',
        result: 'Tool tool1 executed successfully',
      })
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Handling 3 tool calls'))
    })

    it('should handle empty tool list', async () => {
      const results = await executor.handleToolCalls([])

      expect(results).toHaveLength(0)
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Handling 0 tool calls'))
    })
  })

  describe('error handling', () => {
    it('should handle update status errors gracefully', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: executionId,
          task_id: 'task-1',
          status: 'pending',
          queued_at: new Date().toISOString(),
          tasks: null, // Will trigger task not found
        },
        error: null,
      })

      // Make update fail
      mockSupabase.update.mockResolvedValue({
        error: new Error('Update failed'),
      })

      await executor.executeTask(executionId)

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update execution status'),
        expect.stringContaining('Update failed'),
      )
    })
  })
})
