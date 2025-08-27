/**
 * Tests for Interactive Task Execution with Auto-Responses
 *
 * This test suite focuses specifically on the interactive command execution
 * and auto-response functionality of the TaskExecutor.
 */

import { spawn } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/agents.js'
import { TaskExecutor } from './task-executor.js'

// Mock child_process spawn
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

describe('TaskExecutor - Interactive Execution', () => {
  let mockSupabase: any
  let executor: TaskExecutor
  let mockChildProcess: any
  let consoleLogSpy: any

  const destinationId = 'dest-123'
  const organizationId = 'org-456'
  const executionId = 'exec-789'

  const mockTask: Task = {
    id: 'task-1',
    organization_id: organizationId,
    created_by: 'user-1',
    name: 'Claude Interactive Task',
    description: 'Test interactive execution',
    task_type: 'single',
    status: 'active',
    configuration: {},
    tools: [],
    parameters: {},
    workflow: [],
    require_auth: false,
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

  beforeEach(() => {
    // Mock console
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    // Setup Supabase mock
    const updateResult = {
      eq: vi.fn().mockResolvedValue({ error: null }),
    }

    mockSupabase = {
      schema: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnValue(updateResult),
      single: vi.fn().mockResolvedValue({
        data: {
          id: executionId,
          task_id: 'task-1',
          status: 'pending',
          queued_at: new Date().toISOString(),
          tasks: mockTask,
          input_params: {},
        },
        error: null,
      }),
    }

    // Create mock child process
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

    executor = new TaskExecutor(mockSupabase, destinationId, organizationId)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  describe('Interactive Command Detection', () => {
    it('should detect claude command as interactive', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: executionId,
          tasks: mockTask,
          input_params: { command: 'claude' },
        },
        error: null,
      })

      // Simulate successful completion
      mockChildProcess.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
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
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Interactive mode'))
    })

    it('should detect various interactive commands', async () => {
      const interactiveCommands = [
        'ssh user@host',
        'docker exec -it container bash',
        'vim file.txt',
        'python',
        'node',
        'mysql -u root',
        'psql',
        'redis-cli',
        'npm init',
        'git rebase -i HEAD~3',
      ]

      for (const command of interactiveCommands) {
        vi.clearAllMocks()

        mockSupabase.single.mockResolvedValue({
          data: {
            id: executionId,
            tasks: mockTask,
            input_params: { command },
          },
          error: null,
        })

        mockChildProcess.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
          if (event === 'close') {
            callback(0)
          }
          return mockChildProcess
        })

        await executor.executeTask(executionId)

        expect(spawn).toHaveBeenCalledWith(
          command,
          [],
          expect.objectContaining({
            shell: true,
            stdio: 'inherit',
          }),
        )
      }
    })
  })

  describe('Auto-Response Functionality', () => {
    it('should handle auto-responses with pattern triggers', async () => {
      const autoResponses = [
        {
          trigger: 'Would you like to',
          input: 'yes\n',
          delay: 100,
        },
        {
          trigger: 'Continue\\?',
          input: '\n',
          delay: 50,
        },
      ]

      mockSupabase.single.mockResolvedValue({
        data: {
          id: executionId,
          tasks: mockTask,
          input_params: {
            command: 'claude',
            autoResponses,
          },
        },
        error: null,
      })

      // Mock stdout data handler to simulate claude output
      let stdoutHandler: ((data: Buffer) => void) | null = null
      mockChildProcess.stdout.on.mockImplementation((event: string, handler: (data: Buffer) => void) => {
        if (event === 'data') {
          stdoutHandler = handler
        }
        return mockChildProcess.stdout
      })

      // Mock process behavior
      mockChildProcess.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'close') {
          // Simulate Claude asking for confirmation
          setTimeout(() => {
            if (stdoutHandler) {
              stdoutHandler(Buffer.from('Would you like to continue?'))
            }
            // Close after response
            setTimeout(() => callback(0), 200)
          }, 10)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Verify auto-response mode was used
      expect(spawn).toHaveBeenCalledWith(
        'claude',
        [],
        expect.objectContaining({
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'], // Pipes for auto-response
        }),
      )

      // Wait for auto-response to be sent
      await vi.waitFor(
        () => {
          expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('yes\n')
        },
        { timeout: 500 },
      )
    })

    it('should handle immediate auto-responses', async () => {
      const autoResponses = [
        {
          immediate: true,
          input: 'start command\n',
          delay: 50,
        },
      ]

      mockSupabase.single.mockResolvedValue({
        data: {
          id: executionId,
          tasks: mockTask,
          input_params: {
            command: 'claude',
            autoResponses,
          },
        },
        error: null,
      })

      mockChildProcess.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 150)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Immediate response should be sent quickly
      await vi.waitFor(
        () => {
          expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('start command\n')
        },
        { timeout: 200 },
      )
    })

    it('should handle delay-only auto-responses (no trigger)', async () => {
      const autoResponses = [
        {
          delay: 2000,
          input: 'continue\n',
        },
      ]

      mockSupabase.single.mockResolvedValue({
        data: {
          id: executionId,
          tasks: mockTask,
          input_params: {
            command: 'claude',
            autoResponses,
          },
        },
        error: null,
      })

      mockChildProcess.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 2500)
        }
        return mockChildProcess
      })

      const startTime = Date.now()
      await executor.executeTask(executionId)

      // Response should be sent after delay
      await vi.waitFor(
        () => {
          expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('continue\n')
          const elapsed = Date.now() - startTime
          expect(elapsed).toBeGreaterThanOrEqual(2000)
        },
        { timeout: 3000 },
      )
    })

    it('should handle closeAfter flag to terminate session', async () => {
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
          id: executionId,
          tasks: mockTask,
          input_params: {
            command: 'claude',
            autoResponses,
          },
        },
        error: null,
      })

      mockChildProcess.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 200)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Should send exit and kill the process
      await vi.waitFor(
        () => {
          expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('exit\n')
          expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGINT')
        },
        { timeout: 500 },
      )
    })

    it('should handle stderr triggers for auto-responses', async () => {
      const autoResponses = [
        {
          trigger: 'Error',
          input: 'retry\n',
          delay: 50,
        },
      ]

      mockSupabase.single.mockResolvedValue({
        data: {
          id: executionId,
          tasks: mockTask,
          input_params: {
            command: 'claude',
            autoResponses,
          },
        },
        error: null,
      })

      // Mock stderr data handler
      let stderrHandler: ((data: Buffer) => void) | null = null
      mockChildProcess.stderr.on.mockImplementation((event: string, handler: (data: Buffer) => void) => {
        if (event === 'data') {
          stderrHandler = handler
        }
        return mockChildProcess.stderr
      })

      mockChildProcess.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'close') {
          // Simulate error output
          setTimeout(() => {
            if (stderrHandler) {
              stderrHandler(Buffer.from('Error: Something went wrong'))
            }
            setTimeout(() => callback(0), 150)
          }, 10)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Should respond to stderr trigger
      await vi.waitFor(
        () => {
          expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('retry\n')
        },
        { timeout: 300 },
      )
    })
  })

  describe('Claude-Specific Auto-Responses', () => {
    it('should apply default Claude auto-responses when enabled', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: executionId,
          tasks: {
            ...mockTask,
            configuration: { autoClaudeResponses: true },
          },
          input_params: { command: 'claude' },
        },
        error: null,
      })

      let stdoutHandler: ((data: Buffer) => void) | null = null
      mockChildProcess.stdout.on.mockImplementation((event: string, handler: (data: Buffer) => void) => {
        if (event === 'data') {
          stdoutHandler = handler
        }
        return mockChildProcess.stdout
      })

      mockChildProcess.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'close') {
          // Simulate Claude prompts
          setTimeout(() => {
            if (stdoutHandler) {
              stdoutHandler(Buffer.from('Do you want to proceed with this action?'))
            }
            setTimeout(() => callback(0), 3000)
          }, 10)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Should auto-respond to Claude prompts
      await vi.waitFor(
        () => {
          expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('yes\n')
        },
        { timeout: 3500 },
      )
    })

    it('should handle the example scenario from the output', async () => {
      // This test represents the exact scenario shown in the user's output
      const autoResponses = [
        {
          delay: 2000,
          input: 'yes\n',
          trigger: 'Would you like to',
        },
        {
          delay: 15000,
          input: 'continue\n',
        },
      ]

      mockSupabase.single.mockResolvedValue({
        data: {
          id: executionId,
          tasks: {
            ...mockTask,
            name: 'Peppermintgrabber Fox',
            task_type: 'single',
          },
          input_params: {
            command: 'claude',
            autoResponses,
          },
        },
        error: null,
      })

      mockChildProcess.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'close') {
          // Simulate long-running Claude session
          setTimeout(() => callback(0), 20000)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Auto-response mode'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('2 response(s) configured'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Process started with PID'))
    })
  })

  describe('Workflow with Interactive Steps', () => {
    it('should handle workflows containing interactive steps', async () => {
      const workflowTask = {
        ...mockTask,
        task_type: 'workflow' as const,
        workflow: [
          { name: 'Setup', command: 'echo "Setting up"' },
          { name: 'Interactive Claude', command: 'claude', interactive: true },
          { name: 'Cleanup', command: 'echo "Cleaning up"' },
        ],
      }

      mockSupabase.single.mockResolvedValue({
        data: {
          id: executionId,
          tasks: workflowTask,
        },
        error: null,
      })

      mockChildProcess.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Should execute 3 steps
      expect(spawn).toHaveBeenCalledTimes(3)

      // Second step (Claude) should be interactive
      expect(spawn).toHaveBeenNthCalledWith(
        2,
        'claude',
        [],
        expect.objectContaining({
          shell: true,
          stdio: 'inherit',
        }),
      )

      // Other steps should use pipe stdio
      expect(spawn).toHaveBeenNthCalledWith(
        1,
        'echo "Setting up"',
        [],
        expect.objectContaining({
          shell: true,
          stdio: ['inherit', 'pipe', 'pipe'],
        }),
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle process errors in interactive mode', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: executionId,
          tasks: mockTask,
          input_params: { command: 'claude' },
        },
        error: null,
      })

      // Simulate command not found error
      mockChildProcess.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Command not found: claude')), 10)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Should update execution status to failed
      const updateResult = mockSupabase.update.mock.results[0].value
      expect(updateResult.eq).toHaveBeenCalledWith('id', executionId)
    })

    it('should handle timeout scenarios gracefully', async () => {
      const autoResponses = [
        {
          trigger: 'Never matches',
          input: 'response\n',
          delay: 100,
        },
      ]

      mockSupabase.single.mockResolvedValue({
        data: {
          id: executionId,
          tasks: mockTask,
          input_params: {
            command: 'claude',
            autoResponses,
          },
        },
        error: null,
      })

      let stdoutHandler: ((data: Buffer) => void) | null = null
      mockChildProcess.stdout.on.mockImplementation((event: string, handler: (data: Buffer) => void) => {
        if (event === 'data') {
          stdoutHandler = handler
        }
        return mockChildProcess.stdout
      })

      mockChildProcess.on.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'close') {
          // Send output that doesn't match trigger
          setTimeout(() => {
            if (stdoutHandler) {
              stdoutHandler(Buffer.from('Different output'))
            }
            // Close without matching trigger
            setTimeout(() => callback(0), 200)
          }, 10)
        }
        return mockChildProcess
      })

      await executor.executeTask(executionId)

      // Should not send the response since trigger didn't match
      expect(mockChildProcess.stdin.write).not.toHaveBeenCalled()
    })
  })
})
