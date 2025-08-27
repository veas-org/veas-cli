/**
 * Tests for Schedule Monitor Service
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScheduleMonitor } from './schedule-monitor.js'
import { TaskExecutor } from './task-executor.js'

// Mock TaskExecutor
vi.mock('./task-executor.js')

describe('ScheduleMonitor', () => {
  let mockSupabase: unknown
  let monitor: ScheduleMonitor
  let consoleLogSpy: any
  let consoleErrorSpy: any

  const destinationId = 'dest-123'
  const organizationId = 'org-456'

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
      lte: vi.fn(() => mockSupabase),
      insert: vi.fn(() => mockSupabase),
      update: vi.fn(() => mockSupabase),
      single: vi.fn(() => mockSupabase),
      channel: vi.fn(),
    }

    // Mock TaskExecutor
    vi.mocked(TaskExecutor).mockImplementation(
      () =>
        ({
          executeTask: vi.fn().mockResolvedValue(undefined),
          handleToolCalls: vi.fn().mockResolvedValue([]),
        }) as any,
    )

    monitor = new ScheduleMonitor(mockSupabase, destinationId, organizationId)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  describe('start', () => {
    it('should initialize monitoring and subscriptions', async () => {
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(callback => {
          callback('SUBSCRIBED')
          return mockChannel
        }),
        unsubscribe: vi.fn(),
      }

      mockSupabase.channel.mockReturnValue(mockChannel)
      mockSupabase.update.mockResolvedValue({ error: null })
      mockSupabase.insert.mockResolvedValue({ error: null })
      mockSupabase.select.mockResolvedValue({
        data: [{ id: 'task-1' }],
        error: null,
      })

      vi.useFakeTimers()

      await monitor.start()

      // Verify destination status update
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'online',
          last_heartbeat_at: expect.any(String),
        }),
      )

      // Verify channel subscriptions
      expect(mockSupabase.channel).toHaveBeenCalledWith(`executions-${destinationId}`)
      expect(mockSupabase.channel).toHaveBeenCalledWith(`schedules-${organizationId}`)

      // Verify heartbeat started
      vi.advanceTimersByTime(60000)
      expect(mockSupabase.insert).toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('should handle tasks query error gracefully', async () => {
      mockSupabase.select.mockResolvedValue({
        data: null,
        error: new Error('Query failed'),
      })
      mockSupabase.update.mockResolvedValue({ error: null })
      mockSupabase.insert.mockResolvedValue({ error: null })

      await monitor.start()

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No tasks found for organization'))
    })
  })

  describe('stop', () => {
    it('should clean up resources and update status', async () => {
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(callback => {
          callback('SUBSCRIBED')
          return mockChannel
        }),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      }

      mockSupabase.channel.mockReturnValue(mockChannel)
      mockSupabase.update.mockResolvedValue({ error: null })
      mockSupabase.insert.mockResolvedValue({ error: null })
      mockSupabase.select.mockResolvedValue({
        data: [{ id: 'task-1' }],
        error: null,
      })

      await monitor.start()
      await monitor.stop()

      // Verify channels unsubscribed
      expect(mockChannel.unsubscribe).toHaveBeenCalledTimes(2)

      // Verify destination status update to offline
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'offline',
        }),
      )
    })
  })

  describe('execution handling', () => {
    it('should handle new execution INSERT event', async () => {
      const mockChannel = {
        on: vi.fn((_event, config, handler) => {
          // Simulate an INSERT event
          if (config.table === 'executions') {
            setTimeout(() => {
              handler({
                eventType: 'INSERT',
                new: {
                  id: 'exec-1',
                  status: 'pending',
                  destination_id: destinationId,
                },
              })
            }, 10)
          }
          return mockChannel
        }),
        subscribe: vi.fn(callback => {
          callback('SUBSCRIBED')
          return mockChannel
        }),
        unsubscribe: vi.fn(),
      }

      mockSupabase.channel.mockReturnValue(mockChannel)
      mockSupabase.update.mockResolvedValue({ error: null })
      mockSupabase.insert.mockResolvedValue({ error: null })
      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null,
      })

      await monitor.start()

      // Wait for event to be processed
      await new Promise(resolve => setTimeout(resolve, 20))

      const taskExecutor = (TaskExecutor as any).mock.results[0].value
      expect(taskExecutor.executeTask).toHaveBeenCalledWith('exec-1')
    })

    it('should handle execution UPDATE event for unclaimed tasks', async () => {
      const mockChannel = {
        on: vi.fn((_event, config, handler) => {
          // Simulate an UPDATE event
          if (config.table === 'executions') {
            setTimeout(() => {
              handler({
                eventType: 'UPDATE',
                new: {
                  id: 'exec-2',
                  status: 'pending',
                  destination_id: destinationId,
                  claimed_at: null,
                },
              })
            }, 10)
          }
          return mockChannel
        }),
        subscribe: vi.fn(callback => {
          callback('SUBSCRIBED')
          return mockChannel
        }),
        unsubscribe: vi.fn(),
      }

      mockSupabase.channel.mockReturnValue(mockChannel)
      mockSupabase.update.mockResolvedValue({ error: null })
      mockSupabase.insert.mockResolvedValue({ error: null })
      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null,
      })

      await monitor.start()

      // Wait for event to be processed
      await new Promise(resolve => setTimeout(resolve, 20))

      const taskExecutor = (TaskExecutor as any).mock.results[0].value
      expect(taskExecutor.executeTask).toHaveBeenCalledWith('exec-2')
    })
  })

  describe('schedule checking', () => {
    it('should check for due schedules periodically', async () => {
      const mockSchedules = [
        {
          id: 'sched-1',
          task_id: 'task-1',
          schedule_type: 'interval',
          interval_seconds: 60,
          next_run_at: new Date(Date.now() - 1000).toISOString(),
          tasks: {
            id: 'task-1',
            name: 'Test Task',
            organization_id: organizationId,
            status: 'active',
          },
        },
      ]

      mockSupabase.lte.mockResolvedValue({
        data: mockSchedules,
        error: null,
      })

      mockSupabase.single.mockResolvedValue({
        data: { id: 'exec-new' },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })
      mockSupabase.insert.mockResolvedValue({ error: null })
      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null,
      })

      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(callback => {
          callback('SUBSCRIBED')
          return mockChannel
        }),
        unsubscribe: vi.fn(),
      }

      mockSupabase.channel.mockReturnValue(mockChannel)

      vi.useFakeTimers()

      await monitor.start()

      // Advance timer to trigger schedule check
      vi.advanceTimersByTime(30000)

      // Wait for async operations
      await vi.runAllTimersAsync()

      // Verify schedule was checked
      expect(mockSupabase.lte).toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('should trigger execution for due schedule', async () => {
      const mockSchedule = {
        id: 'sched-1',
        task_id: 'task-1',
        schedule_type: 'interval',
        interval_seconds: 60,
        next_run_at: new Date(Date.now() - 1000).toISOString(),
        run_count: 5,
        tasks: {
          id: 'task-1',
          name: 'Test Task',
          organization_id: organizationId,
          status: 'active',
        },
      }

      mockSupabase.lte.mockResolvedValue({
        data: [mockSchedule],
        error: null,
      })

      mockSupabase.single.mockResolvedValue({
        data: { id: 'exec-new', task_id: 'task-1' },
        error: null,
      })

      mockSupabase.select.mockResolvedValue({
        data: { id: 'exec-new', task_id: 'task-1' },
        error: null,
      })

      mockSupabase.update.mockResolvedValue({ error: null })
      mockSupabase.insert.mockResolvedValue({
        data: { id: 'exec-new' },
        error: null,
      })

      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(callback => {
          callback('SUBSCRIBED')
          return mockChannel
        }),
        unsubscribe: vi.fn(),
      }

      mockSupabase.channel.mockReturnValue(mockChannel)

      vi.useFakeTimers()

      await monitor.start()

      // Trigger immediate check
      vi.advanceTimersByTime(1)
      await vi.runAllTimersAsync()

      // Verify execution was created
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'task-1',
          schedule_id: 'sched-1',
          destination_id: destinationId,
          status: 'pending',
          trigger: 'scheduled',
        }),
      )

      // Verify schedule was updated
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          next_run_at: expect.any(String),
          last_run_at: expect.any(String),
          run_count: 6,
        }),
      )

      vi.useRealTimers()
    })
  })

  describe('heartbeat', () => {
    it('should send heartbeats periodically', async () => {
      mockSupabase.update.mockResolvedValue({ error: null })
      mockSupabase.insert.mockResolvedValue({ error: null })
      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null,
      })

      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(callback => {
          callback('SUBSCRIBED')
          return mockChannel
        }),
        unsubscribe: vi.fn(),
      }

      mockSupabase.channel.mockReturnValue(mockChannel)

      vi.useFakeTimers()

      await monitor.start()

      // Initial heartbeat
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          destination_id: destinationId,
          status: 'online',
          active_tasks: 0,
          queued_tasks: 0,
        }),
      )

      // Advance timer for next heartbeat
      vi.advanceTimersByTime(60000)

      // Verify second heartbeat
      expect(mockSupabase.insert).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })

    it('should handle heartbeat errors gracefully', async () => {
      mockSupabase.update.mockResolvedValue({ error: null })
      mockSupabase.insert.mockResolvedValue({
        error: new Error('Heartbeat failed'),
      })
      mockSupabase.select.mockResolvedValue({
        data: [],
        error: null,
      })

      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(callback => {
          callback('SUBSCRIBED')
          return mockChannel
        }),
        unsubscribe: vi.fn(),
      }

      mockSupabase.channel.mockReturnValue(mockChannel)

      await monitor.start()

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send heartbeat'),
        expect.any(Error),
      )
    })
  })
})
