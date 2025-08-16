import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { testConnection, listProjects, createIssue, testDirectMCP } from './mcp'
import { AuthManager } from '../auth/auth-manager'
import * as prompts from '@clack/prompts'
import { logger } from '../utils/logger'

vi.mock('../auth/auth-manager')
vi.mock('@clack/prompts')
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock MCPClient
vi.mock('../mcp/mcp-client.js', () => ({
  MCPClient: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    listTools: vi.fn(),
  })),
}))

global.fetch = vi.fn()

describe('MCP Commands', () => {
  let mockAuthManager: any
  let mockSpinner: any
  let consoleLogSpy: any
  let processExitSpy: any

  beforeEach(() => {
    vi.clearAllMocks()

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    mockAuthManager = {
      getCredentials: vi.fn(),
      ensureAuthenticated: vi.fn(),
      getToken: vi.fn(),
      isAuthenticated: vi.fn().mockResolvedValue(true),
    }
    vi.mocked(AuthManager).getInstance.mockReturnValue(mockAuthManager)

    mockSpinner = {
      start: vi.fn(),
      stop: vi.fn(),
      message: vi.fn(),
    }
    vi.mocked(prompts.spinner).mockReturnValue(mockSpinner)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('testConnection', () => {
    it('should successfully test MCP connection', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
        user: { id: 'user-123', email: 'test@example.com' },
      })

      const mockResponse = {
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: true },
            prompts: { listChanged: true },
            resources: { listChanged: true, subscribe: true },
            logging: {},
          },
          serverInfo: {
            name: 'veas-mcp-server',
            version: '1.0.0',
          },
        },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await testConnection()

      expect(mockSpinner.start).toHaveBeenCalledWith('Testing MCP connection...')
      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('connected'))
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/mcp-manual'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
        }),
      )
    })

    it('should handle connection failure', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(testConnection()).rejects.toThrow('process.exit')

      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('failed'))
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Network error'))
    })

    it('should handle unauthenticated state', async () => {
      mockAuthManager.getCredentials.mockResolvedValue(null)
      mockAuthManager.getToken.mockResolvedValue(null)

      await expect(testConnection()).rejects.toThrow('process.exit')

      expect(logger.error).toHaveBeenCalledWith('No authentication token found')
    })

    it('should use environment API URL', async () => {
      const originalEnv = process.env.VEAS_API_URL
      process.env.VEAS_API_URL = 'https://custom.api.com'

      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', result: {} }),
      } as Response)

      await testConnection()

      expect(global.fetch).toHaveBeenCalledWith('https://custom.api.com/api/mcp-manual', expect.any(Object))

      process.env.VEAS_API_URL = originalEnv
    })
  })

  describe('listProjects', () => {
    it('should successfully list projects', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
        user: { id: 'user-123' },
      })
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      const mockProjects = {
        projects: [
          { id: '1', name: 'Project 1', description: 'First project' },
          { id: '2', name: 'Project 2', description: 'Second project' },
        ],
        total: 2,
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProjects,
      } as Response)

      await listProjects({ limit: 10, offset: 0 })

      expect(mockSpinner.start).toHaveBeenCalledWith('Fetching projects...')
      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('Found 2 projects'))
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Project 1'))
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Project 2'))
    })

    it('should handle empty project list', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      const mockProjects = {
        projects: [],
        total: 0,
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProjects,
      } as Response)

      await listProjects()

      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('Found 0 projects'))
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('No projects found'))
    })

    it('should handle API errors', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      } as Response)

      await expect(listProjects()).rejects.toThrow('process.exit')

      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('Failed'))
    })

    it('should use pagination parameters', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ projects: [], total: 0 }),
      } as Response)

      await listProjects({ limit: 20, offset: 40 })

      // For GET requests, parameters are in the URL
      const callUrl = vi.mocked(global.fetch).mock.calls[0][0]
      expect(callUrl).toContain('limit=20')
      expect(callUrl).toContain('offset=40')
    })
  })

  describe('createIssue', () => {
    it('should successfully create an issue', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(prompts.text)
        .mockResolvedValueOnce('PROJ1') // project key
        .mockResolvedValueOnce('Bug in login') // summary
        .mockResolvedValueOnce('Users cannot login with email') // description

      const mockIssue = {
        id: 'issue-123',
        key: 'PROJ1-42',
        summary: 'Bug in login',
        status: 'To Do',
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockIssue,
      } as Response)

      await createIssue()

      expect(mockSpinner.start).toHaveBeenCalledWith('Creating issue...')
      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('Issue created: PROJ1-42'))
    })

    it('should handle cancelled input', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(prompts.text).mockResolvedValueOnce(Symbol.for('cancel'))

      await expect(createIssue()).rejects.toThrow('process.exit')

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Cancelled'))
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should validate required fields', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      // Mock the text validation to fail for empty input
      const mockTextFn = vi
        .fn()
        .mockImplementationOnce((opts: any) => {
          // Call the validate function to ensure it returns error
          if (opts.validate) {
            const error = opts.validate('')
            expect(error).toBe('Project ID is required')
          }
          // Return a valid value to continue flow
          return Promise.resolve('PROJ1')
        })
        .mockResolvedValueOnce('Title')

      vi.mocked(prompts.text).mockImplementation(mockTextFn)

      // Mock the API to work correctly
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ key: 'PROJ1-1' }),
      } as Response)

      await createIssue()

      // Verify that validation was called
      expect(mockTextFn).toHaveBeenCalled()
    })

    it('should handle API error response', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(prompts.text).mockResolvedValueOnce('PROJ1').mockResolvedValueOnce('Title')

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        text: async () => 'API error: Project not found',
      } as Response)

      await expect(createIssue()).rejects.toThrow('process.exit')

      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('Failed'))
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Project not found'))
    })
  })

  describe('testDirectMCP', () => {
    it('should test direct MCP server', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
        user: { email: 'test@example.com' },
      })

      // Mock MCPClient instance
      const mockClient = {
        initialize: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue([
          {
            name: 'mcp__veas__list_projects',
            description: 'List projects',
            inputSchema: {},
          },
        ]),
      }

      const { MCPClient } = await import('../mcp/mcp-client.js')
      vi.mocked(MCPClient).mockImplementation(() => mockClient as any)

      await testDirectMCP()

      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('Direct MCP test successful'))
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Available tools:'))
    })

    it('should handle initialization failure', async () => {
      mockAuthManager.ensureAuthenticated.mockRejectedValueOnce(new Error('Auth failed'))

      await expect(testDirectMCP()).rejects.toThrow('process.exit')

      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('failed'))
      expect(logger.error).toHaveBeenCalledWith('Error testing direct MCP:', expect.any(Error))
    })

    it('should handle missing tools', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      // Mock MCPClient instance with no tools
      const mockClient = {
        initialize: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue([]),
      }

      const { MCPClient } = await import('../mcp/mcp-client.js')
      vi.mocked(MCPClient).mockImplementation(() => mockClient as any)

      await expect(testDirectMCP()).rejects.toThrow('process.exit')

      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('No tools available'))
    })
  })
})
