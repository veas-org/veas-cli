import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { testConnection, listProjects, createIssue, testDirectMCP } from './mcp'
import { AuthManager } from '../auth/auth-manager'
import * as prompts from '@clack/prompts'
import { logger } from '../utils/logger'

vi.mock('../auth/auth-manager')
vi.mock('@clack/prompts')
vi.mock('../utils/logger')

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
            'Authorization': 'Bearer test-token',
          }),
        })
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

      await expect(testConnection()).rejects.toThrow('process.exit')
      
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Not authenticated'))
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

      expect(global.fetch).toHaveBeenCalledWith(
        'https://custom.api.com/api/mcp-manual',
        expect.any(Object)
      )

      process.env.VEAS_API_URL = originalEnv
    })
  })

  describe('listProjects', () => {
    it('should successfully list projects', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
        user: { id: 'user-123' },
      })

      const mockProjects = {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                projects: [
                  { id: '1', name: 'Project 1', key: 'PROJ1' },
                  { id: '2', name: 'Project 2', key: 'PROJ2' },
                ],
                total: 2,
              }),
            },
          ],
        },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProjects,
      } as Response)

      await listProjects({ limit: 10, offset: 0 })

      expect(mockSpinner.start).toHaveBeenCalledWith('Fetching projects...')
      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('Found 2 projects'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Project 1'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('PROJ1'))
    })

    it('should handle empty project list', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      const mockProjects = {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                projects: [],
                total: 0,
              }),
            },
          ],
        },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProjects,
      } as Response)

      await listProjects()

      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('No projects found'))
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

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', result: { content: [] } }),
      } as Response)

      await listProjects({ limit: 20, offset: 40 })

      const callArg = vi.mocked(global.fetch).mock.calls[0][1]
      const body = JSON.parse(callArg.body)
      
      expect(body.params.arguments.limit).toBe(20)
      expect(body.params.arguments.offset).toBe(40)
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

      const mockResponse = {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: 'issue-123',
                key: 'PROJ1-42',
                summary: 'Bug in login',
                status: 'To Do',
              }),
            },
          ],
        },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await createIssue()

      expect(mockSpinner.start).toHaveBeenCalledWith('Creating issue...')
      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('created successfully'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('PROJ1-42'))
    })

    it('should handle cancelled input', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(prompts.text).mockResolvedValueOnce(Symbol.for('cancel'))

      await createIssue()

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Cancelled'))
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should validate required fields', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(prompts.text)
        .mockResolvedValueOnce('') // empty project
        .mockResolvedValueOnce('Summary')
        .mockResolvedValueOnce('Description')

      await expect(createIssue()).rejects.toThrow('process.exit')
      
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('required'))
    })

    it('should handle API error response', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(prompts.text)
        .mockResolvedValueOnce('PROJ1')
        .mockResolvedValueOnce('Summary')
        .mockResolvedValueOnce('Description')

      const mockError = {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Project not found',
        },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockError,
      } as Response)

      await expect(createIssue()).rejects.toThrow('process.exit')
      
      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('Failed'))
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Project not found'))
    })
  })

  describe('testDirectMCP', () => {
    it('should test direct MCP server', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
        user: { email: 'test@example.com' },
      })

      const mockInitResponse = {
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: true },
          },
          serverInfo: {
            name: 'veas-direct-mcp',
            version: '1.0.0',
          },
        },
      }

      const mockToolsResponse = {
        jsonrpc: '2.0',
        result: {
          tools: [
            {
              name: 'mcp__veas__list_projects',
              description: 'List projects',
              inputSchema: {},
            },
          ],
        },
      }

      const mockToolCallResponse = {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ projects: [], total: 0 }),
            },
          ],
        },
      }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockInitResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToolsResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToolCallResponse,
        } as Response)

      await testDirectMCP()

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Testing Direct MCP Server'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Server initialized'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Available tools: 1'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Tool call successful'))
    })

    it('should handle initialization failure', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Connection refused'))

      await expect(testDirectMCP()).rejects.toThrow('process.exit')
      
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed'))
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Connection refused'))
    })

    it('should handle missing tools', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      const mockInitResponse = {
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0.0' },
        },
      }

      const mockToolsResponse = {
        jsonrpc: '2.0',
        result: { tools: [] },
      }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockInitResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToolsResponse,
        } as Response)

      await testDirectMCP()

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Available tools: 0'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No tools available'))
    })
  })
})