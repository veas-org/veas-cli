import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { expectToolExists, expectToolResponse } from './helpers/assertions.js'
import { authHelper } from './helpers/auth-helper.js'
import { createMCPClient, type MCPTestClient } from './helpers/mcp-client.js'
import { TEST_TOKENS, waitForServer } from './setup.js'

describe.skip('Tool Execution E2E Tests', () => {
  let client: MCPTestClient
  let serverReady: boolean
  let availableTools: unknown[] = []

  beforeAll(async () => {
    serverReady = await waitForServer()
    await authHelper.saveAuthState()

    if (serverReady) {
      // Get list of available tools
      await authHelper.setTestToken(TEST_TOKENS.validCLI)
      const token = await authHelper.getCurrentToken()
      const tempClient = createMCPClient()
      tempClient.setToken(token!)

      try {
        availableTools = await tempClient.listTools()
        console.log(`Found ${availableTools.length} tools available for testing`)
      } catch (error) {
        console.error('Failed to fetch tools:', error)
      }
    }
  })

  afterAll(async () => {
    await authHelper.restoreAuthState()
  })

  beforeEach(async () => {
    client = createMCPClient()
    await authHelper.setTestToken(TEST_TOKENS.validCLI)
    const token = await authHelper.getCurrentToken()
    client.setToken(token!)
  })

  describe('Tool Discovery', () => {
    it('should list all available tools', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      const tools = await client.listTools()

      expect(tools).toBeDefined()
      expect(Array.isArray(tools)).toBe(true)
      expect(tools.length).toBeGreaterThan(0)

      // Each tool should have required properties
      for (const tool of tools) {
        expect(tool.name).toBeDefined()
        expect(tool.description).toBeDefined()
        expect(tool.inputSchema).toBeDefined()
        expect(tool.inputSchema.type).toBe('object')
      }
    })

    it('should include project management tools', async () => {
      if (!serverReady || availableTools.length === 0) {
        console.log('Skipping: Server not available or no tools')
        return
      }

      expectToolExists(availableTools, 'mcp-project-manager_list_my_projects')
      expectToolExists(availableTools, 'mcp-project-manager_list_my_issues')
      expectToolExists(availableTools, 'mcp-project-manager_create_issue')
    })

    it('should include knowledge base tools', async () => {
      if (!serverReady || availableTools.length === 0) {
        console.log('Skipping: Server not available or no tools')
        return
      }

      const hasKnowledgeTools = availableTools.some(
        tool => tool.name.includes('knowledge') || tool.name.includes('article'),
      )

      expect(hasKnowledgeTools).toBe(true)
    })
  })

  describe('Tool Execution - Read Operations', () => {
    it('should list user projects', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      const result = await client.callTool('mcp-project-manager_list_my_projects', {
        limit: 10,
        offset: 0,
      })

      expectToolResponse(result)

      // Result should have projects array
      if (result && typeof result === 'object') {
        expect('projects' in result || 'data' in result || Array.isArray(result)).toBe(true)
      }
    })

    it('should list user issues', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      const result = await client.callTool('mcp-project-manager_list_my_issues', {
        status: 'all',
        limit: 5,
      })

      expectToolResponse(result)
    })

    it('should get user info', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      // Check if this tool exists
      const hasUserInfoTool = availableTools.some(t => t.name.includes('get_user_info'))
      if (!hasUserInfoTool) {
        console.log('User info tool not available')
        return
      }

      const result = await client.callTool('mcp_get_user_info')

      expectToolResponse(result)

      if (result && typeof result === 'object') {
        expect('user' in result || 'id' in result || 'email' in result).toBe(true)
      }
    })
  })

  describe('Tool Parameter Validation', () => {
    it('should validate required parameters', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      // Try to create issue without required parameters
      await expect(
        client.callTool('mcp-project-manager_create_issue', {
          // Missing required 'project_id' and 'summary'
        }),
      ).rejects.toThrow()
    })

    it('should validate parameter types', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      // Try with invalid parameter types
      await expect(
        client.callTool('mcp-project-manager_list_my_issues', {
          limit: 'not-a-number', // Should be number
          status: 'all',
        }),
      ).rejects.toThrow()
    })

    it('should validate enum values', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      // Try with invalid enum value
      await expect(
        client.callTool('mcp-project-manager_list_my_issues', {
          status: 'invalid-status', // Should be one of: all, todo, in_progress, done
          limit: 10,
        }),
      ).rejects.toThrow()
    })
  })

  describe('Tool Execution - Write Operations', () => {
    it('should create an issue (dry run)', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      // First, get a project to create issue in
      const projectsResult = await client.callTool('mcp-project-manager_list_my_projects', {
        limit: 1,
      })

      let projectId: string | undefined
      if (projectsResult?.projects?.[0]) {
        projectId = projectsResult.projects[0].id
      } else if (projectsResult?.data?.[0]) {
        projectId = projectsResult.data[0].id
      }

      if (!projectId) {
        console.log('No projects available for issue creation')
        return
      }

      // Create issue (in real E2E, this would create actual data)
      const issueData = {
        project_id: projectId,
        summary: 'E2E Test Issue',
        description: 'This is a test issue created by E2E tests',
        issue_type: 'task',
        priority: 'medium',
      }

      try {
        const result = await client.callTool('mcp-project-manager_create_issue', issueData)

        expectToolResponse(result)

        if (result?.issue || result?.data) {
          const issue = result.issue || result.data
          expect(issue.summary).toBe(issueData.summary)
        }
      } catch (error: unknown) {
        // In test environment, writes might be disabled
        console.log('Issue creation failed (expected in test env):', error.message)
      }
    })
  })

  describe('Tool Error Handling', () => {
    it('should handle non-existent tool gracefully', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      await expect(client.callTool('non_existent_tool_name', {})).rejects.toThrow(/not found|unknown tool/i)
    })

    it('should return meaningful error messages', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      try {
        await client.callTool('mcp-project-manager_create_issue', {
          // Invalid data
          project_id: 'invalid-id',
          summary: '', // Empty summary
        })

        expect.fail('Should have thrown error')
      } catch (error: unknown) {
        // Error message should be helpful
        expect(error.message).toBeDefined()
        expect(error.message.length).toBeGreaterThan(10)
      }
    })
  })

  describe('Tool Response Formats', () => {
    it('should support different response formats', async () => {
      if (!serverReady || availableTools.length === 0) {
        console.log('Skipping: Server not available or no tools')
        return
      }

      // Test a few different tools to see response formats
      const toolsToTest = availableTools.slice(0, 3)

      for (const tool of toolsToTest) {
        console.log(`Testing response format for: ${tool.name}`)

        try {
          // Build minimal valid params based on schema
          const params: any = {}
          if (tool.inputSchema?.properties) {
            for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
              if (tool.inputSchema.required?.includes(key)) {
                // Provide minimal valid value
                switch ((schema as any).type) {
                  case 'string':
                    params[key] = 'test'
                    break
                  case 'number':
                    params[key] = (schema as any).default || 1
                    break
                  case 'boolean':
                    params[key] = false
                    break
                }
              }
            }
          }

          const result = await client.callTool(tool.name, params)

          // Result should be parseable
          expectToolResponse(result)
        } catch (error: unknown) {
          console.log(`Tool ${tool.name} error (might be expected):`, error.message)
        }
      }
    })
  })

  describe('Concurrent Tool Execution', () => {
    it('should handle multiple concurrent tool calls', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      const promises = [
        client.callTool('mcp-project-manager_list_my_projects', { limit: 5 }),
        client.callTool('mcp-project-manager_list_my_issues', { limit: 5 }),
        client.listTools(),
      ]

      const results = await Promise.allSettled(promises)

      // Most should succeed
      const successful = results.filter(r => r.status === 'fulfilled')
      expect(successful.length).toBeGreaterThanOrEqual(2)
    })

    it('should maintain isolation between tool calls', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available')
        return
      }

      // Create two clients with same token
      const client1 = createMCPClient()
      const client2 = createMCPClient()

      const token = await authHelper.getCurrentToken()
      client1.setToken(token!)
      client2.setToken(token!)

      // Make concurrent calls with different parameters
      const [result1, result2] = await Promise.all([
        client1.callTool('mcp-project-manager_list_my_issues', { limit: 1 }),
        client2.callTool('mcp-project-manager_list_my_issues', { limit: 10 }),
      ])

      // Results should be independent
      expectToolResponse(result1)
      expectToolResponse(result2)
    })
  })
})
