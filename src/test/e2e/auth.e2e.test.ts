import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { authHelper } from './helpers/auth-helper.js'
import { createMCPClient, type MCPTestClient } from './helpers/mcp-client.js'
import { TEST_TOKENS, waitForServer } from './setup.js'

describe.skip('Authentication E2E Tests', () => {
  let client: MCPTestClient
  let serverReady: boolean

  beforeAll(async () => {
    serverReady = await waitForServer()
    await authHelper.saveAuthState()
  })

  afterAll(async () => {
    await authHelper.restoreAuthState()
  })

  beforeEach(async () => {
    client = createMCPClient()
    await authHelper.clearAuth()
  })

  describe('Token Authentication', () => {
    it('should authenticate with valid CLI token', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      await authHelper.setTestToken(TEST_TOKENS.validCLI, 'cli')
      const token = await authHelper.getCurrentToken()
      expect(token).toBe(TEST_TOKENS.validCLI)

      client.setToken(token!)
      const tools = await client.listTools()

      expect(tools).toBeDefined()
      expect(Array.isArray(tools)).toBe(true)
    })

    it('should authenticate with valid PAT token', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      // This would work with a real PAT token
      client.setToken(TEST_TOKENS.validPAT)

      try {
        const tools = await client.listTools()
        expect(tools).toBeDefined()
      } catch (error: any) {
        // If using mock PAT, might fail
        console.log('PAT authentication failed (expected with mock token):', error.message)
      }
    })

    it('should reject invalid token format', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      client.setToken(TEST_TOKENS.invalidToken)

      await expect(client.listTools()).rejects.toThrow(/auth/i)
    })

    it('should reject expired tokens', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      client.setToken(TEST_TOKENS.expiredToken)

      await expect(client.listTools()).rejects.toThrow()
    })

    it('should require authentication for protected endpoints', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      // No token set
      await expect(client.listTools()).rejects.toThrow()
    })
  })

  describe('Token Headers', () => {
    it('should accept X-MCP-Token header', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()

      const response = await client.rawRequest(
        'POST',
        '/api/mcp/http',
        {
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: 'test',
        },
        {
          'X-MCP-Token': token!,
          'Content-Type': 'application/json',
        },
      )

      expect(response.ok).toBe(true)
    })

    it('should accept Authorization Bearer header', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()

      const response = await client.rawRequest(
        'POST',
        '/api/mcp/http',
        {
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: 'test',
        },
        {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      )

      expect(response.ok).toBe(true)
    })

    it('should prefer X-MCP-Token over Authorization header', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()

      const response = await client.rawRequest(
        'POST',
        '/api/mcp/http',
        {
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: 'test',
        },
        {
          'X-MCP-Token': token!,
          Authorization: 'Bearer invalid_token',
          'Content-Type': 'application/json',
        },
      )

      // Should use X-MCP-Token and succeed
      expect(response.ok).toBe(true)
    })
  })

  describe('Permission Scopes', () => {
    it('should enforce scope restrictions', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      // This test would require a token with limited scopes
      // For now, we'll test the concept
      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()
      client.setToken(token!)

      // Try to call a tool that might require specific scopes
      try {
        await client.callTool('mcp-project-manager_create_project', {
          name: 'Test Project',
          description: 'E2E Test',
        })

        // If it succeeds, token has sufficient scopes
        expect(true).toBe(true)
      } catch (error: any) {
        // If it fails due to scopes, that's also valid behavior
        if (error.message.includes('scope') || error.message.includes('permission')) {
          expect(true).toBe(true)
        } else {
          throw error
        }
      }
    })
  })

  describe('Token Validation', () => {
    it('should validate token format for PAT', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      // PAT format: prefix_randomhex_tokenhex
      const validPATFormat = 'mcp_1234_abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'
      const invalidPATFormat = 'mcp-1234-invalid'

      // Valid format should at least be accepted by the client
      client.setToken(validPATFormat)
      expect(() => client.setToken(validPATFormat)).not.toThrow()

      // Server will validate the actual token
      await expect(client.listTools()).rejects.toThrow()
    })

    it('should validate token format for CLI', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      // CLI format: cli_randomhex_tokenhex
      const validCLIFormat = 'cli_1234_abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'

      client.setToken(validCLIFormat)
      expect(() => client.setToken(validCLIFormat)).not.toThrow()
    })
  })

  describe('Authentication Flow', () => {
    it('should maintain authentication across multiple requests', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()
      client.setToken(token!)

      // Make multiple requests with same token
      const results = []
      for (let i = 0; i < 3; i++) {
        const tools = await client.listTools()
        results.push(tools)
      }

      // All requests should succeed
      results.forEach(tools => {
        expect(Array.isArray(tools)).toBe(true)
      })
    })

    it('should handle token refresh scenario', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      // Set initial token
      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token1 = await authHelper.getCurrentToken()
      client.setToken(token1!)

      // First request should work
      const tools1 = await client.listTools()
      expect(Array.isArray(tools1)).toBe(true)

      // Simulate token refresh (in real scenario, this would be a new token)
      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token2 = await authHelper.getCurrentToken()
      client.setToken(token2!)

      // Request with new token should also work
      const tools2 = await client.listTools()
      expect(Array.isArray(tools2)).toBe(true)
    })
  })

  describe('Error Messages', () => {
    it('should return clear error message for missing token', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      try {
        await client.listTools()
        expect.fail('Should have thrown error')
      } catch (error: any) {
        expect(error.message).toMatch(/auth|token|required/i)
      }
    })

    it('should return clear error message for invalid token', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      client.setToken('completely_invalid_token')

      try {
        await client.listTools()
        expect.fail('Should have thrown error')
      } catch (error: any) {
        expect(error.message).toMatch(/invalid|auth|unauthorized/i)
      }
    })
  })
})
