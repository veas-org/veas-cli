import * as prompts from '@clack/prompts'
import * as dotenv from 'dotenv'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthManager } from '../auth/auth-manager'
import { DirectMCPServer } from '../mcp/direct-server'

// Mock dependencies before importing serve
vi.mock('../mcp/direct-server')
vi.mock('../auth/auth-manager')
vi.mock('@clack/prompts')
vi.mock('dotenv')

// Import serve after mocks are set up
const { serve } = await import('./serve')

describe('serve command', () => {
  let mockAuthManager: any
  let mockMCPServer: any
  let mockSpinner: any
  let consoleLogSpy: any
  let consoleErrorSpy: any
  let processExitSpy: any
  let processOnSpy: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup TTY mock
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    })

    // Clear MCP_MODE
    delete process.env.MCP_MODE

    // Setup console spies
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
    processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process)

    // Setup auth manager mock
    mockAuthManager = {
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }
    vi.mocked(AuthManager).getInstance.mockReturnValue(mockAuthManager)

    // Setup MCP server mock
    mockMCPServer = {
      initialize: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(DirectMCPServer).mockImplementation(() => mockMCPServer)

    // Setup prompts mock
    mockSpinner = {
      start: vi.fn(),
      stop: vi.fn(),
    }
    vi.mocked(prompts.spinner).mockReturnValue(mockSpinner)

    // Mock dotenv
    vi.mocked(dotenv.config).mockReturnValue({ parsed: {} })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('successful server start', () => {
    it('should start server with default options', async () => {
      const options = {
        port: '3333',
        cacheTtl: '300',
        cache: true,
      }

      await serve(options)

      expect(mockAuthManager.isAuthenticated).toHaveBeenCalled()
      expect(DirectMCPServer).toHaveBeenCalledWith({
        port: 3333,
      })

      expect(mockMCPServer.initialize).toHaveBeenCalled()
      expect(mockMCPServer.start).toHaveBeenCalled()

      expect(mockSpinner.start).toHaveBeenCalledWith('Starting MCP server...')
      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('MCP server initialized'))

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Port: 3333'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Cache: Disabled'))
    })

    it('should start server with cache disabled', async () => {
      const options = {
        port: '4000',
        cacheTtl: '600',
        cache: false,
      }

      await serve(options)

      expect(DirectMCPServer).toHaveBeenCalledWith({
        port: 4000,
      })

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Cache: Disabled'))
    })

    it('should setup SIGINT handler', async () => {
      const options = {
        port: '3333',
        cacheTtl: '300',
        cache: true,
      }

      await serve(options)

      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function))

      // Test SIGINT handler
      const sigintHandler = processOnSpy.mock.calls.find(call => call[0] === 'SIGINT')?.[1]

      if (sigintHandler) {
        await expect(sigintHandler()).rejects.toThrow('process.exit called')

        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Shutting down...'))
        expect(mockMCPServer.stop).toHaveBeenCalled()
        expect(processExitSpy).toHaveBeenCalledWith(0)
      }
    })
  })

  describe('authentication failures', () => {
    it('should exit when not authenticated', async () => {
      mockAuthManager.isAuthenticated.mockResolvedValueOnce(false)

      const options = {
        port: '3333',
        cacheTtl: '300',
        cache: true,
      }

      await expect(serve(options)).rejects.toThrow('process.exit called')

      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('Not authenticated'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Please run "veas login" first'))
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('server initialization failures', () => {
    it('should handle initialization errors', async () => {
      mockMCPServer.initialize.mockRejectedValueOnce(new Error('Failed to load tools'))

      const options = {
        port: '3333',
        cacheTtl: '300',
        cache: true,
      }

      await expect(serve(options)).rejects.toThrow('process.exit called')

      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('Failed to start server'))
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'Failed to load tools')
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('configuration display', () => {
    it('should display MCP client configuration', async () => {
      const options = {
        port: '3333',
        cacheTtl: '300',
        cache: true,
      }

      await serve(options)

      // Check that the configuration JSON is displayed
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"mcpServers"'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"veas"'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"command": "veas"'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"args": ["serve"]'))
    })
  })
})
