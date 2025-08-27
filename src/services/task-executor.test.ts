/**
 * Tests for Task Executor Service
 */

import { spawn } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/agents.js'
import { TaskExecutor } from './task-executor.js'

// Mock child_process spawn
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

describe('TaskExecutor', () => {
  let mockSupabase: any
  let executor: TaskExecutor
  let consoleLogSpy: any
  let consoleErrorSpy: any

  const destinationId = 'dest-123'
  const organizationId = 'org-456'
  const executionId = 'exec-789'

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

  beforeEach(() => {
    // Mock console
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Mock process stdout/stderr
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    // Create a chainable mock Supabase client that returns itself for chaining
    mockSupabase = {
      schema: vi.fn(),
      from: vi.fn(),
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      update: vi.fn(),
      single: vi.fn(),
    }

    // Setup chaining - each method returns mockSupabase for chaining
    mockSupabase.schema.mockReturnValue(mockSupabase)
    mockSupabase.from.mockReturnValue(mockSupabase)
    mockSupabase.select.mockReturnValue(mockSupabase)
    mockSupabase.is.mockReturnValue(mockSupabase)

    // update() returns an object with eq() which returns a promise-like result
    const updateResult = {
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
    mockSupabase.update.mockReturnValue(updateResult)

    // eq() when used after select returns mockSupabase for continued chaining
    mockSupabase.eq.mockReturnValue(mockSupabase)

    // single() returns a promise-like result
    mockSupabase.single.mockResolvedValue({ data: null, error: null })

    executor = new TaskExecutor(mockSupabase as any, destinationId, organizationId)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  describe('executeTask', () => {
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
    let mockChildProcess: any

    beforeEach(() => {
      // Create a mock child process for tool execution
      mockChildProcess = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from('Tool output'))
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10)
          }
          return mockChildProcess
        }),
      }

      // Set up spawn mock
      vi.mocked(spawn).mockReturnValue(mockChildProcess as any)
    })

    it('should handle tool calls successfully', async () => {
      const tools = ['echo', 'date', 'pwd']

      const results = await executor.handleToolCalls(tools)

      expect(results).toHaveLength(3)
      expect(results[0]).toMatchObject({
        tool: 'echo',
        command: 'echo "Hello World!"',
        status: 'success',
        exitCode: 0,
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

  describe('interactive command execution', () => {
    let mockChildProcess: any

    beforeEach(() => {
      // Create a mock child process
      mockChildProcess = {
        pid: 12345,
        stdin: {
          write: vi.fn(),
        },
        stdout: {
          on: vi.fn(),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn(),
        kill: vi.fn(),
      }

      // Set up spawn mock
      vi.mocked(spawn).mockReturnValue(mockChildProcess as any)
    })

    it('should detect interactive commands correctly', async () => {
      const interactiveTask = {
        ...mockTask,
        task_type: 'single' as const,
        configuration: {},
      }

      mockSupabase.single.mockResolvedValue({
        data: {
          ...mockExecution,
          tasks: interactiveTask,
          input_params: { command: 'claude' },
        },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      // Simulate successful completion
      mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        [],
        expect.objectContaining({
          shell: true,
          stdio: 'inherit',
        }),
      )
    })

    it('should handle auto-responses with triggers', async () => {
      const interactiveTask = {
        ...mockTask,
        task_type: 'single' as const,
      }

      const autoResponses = [
        {
          trigger: 'Would you like to',
          input: 'yes\n',
          delay: 100,
        },
        {
          delay: 500,
          input: 'continue\n',
        },
      ]

      mockSupabase.single.mockResolvedValue({
        data: {
          ...mockExecution,
          tasks: interactiveTask,
          input_params: {
            command: 'claude',
            autoResponses,
          },
        },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      // Mock stdout data handler
      let stdoutHandler: ((data: Buffer) => void) | null = null
      mockChildProcess.stdout.on.mockImplementation((event: string, handler: (data: Buffer) => void) => {
        if (event === 'data') {
          stdoutHandler = handler
        }
        return mockChildProcess.stdout
      })

      // Mock process close
      mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          // Simulate output that triggers response
          setTimeout(() => {
            if (stdoutHandler) {
              stdoutHandler(Buffer.from('Would you like to continue?'))
            }
            // Close after a delay
            setTimeout(() => callback(0), 200)
          }, 10)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Verify spawn was called with pipe stdio for auto-response mode
      expect(spawn).toHaveBeenCalledWith(
        'claude',
        [],
        expect.objectContaining({
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      )

      // Verify auto-response was written
      await vi.waitFor(
        () => {
          expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('yes\n')
        },
        { timeout: 300 },
      )
    })

    it('should handle immediate auto-responses', async () => {
      const interactiveTask = {
        ...mockTask,
        task_type: 'single' as const,
      }

      const autoResponses = [
        {
          immediate: true,
          input: 'start\n',
          delay: 50,
        },
      ]

      mockSupabase.single.mockResolvedValue({
        data: {
          ...mockExecution,
          tasks: interactiveTask,
          input_params: {
            command: 'claude',
            autoResponses,
          },
        },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      // Mock process close
      mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 100)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Wait for immediate response to be sent
      await vi.waitFor(
        () => {
          expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('start\n')
        },
        { timeout: 200 },
      )
    })

    it('should handle closeAfter flag in auto-responses', async () => {
      const interactiveTask = {
        ...mockTask,
        task_type: 'single' as const,
      }

      const autoResponses = [
        {
          immediate: true,
          input: 'exit\n',
          delay: 50,
          closeAfter: true,
        },
      ]

      mockSupabase.single.mockResolvedValue({
        data: {
          ...mockExecution,
          tasks: interactiveTask,
          input_params: {
            command: 'claude',
            autoResponses,
          },
        },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      // Mock process close
      mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 200)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Wait for response and kill signal
      await vi.waitFor(
        () => {
          expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('exit\n')
          expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGINT')
        },
        { timeout: 500 },
      )
    })

    it('should handle workflow with interactive steps', async () => {
      const workflowTask = {
        ...mockTask,
        task_type: 'workflow' as const,
        workflow: [
          { name: 'Setup', command: 'echo "setup"' },
          { name: 'Interactive', command: 'claude', interactive: true },
          { name: 'Cleanup', command: 'echo "cleanup"' },
        ],
      }

      mockSupabase.single.mockResolvedValue({
        data: { ...mockExecution, tasks: workflowTask },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      // Mock successful execution for all steps
      mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Verify that spawn was called 3 times (one for each step)
      expect(spawn).toHaveBeenCalledTimes(3)

      // Verify the interactive step used inherit stdio
      expect(spawn).toHaveBeenNthCalledWith(
        2,
        'claude',
        [],
        expect.objectContaining({
          shell: true,
          stdio: 'inherit',
        }),
      )
    })

    it('should handle stderr triggers in auto-response mode', async () => {
      const interactiveTask = {
        ...mockTask,
        task_type: 'single' as const,
      }

      const autoResponses = [
        {
          trigger: 'Error occurred',
          input: 'retry\n',
          delay: 50,
        },
      ]

      mockSupabase.single.mockResolvedValue({
        data: {
          ...mockExecution,
          tasks: interactiveTask,
          input_params: {
            command: 'claude',
            autoResponses,
          },
        },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      // Mock stderr data handler
      let stderrHandler: ((data: Buffer) => void) | null = null
      mockChildProcess.stderr.on.mockImplementation((event: string, handler: (data: Buffer) => void) => {
        if (event === 'data') {
          stderrHandler = handler
        }
        return mockChildProcess.stderr
      })

      // Mock process close
      mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          // Simulate stderr output that triggers response
          setTimeout(() => {
            if (stderrHandler) {
              stderrHandler(Buffer.from('Error occurred: Please retry'))
            }
            // Close after a delay
            setTimeout(() => callback(0), 150)
          }, 10)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Verify auto-response was written
      await vi.waitFor(
        () => {
          expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('retry\n')
        },
        { timeout: 300 },
      )
    })

    it('should handle no output timeout for auto-response', async () => {
      const interactiveTask = {
        ...mockTask,
        task_type: 'single' as const,
      }

      const autoResponses = [
        {
          // No trigger - should send after no output timeout
          input: 'start\n',
          delay: 100,
        },
      ]

      mockSupabase.single.mockResolvedValue({
        data: {
          ...mockExecution,
          tasks: interactiveTask,
          input_params: {
            command: 'claude',
            autoResponses,
          },
        },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      // Mock process close without any output
      mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          // Don't send any output, just close after delay
          setTimeout(() => callback(0), 2500)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Should send response after initial timeout (2 seconds)
      await vi.waitFor(
        () => {
          expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('start\n')
        },
        { timeout: 3000 },
      )
    })

    it('should handle claude-specific auto-responses', async () => {
      const interactiveTask = {
        ...mockTask,
        task_type: 'single' as const,
        configuration: {
          autoClaudeResponses: true,
        },
      }

      mockSupabase.single.mockResolvedValue({
        data: {
          ...mockExecution,
          tasks: interactiveTask,
          input_params: {
            command: 'claude',
          },
        },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      // Mock stdout data handler
      let stdoutHandler: ((data: Buffer) => void) | null = null
      mockChildProcess.stdout.on.mockImplementation((event: string, handler: (data: Buffer) => void) => {
        if (event === 'data') {
          stdoutHandler = handler
        }
        return mockChildProcess.stdout
      })

      // Mock process close
      mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          // Simulate Claude-like output
          setTimeout(() => {
            if (stdoutHandler) {
              stdoutHandler(Buffer.from('Do you want to continue with this operation?'))
            }
            setTimeout(() => callback(0), 3000)
          }, 10)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Should send 'yes' for the Claude prompt
      await vi.waitFor(
        () => {
          expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('yes\n')
        },
        { timeout: 3500 },
      )
    })

    it('should handle process errors in interactive mode', async () => {
      const interactiveTask = {
        ...mockTask,
        task_type: 'single' as const,
      }

      mockSupabase.single.mockResolvedValue({
        data: {
          ...mockExecution,
          tasks: interactiveTask,
          input_params: { command: 'claude' },
        },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      // Mock process error
      mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Command not found')), 10)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: expect.stringContaining('Command not found'),
        }),
      )
    })

    it('should handle custom task with auto-responses', async () => {
      const customTask = {
        ...mockTask,
        task_type: 'custom' as const,
        configuration: {
          command: 'node repl',
          interactive: true,
        },
      }

      const autoResponses = [
        {
          immediate: true,
          input: 'console.log("Hello")\n',
          delay: 100,
        },
        {
          input: '.exit\n',
          delay: 500,
          closeAfter: true,
        },
      ]

      mockSupabase.single.mockResolvedValue({
        data: {
          ...mockExecution,
          tasks: customTask,
          input_params: { autoResponses },
        },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })

      // Mock process close
      mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 700)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Verify responses were sent
      await vi.waitFor(
        () => {
          expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('console.log("Hello")\n')
          expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('.exit\n')
        },
        { timeout: 800 },
      )
    })
  })
})
