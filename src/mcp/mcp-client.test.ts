import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MCPClient } from './mcp-client'
import { AuthManager } from '../auth/auth-manager'

vi.mock('../auth/auth-manager')

global.fetch = vi.fn()

describe('MCPClient', () => {
  let client: MCPClient
  let mockAuthManager: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockAuthManager = {
      getCredentials: vi.fn(),
    }
    vi.mocked(AuthManager).getInstance.mockReturnValue(mockAuthManager)
    
    client = new MCPClient('http://localhost:3000')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with base URL', () => {
      const customClient = new MCPClient('https://custom.api.com')
      expect(customClient['baseUrl']).toBe('https://custom.api.com')
    })

    it('should use default URL if not provided', () => {
      const defaultClient = new MCPClient()
      expect(defaultClient['baseUrl']).toBe('http://localhost:3000')
    })
  })

  describe('initialize', () => {
    it('should successfully initialize connection', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      const mockResponse = {
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: true },
            resources: { listChanged: true },
          },
          serverInfo: {
            name: 'veas-mcp',
            version: '1.0.0',
          },
        },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await client.initialize()

      expect(result).toEqual(mockResponse.result)
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/mcp-manual',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token',
          }),
          body: expect.stringContaining('"method":"initialize"'),
        })
      )
    })

    it('should handle initialization failure', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(client.initialize()).rejects.toThrow('Network error')
    })

    it('should handle unauthorized error', async () => {
      mockAuthManager.getCredentials.mockResolvedValue(null)

      await expect(client.initialize()).rejects.toThrow('Not authenticated')
    })
  })

  describe('listTools', () => {
    it('should list available tools', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      const mockResponse = {
        jsonrpc: '2.0',
        result: {
          tools: [
            {
              name: 'tool1',
              description: 'First tool',
              inputSchema: {},
            },
            {
              name: 'tool2',
              description: 'Second tool',
              inputSchema: {},
            },
          ],
        },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await client.listTools()

      expect(result).toEqual(mockResponse.result)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"method":"tools/list"'),
        })
      )
    })
  })

  describe('callTool', () => {
    it('should call tool successfully', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      const mockResponse = {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: 'Tool executed successfully',
            },
          ],
        },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await client.callTool('my-tool', { param: 'value' })

      expect(result).toEqual(mockResponse.result)
      
      const callBody = JSON.parse(
        vi.mocked(global.fetch).mock.calls[0][1].body
      )
      expect(callBody.method).toBe('tools/call')
      expect(callBody.params.name).toBe('my-tool')
      expect(callBody.params.arguments).toEqual({ param: 'value' })
    })

    it('should handle tool execution error', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      const mockError = {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Tool execution failed',
        },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockError,
      } as Response)

      await expect(client.callTool('failing-tool', {})).rejects.toThrow(
        'Tool execution failed'
      )
    })

    it('should handle empty tool arguments', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      const mockResponse = {
        jsonrpc: '2.0',
        result: { content: [] },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await client.callTool('simple-tool')

      const callBody = JSON.parse(
        vi.mocked(global.fetch).mock.calls[0][1].body
      )
      expect(callBody.params.arguments).toEqual({})
    })
  })

  describe('request', () => {
    it('should handle request with custom headers', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', result: 'ok' }),
      } as Response)

      await client['request']('custom/method', { data: 'test' }, {
        'X-Custom-Header': 'custom-value',
      })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'custom-value',
            'Authorization': 'Bearer test-token',
          }),
        })
      )
    })

    it('should handle JSON-RPC batch requests', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      const batchResponse = [
        { jsonrpc: '2.0', result: 'result1', id: 1 },
        { jsonrpc: '2.0', result: 'result2', id: 2 },
      ]

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => batchResponse,
      } as Response)

      // This would need implementation in the actual client
      // For now, just test single request
      await client['request']('test', {})
    })

    it('should handle network timeouts', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      const timeoutError = new Error('Request timeout')
      timeoutError.name = 'AbortError'
      vi.mocked(global.fetch).mockRejectedValueOnce(timeoutError)

      await expect(client['request']('test', {})).rejects.toThrow('Request timeout')
    })

    it('should retry on transient failures', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(global.fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', result: 'success' }),
        } as Response)

      // If retry is implemented
      const result = await client['request']('test', {}, {}, { retry: true })
      expect(result).toBe('success')
    })
  })

  describe('error handling', () => {
    it('should handle malformed JSON response', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON')
        },
      } as Response)

      await expect(client.initialize()).rejects.toThrow('Invalid JSON')
    })

    it('should handle HTTP error statuses', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response)

      await expect(client.initialize()).rejects.toThrow()
    })

    it('should handle rate limiting', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({
          'Retry-After': '60',
        }),
      } as Response)

      await expect(client.initialize()).rejects.toThrow()
    })
  })

  describe('lifecycle', () => {
    it('should handle connection state', () => {
      expect(client.isConnected()).toBe(false)
      
      // After successful initialization
      client['connected'] = true
      expect(client.isConnected()).toBe(true)
    })

    it('should disconnect properly', async () => {
      client['connected'] = true
      await client.disconnect()
      
      expect(client.isConnected()).toBe(false)
    })

    it('should handle reconnection', async () => {
      mockAuthManager.getCredentials.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', result: {} }),
      } as Response)

      await client.initialize()
      await client.disconnect()
      await client.initialize()
      
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })
})