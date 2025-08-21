/**
 * Tests for destination commands
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as prompts from '@clack/prompts'
import { createClient } from '@supabase/supabase-js'
import { hostname } from 'node:os'
import { AuthManager } from '../auth/auth-manager.js'

// Mock dependencies first before importing the module
vi.mock('@clack/prompts')
vi.mock('@supabase/supabase-js')
vi.mock('../auth/auth-manager.js')

// Create a properly scoped mock spinner
const mockSpinner = {
  start: vi.fn(),
  stop: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  text: '',
}

// Set up method chaining for spinner
Object.keys(mockSpinner).forEach(key => {
  if (typeof mockSpinner[key as keyof typeof mockSpinner] === 'function') {
    mockSpinner[key as keyof typeof mockSpinner].mockReturnValue(mockSpinner)
  }
})

// Mock ora before importing the module that uses it
vi.mock('ora', () => ({
  default: vi.fn(() => mockSpinner),
}))

// Now import the module being tested
import {
  deleteDestination,
  listDestinations,
  registerDestination,
  watchDestination,
} from './destination.js'

describe('Destination Commands', () => {
  let mockSupabase: any
  let mockAuthManager: any
  let mockSession: any
  let consoleLogSpy: any
  let processExitSpy: any

  beforeEach(() => {
    // Setup mocks
    mockSession = {
      user: { id: 'user-123' },
      token: 'test-token',
    }

    mockAuthManager = {
      getSession: vi.fn().mockResolvedValue(mockSession),
    }

    mockSupabase = {
      from: vi.fn(() => mockSupabase),
      schema: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
      eq: vi.fn(() => mockSupabase),
      single: vi.fn(() => mockSupabase),
      insert: vi.fn(() => mockSupabase),
      delete: vi.fn(() => mockSupabase),
      order: vi.fn(() => mockSupabase),
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      })),
      removeChannel: vi.fn(),
    }

    vi.mocked(AuthManager.getInstance).mockReturnValue(mockAuthManager)
    vi.mocked(createClient).mockReturnValue(mockSupabase)

    // Mock console.log to suppress output during tests
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exit')
    })

    // Set up environment variables
    process.env.SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  describe('listDestinations', () => {
    it('should list destinations successfully', async () => {
      const mockDestinations = [
        {
          id: 'dest-1',
          name: 'Test Server 1',
          hostname: 'server1.example.com',
          status: 'online',
          max_concurrent_tasks: 3,
          last_heartbeat_at: new Date().toISOString(),
          total_executions: 100,
          successful_executions: 95,
          tags: ['production'],
        },
        {
          id: 'dest-2',
          name: 'Test Server 2',
          hostname: 'server2.example.com',
          status: 'offline',
          max_concurrent_tasks: 5,
          last_heartbeat_at: null,
          total_executions: 0,
          successful_executions: 0,
          tags: [],
        },
      ]

      mockSupabase.single.mockResolvedValue({
        data: { organization_id: 'org-123' },
        error: null,
      })

      mockSupabase.order.mockResolvedValue({
        data: mockDestinations,
        error: null,
      })

      await listDestinations({})

      expect(mockAuthManager.getSession).toHaveBeenCalled()
      expect(mockSupabase.from).toHaveBeenCalledWith('organization_members')
      expect(mockSupabase.from).toHaveBeenCalledWith('agent_destinations')
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test Server 1'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test Server 2'))
    })

    it('should output JSON when json option is true', async () => {
      const mockDestinations = [
        {
          id: 'dest-1',
          name: 'Test Server',
          hostname: 'server.example.com',
          status: 'online',
        },
      ]

      mockSupabase.single.mockResolvedValue({
        data: { organization_id: 'org-123' },
        error: null,
      })

      mockSupabase.order.mockResolvedValue({
        data: mockDestinations,
        error: null,
      })

      await listDestinations({ json: true })

      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(mockDestinations, null, 2))
    })

    it('should handle empty destinations list', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { organization_id: 'org-123' },
        error: null,
      })

      mockSupabase.order.mockResolvedValue({
        data: [],
        error: null,
      })

      await listDestinations({})

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No destinations found'))
    })

    it('should handle authentication failure', async () => {
      mockAuthManager.getSession.mockResolvedValue(null)

      await expect(listDestinations({})).rejects.toThrow('Process exit')
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should handle API errors', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { organization_id: 'org-123' },
        error: null,
      })

      mockSupabase.order.mockResolvedValue({
        data: null,
        error: new Error('Database error'),
      })

      await expect(listDestinations({})).rejects.toThrow('Process exit')
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('registerDestination', () => {
    it('should register destination successfully', async () => {
      // Mock prompts
      vi.mocked(prompts.text)
        .mockResolvedValueOnce('my-agent-server') // name
        .mockResolvedValueOnce('agent-server.example.com') // hostname
        .mockResolvedValueOnce('3') // max tasks

      vi.mocked(prompts.isCancel).mockReturnValue(false)

      mockSupabase.single.mockResolvedValueOnce({
        data: { organization_id: 'org-123' },
        error: null,
      })

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'dest-123',
          name: 'my-agent-server',
          hostname: 'agent-server.example.com',
          max_concurrent_tasks: 3,
        },
        error: null,
      })

      await registerDestination({})

      expect(mockAuthManager.getSession).toHaveBeenCalled()
      expect(prompts.text).toHaveBeenCalledTimes(3)
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'my-agent-server',
          hostname: 'agent-server.example.com',
          max_concurrent_tasks: 3,
          status: 'offline',
          is_active: true,
        }),
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ Destination Details:'))
    })

    it('should use system hostname as default', async () => {
      const systemHostname = hostname()
      
      vi.mocked(prompts.text)
        .mockResolvedValueOnce('my-agent-server') // name
        .mockImplementationOnce((options: any) => {
          expect(options.initialValue).toBe(systemHostname)
          return Promise.resolve('custom-hostname.com')
        })
        .mockResolvedValueOnce('5') // max tasks

      vi.mocked(prompts.isCancel).mockReturnValue(false)

      mockSupabase.single.mockResolvedValueOnce({
        data: { organization_id: 'org-123' },
        error: null,
      })

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'dest-123',
          name: 'my-agent-server',
          hostname: 'custom-hostname.com',
        },
        error: null,
      })

      await registerDestination({})

      expect(prompts.text).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Hostname:',
          initialValue: systemHostname,
        }),
      )
    })

    it('should validate required fields', async () => {
      vi.mocked(prompts.text).mockImplementationOnce((options: any) => {
        const result = options.validate?.('')
        expect(result).toBe('Name is required')
        return Promise.resolve('valid-name')
      })

      vi.mocked(prompts.text)
        .mockResolvedValueOnce('valid-hostname')
        .mockResolvedValueOnce('3')

      vi.mocked(prompts.isCancel).mockReturnValue(false)

      mockSupabase.single.mockResolvedValueOnce({
        data: { organization_id: 'org-123' },
        error: null,
      })

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'dest-123', name: 'valid-name' },
        error: null,
      })

      await registerDestination({})

      expect(prompts.text).toHaveBeenCalled()
    })

    it('should validate max tasks is a positive number', async () => {
      vi.mocked(prompts.text)
        .mockResolvedValueOnce('my-server')
        .mockResolvedValueOnce('hostname.com')
        .mockImplementationOnce((options: any) => {
          expect(options.validate?.('0')).toBe('Must be a positive number')
          expect(options.validate?.('-5')).toBe('Must be a positive number')
          expect(options.validate?.('abc')).toBe('Must be a positive number')
          expect(options.validate?.('3')).toBeUndefined()
          return Promise.resolve('3')
        })

      vi.mocked(prompts.isCancel).mockReturnValue(false)

      mockSupabase.single.mockResolvedValueOnce({
        data: { organization_id: 'org-123' },
        error: null,
      })

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'dest-123' },
        error: null,
      })

      await registerDestination({})
    })

    it('should handle cancellation', async () => {
      vi.mocked(prompts.text).mockResolvedValueOnce('cancelled-input')
      vi.mocked(prompts.isCancel).mockReturnValue(true)

      await expect(registerDestination({})).rejects.toThrow('Process exit')
      expect(processExitSpy).toHaveBeenCalledWith(0)
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Registration cancelled'))
    })

    it('should generate and hash API key', async () => {
      vi.mocked(prompts.text)
        .mockResolvedValueOnce('my-server')
        .mockResolvedValueOnce('hostname.com')
        .mockResolvedValueOnce('3')

      vi.mocked(prompts.isCancel).mockReturnValue(false)

      mockSupabase.single.mockResolvedValueOnce({
        data: { organization_id: 'org-123' },
        error: null,
      })

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'dest-123', name: 'my-server' },
        error: null,
      })

      await registerDestination({})

      // Check that API key hash was included in insert
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          api_key_hash: expect.any(String),
        }),
      )

      // Check that API key is displayed to user
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('dest_'))
    })

    it('should handle organization not found', async () => {
      vi.mocked(prompts.text)
        .mockResolvedValueOnce('my-server')
        .mockResolvedValueOnce('hostname.com')
        .mockResolvedValueOnce('3')

      vi.mocked(prompts.isCancel).mockReturnValue(false)

      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: new Error('No organization found'),
      })

      await expect(registerDestination({})).rejects.toThrow('Process exit')
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('deleteDestination', () => {
    it('should delete destination with confirmation', async () => {
      const destinationId = 'dest-123'

      mockSupabase.single.mockResolvedValue({
        data: { id: destinationId, name: 'Test Server', status: 'offline' },
        error: null,
      })

      // Mock the delete chain to return a promise
      mockSupabase.eq.mockImplementation(() => Promise.resolve({
        data: null,
        error: null,
      }))

      vi.mocked(prompts.confirm).mockResolvedValue(true)
      vi.mocked(prompts.isCancel).mockReturnValue(false)

      await deleteDestination(destinationId, {})

      expect(mockAuthManager.getSession).toHaveBeenCalled()
      expect(prompts.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Delete destination "Test Server"?',
        }),
      )
      expect(mockSupabase.delete).toHaveBeenCalled()
      // The success message is logged by ora spinner, not console.log
    })

    it('should skip confirmation with force flag', async () => {
      const destinationId = 'dest-123'

      mockSupabase.single.mockResolvedValue({
        data: { id: destinationId, name: 'Test Server', status: 'offline' },
        error: null,
      })

      // Mock the delete chain to return a promise
      mockSupabase.eq.mockImplementation(() => Promise.resolve({
        data: null,
        error: null,
      }))

      await deleteDestination(destinationId, { force: true })

      expect(prompts.confirm).not.toHaveBeenCalled()
      expect(mockSupabase.delete).toHaveBeenCalled()
    })

    it('should handle cancellation', async () => {
      const destinationId = 'dest-123'

      mockSupabase.single.mockResolvedValue({
        data: { id: destinationId, name: 'Test Server' },
        error: null,
      })

      vi.mocked(prompts.confirm).mockResolvedValue(false)

      await expect(deleteDestination(destinationId, {})).rejects.toThrow('Process exit')
      expect(processExitSpy).toHaveBeenCalledWith(0)
      expect(mockSupabase.delete).not.toHaveBeenCalled()
    })

    it('should handle destination not found', async () => {
      const destinationId = 'nonexistent'

      mockSupabase.single.mockResolvedValue({
        data: null,
        error: new Error('Not found'),
      })

      await expect(deleteDestination(destinationId, {})).rejects.toThrow('Process exit')
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('watchDestination', () => {
    it('should start schedule monitor with proper configuration', async () => {
      const destinationId = 'dest-123'
      const organizationId = 'org-456'
      let sigintHandler: any

      mockSupabase.single.mockResolvedValue({
        data: { 
          id: destinationId, 
          name: 'Test Server',
          organization_id: organizationId,
          status: 'online' 
        },
        error: null,
      })

      // Mock the ScheduleMonitor
      const mockMonitor = {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
      }
      
      const mockScheduleMonitorClass = vi.fn(() => mockMonitor)
      
      // Mock dynamic import
      vi.doMock('../services/schedule-monitor.js', () => ({
        ScheduleMonitor: mockScheduleMonitorClass,
      }))

      const processOnSpy = vi.spyOn(process, 'on').mockImplementation((event, handler) => {
        if (event === 'SIGINT') {
          sigintHandler = handler
        }
        return process
      })

      // Start watching
      const watchPromise = watchDestination(destinationId, {})
      
      // Give it time to set up
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(mockAuthManager.getSession).toHaveBeenCalled()
      expect(mockSupabase.schema).toHaveBeenCalledWith('agents')
      
      // Verify ScheduleMonitor was created with correct params
      const { ScheduleMonitor } = await import('../services/schedule-monitor.js')
      expect(ScheduleMonitor).toHaveBeenCalledWith(
        mockSupabase,
        destinationId,
        organizationId
      )
      expect(mockMonitor.start).toHaveBeenCalled()

      // Simulate SIGINT to test cleanup
      if (sigintHandler && typeof sigintHandler === 'function') {
        try {
          await sigintHandler('SIGINT', 2)
        } catch (e) {
          // Expected to throw process exit
        }
      }

      expect(mockMonitor.stop).toHaveBeenCalled()
    })

    it('should handle destination not found error', async () => {
      const destinationId = 'nonexistent'

      mockSupabase.single.mockResolvedValue({
        data: null,
        error: new Error('Destination not found'),
      })

      await expect(watchDestination(destinationId, {})).rejects.toThrow('Process exit')
      expect(processExitSpy).toHaveBeenCalledWith(1)
      expect(mockSpinner.fail).toHaveBeenCalledWith('Destination not found')
    })

    it('should handle authentication errors', async () => {
      mockAuthManager.getSession.mockResolvedValue(null)

      await expect(watchDestination('dest-123', {})).rejects.toThrow('Process exit')
      expect(processExitSpy).toHaveBeenCalledWith(1)
      expect(mockSpinner.fail).toHaveBeenCalledWith(
        'Not authenticated. Please run "veas auth login" first.'
      )
    })
  })

  describe('Edge cases and error handling', () => {
    it('should handle missing environment variables', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_ANON_KEY
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      await expect(listDestinations({})).rejects.toThrow('Process exit')
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should handle invalid organization ID in options', async () => {
      mockSupabase.order.mockResolvedValue({
        data: [],
        error: null,
      })

      await listDestinations({ organizationId: 'org-456' })

      expect(mockSupabase.eq).toHaveBeenCalledWith('organization_id', 'org-456')
    })

    it('should format duration correctly', async () => {
      const destinationId = 'dest-123'
      let changeHandler: any

      const mockChannel = {
        on: vi.fn((event, config, handler) => {
          changeHandler = handler
          return mockChannel
        }),
        subscribe: vi.fn().mockReturnThis(),
      }

      mockSupabase.single.mockResolvedValue({
        data: { id: destinationId, name: 'Test Server' },
        error: null,
      })

      mockSupabase.channel.mockReturnValue(mockChannel)

      const watchPromise = watchDestination(destinationId, {})
      
      await new Promise(resolve => setTimeout(resolve, 100))

      // Test different duration formats
      changeHandler({
        eventType: 'UPDATE',
        new: { id: 'exec-1', status: 'completed', duration_ms: 500 },
      })
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('500ms'))

      changeHandler({
        eventType: 'UPDATE',
        new: { id: 'exec-2', status: 'completed', duration_ms: 65000 },
      })
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('1m 5s'))
    })
  })
})