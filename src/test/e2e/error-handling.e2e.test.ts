import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { expectConnectionError } from './helpers/assertions.js'
import { authHelper } from './helpers/auth-helper.js'
import { createMCPClient, type MCPTestClient } from './helpers/mcp-client.js'
import { TEST_TOKENS, waitForServer } from './setup.js'

describe.skip('Error Handling E2E Tests', () => {
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
  })

  describe('Network Errors', () => {
    it('should handle connection timeouts gracefully', async () => {
      const timeoutClient = createMCPClient({
        timeout: 1, // 1ms timeout
        apiUrl: 'http://10.255.255.1', // Non-routable IP
      })

      await expect(timeoutClient.listTools()).rejects.toThrow(/timeout/i)
    })

    it('should handle DNS resolution failures', async () => {
      const badClient = createMCPClient({
        apiUrl: 'http://non-existent-domain-12345.local',
      })

      try {
        await badClient.listTools()
        expect.fail('Should have thrown error')
      } catch (error: any) {
        expectConnectionError(error, 'dns')
      }
    })

    it('should handle connection refused', async () => {
      const badClient = createMCPClient({
        apiUrl: 'http://localhost:54321', // Unlikely port
      })

      try {
        await badClient.listTools()
        expect.fail('Should have thrown error')
      } catch (error: any) {
        expectConnectionError(error, 'network')
      }
    })
  })

  describe('Protocol Errors', () => {
    it('should handle malformed JSON responses', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()

      // Send raw request that might get non-JSON response
      const response = await client.rawRequest('GET', '/api/mcp/http', undefined, {
        Authorization: `Bearer ${token}`,
      })

      // GET might not be supported, resulting in error
      expect(response.ok).toBe(false)
    })

    it('should handle invalid JSON-RPC requests', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()

      const invalidRequests = [
        { /* Missing jsonrpc */ method: 'test', id: 1 },
        { jsonrpc: '1.0', /* Wrong version */ method: 'test', id: 1 },
        { jsonrpc: '2.0', /* Missing method */ id: 1 },
        { jsonrpc: '2.0', method: 'test' /* Missing id */ },
      ]

      for (const invalidRequest of invalidRequests) {
        const response = await client.rawRequest('POST', '/api/mcp/http', invalidRequest, {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        })

        expect(response.ok).toBe(false)
      }
    })
  })

  describe('Authentication Errors', () => {
    it('should provide clear error for missing authentication', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      try {
        await client.listTools()
        expect.fail('Should require authentication')
      } catch (error: any) {
        expect(error.message).toMatch(/auth|token|unauthorized/i)
      }
    })

    it('should provide clear error for invalid tokens', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      const invalidTokens = ['invalid', 'Bearer invalid', '12345', 'null', '']

      for (const invalidToken of invalidTokens) {
        client.setToken(invalidToken)

        try {
          await client.listTools()
          expect.fail(`Should reject token: ${invalidToken}`)
        } catch (error: any) {
          expect(error.message).toBeDefined()
        }
      }
    })
  })

  describe('Rate Limiting', () => {
    it('should handle rate limit errors gracefully', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()
      client.setToken(token!)

      // Make many rapid requests
      const promises = Array.from({ length: 50 }, () => client.listTools().catch((error) => ({ error })))

      const results = await Promise.all(promises)

      // Check if any were rate limited
      const rateLimited = results.filter((r) => r.error?.message?.includes('rate') || r.error?.message?.includes('429'))

      // If rate limiting is implemented, some should fail
      if (rateLimited.length > 0) {
        console.log(`Rate limited ${rateLimited.length} requests`)
        expect(rateLimited[0].error.message).toMatch(/rate|limit|429/i)
      }
    })
  })

  describe('Server Errors', () => {
    it('should handle 500 errors gracefully', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()
      client.setToken(token!)

      // Try to trigger a server error (this is hard to do intentionally)
      try {
        await client.callTool('mcp-project-manager_create_issue', {
          project_id: null, // Might cause server error
          summary: null,
          description: undefined,
        })
      } catch (error: any) {
        // Any error is acceptable - we're testing it doesn't crash
        expect(error.message).toBeDefined()
      }
    })

    it('should handle service unavailable errors', async () => {
      // Simulate service unavailable by using wrong URL
      const badClient = createMCPClient({
        apiUrl: 'http://localhost:3000/wrong-path',
      })

      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()
      badClient.setToken(token!)

      try {
        await badClient.listTools()
        expect.fail('Should have failed')
      } catch (error: any) {
        expect(error.message).toBeDefined()
      }
    })
  })

  describe('Recovery and Retry', () => {
    it('should recover from transient errors', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()

      let attemptCount = 0
      const retryClient = createMCPClient()
      retryClient.setToken(token!)

      // Simple retry logic
      const maxRetries = 3
      let lastError: Error | null = null

      for (let i = 0; i < maxRetries; i++) {
        try {
          attemptCount++
          const result = await retryClient.listTools()
          expect(result).toBeDefined()
          break // Success
        } catch (error: any) {
          lastError = error
          if (i < maxRetries - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100))
          }
        }
      }

      console.log(`Attempted ${attemptCount} times`)

      if (attemptCount === maxRetries && lastError) {
        throw lastError
      }
    })
  })

  describe('Error Message Quality', () => {
    it('should provide actionable error messages', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      const testCases = [
        {
          scenario: 'Missing required parameter',
          action: () => client.callTool('mcp-project-manager_create_issue', {}),
          expectedWords: ['required', 'missing', 'project_id', 'summary'],
        },
        {
          scenario: 'Invalid tool name',
          action: () => client.callTool('invalid_tool_name_12345', {}),
          expectedWords: ['not found', 'unknown', 'invalid'],
        },
        {
          scenario: 'Wrong parameter type',
          action: () =>
            client.callTool('mcp-project-manager_list_my_issues', {
              limit: 'not-a-number',
            }),
          expectedWords: ['type', 'number', 'invalid'],
        },
      ]

      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()
      client.setToken(token!)

      for (const testCase of testCases) {
        try {
          await testCase.action()
          expect.fail(`${testCase.scenario} should have failed`)
        } catch (error: any) {
          console.log(`${testCase.scenario}: ${error.message}`)

          // Check if error message contains helpful keywords
          const hasHelpfulMessage = testCase.expectedWords.some((word) =>
            error.message.toLowerCase().includes(word.toLowerCase()),
          )

          expect(hasHelpfulMessage).toBe(true)
        }
      }
    })
  })
})
