import { AuthManager } from '../auth/auth-manager.js';
import type { MCPResult } from '../types/mcp.js';
import { logger } from '../utils/logger.js';

/**
 * Direct MCP client that calls the mcp-simple endpoint
 * This bypasses the MCP server's tool loading and standalone fallback
 */
export class MCPClient {
  private static instance: MCPClient;
  private authManager: AuthManager;
  private baseUrl: string;
  private connected: boolean = false;

  constructor(baseUrl?: string) {
    this.authManager = AuthManager.getInstance();
    this.baseUrl = baseUrl || process.env.VEAS_API_URL || 'http://localhost:3000';
  }

  static getInstance(): MCPClient {
    if (!MCPClient.instance) {
      MCPClient.instance = new MCPClient();
    }
    return MCPClient.instance;
  }

  async initialize(): Promise<any> {
    const credentials = await this.authManager.getCredentials();
    const token = credentials?.patToken || credentials?.token || (credentials as any)?.accessToken;
    
    if (!token) {
      throw new Error('Not authenticated. Please run "veas login" first.');
    }

    const response = await fetch(`${this.baseUrl}/api/mcp-manual`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'veas-cli',
            version: '1.0.0',
          },
        },
        id: 'init',
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized. Please check your authentication.');
      }
      throw new Error(`Initialization failed: ${response.statusText}`);
    }

    const result = await response.json();
    if (result?.error) {
      throw new Error(result.error.message);
    }
    this.connected = true;
    return result?.result;
  }

  async listTools(): Promise<any> {
    const credentials = await this.authManager.getCredentials();
    const token = credentials?.patToken || credentials?.token || (credentials as any)?.accessToken;
    
    if (!token) {
      throw new Error('Authentication token not found. Please run "veas login" first.');
    }

    const response = await fetch(`${this.baseUrl}/api/mcp/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 'list-tools',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to list tools: ${response.statusText}`);
    }

    const result: any = await response.json();
    if (result?.error) {
      throw new Error(result.error.message);
    }

    return result?.result;
  }

  async request(method: string, params: any, headers?: any): Promise<any> {
    const credentials = await this.authManager.getCredentials();
    const token = credentials?.patToken || credentials?.token || (credentials as any)?.accessToken;
    
    const response = await fetch(`${this.baseUrl}/api/mcp/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: Date.now().toString(),
      }),
    });

    return response.json();
  }

  disconnect(): void {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Call an MCP tool directly via the mcp-simple endpoint
   * This ensures we always get real data from the server
   */
  async callTool(toolName: string, params: any): Promise<any> {
    const credentials = await this.authManager.getCredentials();
    const token = credentials?.patToken || credentials?.token || (credentials as any)?.accessToken;
    
    if (!token) {
      throw new Error('Authentication token not found. Please run "veas login" first.');
    }

    const url = `${this.baseUrl}/api/mcp-manual`;
    const requestBody = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params,
      },
      id: Date.now().toString(),
    };

    logger.debug(`Calling MCP tool: ${toolName}`);
    logger.debug(`API URL: ${url}`);
    logger.debug(`Using token: ${token ? 'Yes' : 'No'} (length: ${token?.length || 0})`);
    logger.debug(`Token type: ${credentials?.patToken ? 'PAT' : credentials?.token ? 'Session' : 'None'}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-MCP-Token': token,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30000) as any, // 30 second timeout
      });

      const responseText = await response.text();
      
      if (!response.ok) {
        logger.error(`HTTP ${response.status}: ${responseText}`);
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (_e) {
        throw new Error(`Failed to parse response: ${responseText}`)
      }

      if (result.error) {
        logger.debug(`MCP error: ${JSON.stringify(result.error)}`);
        throw new Error(result.error.message || 'Unknown error');
      }

      logger.debug(`MCP response result:`, JSON.stringify(result.result, null, 2));
      
      return result.result;
    } catch (error) {
      logger.error(`MCP call failed: ${error}`);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out after 30 seconds');
      }
      throw error;
    }
  }

  /**
   * Call an MCP tool with error handling that returns success/error format
   * Used by docsSync and other commands that need structured error handling
   */
  async callToolSafe(toolName: string, params: any): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.callTool(toolName, params);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * List available MCP tools - implementation for MCPResult return type
   */
  async listToolsWithResult(): Promise<MCPResult> {
    const credentials = await this.authManager.getCredentials();
    const token = credentials?.patToken || credentials?.token;
    
    if (!token) {
      throw new Error('Authentication token not found. Please run "veas login" first.');
    }

    const url = `${process.env.VEAS_API_URL || 'https://veas.app'}/api/mcp-simple`;
    const requestBody = {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: '1',
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-MCP-Token': token,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const result: any = await response.json();
      
      if (result.error) {
        return {
          success: false,
          error: result.error.message || 'Unknown error',
        };
      }

      return {
        success: true,
        data: result.result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Export convenience function
export async function callMCPTool(toolName: string, params: any): Promise<MCPResult> {
  const client = MCPClient.getInstance();
  return client.callTool(toolName, params);
}