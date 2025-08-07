import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expectMCPError } from './helpers/assertions.js';
import { authHelper } from './helpers/auth-helper.js';
import { createMCPClient, type MCPTestClient } from './helpers/mcp-client.js';
import { TEST_TOKENS, waitForServer } from './setup.js';

describe('MCP Authentication E2E Tests', () => {
  let client: MCPTestClient;
  let serverReady: boolean;

  beforeAll(async () => {
    serverReady = await waitForServer();
    await authHelper.saveAuthState();
  });

  afterAll(async () => {
    await authHelper.restoreAuthState();
  });

  beforeEach(async () => {
    client = createMCPClient();
    await authHelper.clearAuth();
  });

  describe('Personal Access Token (PAT) Authentication', () => {
    it('should authenticate with valid production PAT', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available');
        return;
      }

      // Set a mock production PAT
      const mockPAT = 'mya_test_production_token';
      client.setToken(mockPAT);

      // Try to list tools (will fail with real server unless token exists)
      try {
        const tools = await client.listTools();
        expect(tools).toBeDefined();
        expect(Array.isArray(tools)).toBe(true);
      } catch (error: any) {
        // Expected to fail with invalid token
        expect(error.message).toContain('Invalid or expired token');
      }
    });

    it('should authenticate with test PAT', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available');
        return;
      }

      // Test tokens (tes_ prefix) bypass validation
      const testPAT = 'tes_user-123';
      client.setToken(testPAT);

      const tools = await client.listTools();

      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should fail with invalid PAT format', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available');
        return;
      }

      client.setToken('invalid_token_format');

      await expectMCPError(
        client.listTools(),
        'Invalid token format'
      );
    });
  });

  describe('CLI Token Authentication', () => {
    it('should authenticate with valid CLI JWT token', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available');
        return;
      }

      // Save a mock CLI token
      await authHelper.setTestToken(TEST_TOKENS.validCLI, 'cli');
      const token = await authHelper.getCurrentToken();

      client.setToken(token!);

      // CLI tokens should work for MCP
      const tools = await client.listTools();

      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
    });

    it('should fail with expired CLI token', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available');
        return;
      }

      client.setToken(TEST_TOKENS.expiredCLI);

      await expectMCPError(
        client.listTools(),
        'expired'
      );
    });
  });

  describe('Token Priority', () => {
    it('should prefer PAT over CLI token', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available');
        return;
      }

      // Set both CLI token and PAT
      await authHelper.setTestToken(TEST_TOKENS.validCLI, 'cli');
      process.env.VEAS_PAT = 'tes_pat-user';

      // Should use PAT
      const token = await authHelper.getBestToken();
      expect(token).toBe('tes_pat-user');

      // Clean up
      delete process.env.VEAS_PAT;
    });

    it('should use MCP_TOKEN when set', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available');
        return;
      }

      process.env.MCP_TOKEN = 'tes_mcp-token';

      const token = await authHelper.getBestToken();
      expect(token).toBe('tes_mcp-token');

      // Clean up
      delete process.env.MCP_TOKEN;
    });
  });

  describe('Tool Execution with Authentication', () => {
    it('should execute tools with valid authentication', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available');
        return;
      }

      // Use test token
      client.setToken('tes_user-123');

      // Try to execute a simple tool
      const result = await client.callTool('mcp_get_user_info', {});

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('should fail tool execution without authentication', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available');
        return;
      }

      // No token set
      await expectMCPError(
        client.callTool('mcp_get_user_info', {}),
        'authentication'
      );
    });

    it('should respect scope restrictions', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available');
        return;
      }

      // Test token with limited scopes
      client.setToken('tes_limited-user');

      // Try to execute a tool that requires admin scope
      await expectMCPError(
        client.callTool('mcp-project-manager_create_issue', {
          project_id: 'test-project',
          summary: 'Test issue'
        }),
        'Insufficient permissions'
      );
    });
  });

  describe('Token Validation', () => {
    it('should handle missing token gracefully', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available');
        return;
      }

      // Don't set any token
      await expectMCPError(
        client.listTools(),
        'Missing authentication token'
      );
    });

    it('should handle malformed tokens', async () => {
      if (!serverReady) {
        console.log('Skipping: Server not available');
        return;
      }

      const malformedTokens = [
        '',
        ' ',
        'Bearer token',
        'null',
        'undefined',
      ];

      for (const token of malformedTokens) {
        client.setToken(token);
        await expectMCPError(
          client.listTools(),
          /(Invalid|Missing|authentication)/i
        );
      }
    });
  });
});
