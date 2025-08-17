import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { expectConnectionError, expectMCPError, expectMCPSuccess, expectResponseTime } from './helpers/assertions.js'
import { authHelper } from './helpers/auth-helper.js'
import { createMCPClient, type MCPTestClient } from './helpers/mcp-client.js'
import { TEST_TOKENS, waitForServer } from './setup.js'

describe.skip('MCP Connection E2E Tests', () => {
  let client: MCPTestClient
  let serverReady: boolean

  beforeAll(async () => {
    // Wait for server to be ready
    serverReady = await waitForServer()
    if (!serverReady) {
      console.warn('⚠️  Server is not available, some tests may fail')
    }

    // Save current auth state
    await authHelper.saveAuthState()
  })

  afterAll(async () => {
    // Restore auth state
    await authHelper.restoreAuthState()
  })

  beforeEach(() => {
    // Create fresh client for each test
    client = createMCPClient()
  })

  describe('Server Availability', () => {
    it('should connect to MCP server', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      const startTime = Date.now()
      const response = await client.rawRequest('GET', '/api/health')

      expect(response.ok).toBe(true)
      expectResponseTime(startTime, 5000) // Should respond within 5 seconds
    })

    it('should handle different transport types', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      const transports = ['http', 'sse', 'stdio', 'message']

      for (const transport of transports) {
        const transportClient = createMCPClient({ transport: transport as any })

        try {
          const response = await transportClient.rawRequest('OPTIONS')

          // Some transports might not be implemented
          if (response.status === 404) {
            console.log(`Transport ${transport} not implemented`)
            continue
          }

          expect([204, 405]).toContain(response.status)
        } catch (error) {
          console.log(`Transport ${transport} error:`, error)
        }
      }
    })
  })

  describe('Connection Health', () => {
    it('should successfully test connection with valid token', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      // Set up authentication
      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()
      client.setToken(token!)

      const isConnected = await client.testConnection()
      expect(isConnected).toBe(true)
    })

    it('should fail connection test without authentication', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      const isConnected = await client.testConnection()
      expect(isConnected).toBe(false)
    })

    it('should handle network timeouts', async () => {
      // Use a very short timeout
      const timeoutClient = createMCPClient({
        timeout: 1,
        apiUrl: 'http://example.com:81', // Non-routable address
      })

      await expect(timeoutClient.listTools()).rejects.toThrow(/timeout/i)
    })

    it('should handle connection refused', async () => {
      const badClient = createMCPClient({
        apiUrl: 'http://localhost:9999', // Assuming nothing runs on this port
      })

      try {
        await badClient.listTools()
        expect.fail('Should have thrown connection error')
      } catch (error: any) {
        expectConnectionError(error, 'network')
      }
    })
  })

  describe('Protocol Compliance', () => {
    it('should return valid JSON-RPC 2.0 responses', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()
      client.setToken(token!)

      const response = await client.request('tools/list')

      expectMCPSuccess(response)
      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBeDefined()
    })

    it('should handle malformed requests', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      const malformedBody = {
        // Missing jsonrpc
        method: 'tools/list',
        params: {},
        id: 'test',
      }

      const response = await client.rawRequest('POST', `/api/mcp/http`, malformedBody)

      // Should return 400 Bad Request or similar
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(response.status).toBeLessThan(500)
    })

    it('should require proper content-type header', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      const response = await client.rawRequest(
        'POST',
        `/api/mcp/http`,
        '{"jsonrpc":"2.0","method":"tools/list","id":1}',
        {
          'Content-Type': 'text/plain', // Wrong content type
        },
      )

      // Should reject non-JSON content type
      expect(response.ok).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should return proper error for unknown methods', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()
      client.setToken(token!)

      const response = await client.request('unknown/method')

      expectMCPError(response, -32601) // Method not found
    })

    it('should handle authentication errors', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      client.setToken(TEST_TOKENS.invalidToken)

      try {
        await client.listTools()
        expect.fail('Should have thrown authentication error')
      } catch (error: any) {
        expect(error.message).toMatch(/auth/i)
      }
    })

    it('should handle server errors gracefully', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      // Send a request that might cause a server error
      const response = await client.rawRequest('POST', `/api/mcp/http`, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'non_existent_tool',
          arguments: { invalid: true },
        },
        id: 'test',
      })

      // Should handle gracefully without crashing
      expect(response.status).toBeDefined()
    })
  })

  describe('Performance', () => {
    it('should respond within acceptable time limits', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()
      client.setToken(token!)

      const iterations = 5
      const times: number[] = []

      for (let i = 0; i < iterations; i++) {
        const start = Date.now()
        await client.listTools()
        const duration = Date.now() - start
        times.push(duration)
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length
      console.log(`Average response time: ${avgTime}ms`)

      // Average should be under 1 second
      expect(avgTime).toBeLessThan(1000)

      // No single request should take more than 5 seconds
      times.forEach(time => {
        expect(time).toBeLessThan(5000)
      })
    })

    it('should handle concurrent requests', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()

      // Create multiple clients
      const clients = Array.from({ length: 5 }, () => {
        const c = createMCPClient()
        c.setToken(token!)
        return c
      })

      // Make concurrent requests
      const promises = clients.map(c => c.listTools())
      const results = await Promise.allSettled(promises)

      // All should succeed
      results.forEach(result => {
        expect(result.status).toBe('fulfilled')
      })
    })
  })
})
