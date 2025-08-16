/**
 * MCP Client Helper for E2E Testing
 * Provides utilities for making MCP protocol requests
 */

import { E2E_CONFIG } from '../setup.js'
import { logger } from '../../../utils/logger.js'

export interface MCPRequest {
  jsonrpc: '2.0'
  method: string
  params?: any
  id: string | number
}

export interface MCPResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

export interface MCPClientOptions {
  apiUrl?: string
  token?: string
  transport?: 'http' | 'sse' | 'stdio' | 'message'
  timeout?: number
  headers?: Record<string, string>
}

export class MCPTestClient {
  private apiUrl: string
  private token?: string
  private transport: string
  private timeout: number
  private defaultHeaders: Record<string, string>

  constructor(options: MCPClientOptions = {}) {
    this.apiUrl = options.apiUrl || E2E_CONFIG.apiUrl
    this.token = options.token
    this.transport = options.transport || 'http'
    this.timeout = options.timeout || E2E_CONFIG.testTimeout
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...options.headers,
    }
  }

  /**
   * Set authentication token
   */
  setToken(token: string): void {
    this.token = token
  }

  /**
   * Make an MCP request
   */
  async request(method: string, params?: any, id?: string | number): Promise<MCPResponse> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      method,
      params: params || {},
      id: id || Date.now().toString(),
    }

    const headers = { ...this.defaultHeaders }
    if (this.token) {
      headers['X-MCP-Token'] = this.token
      headers['Authorization'] = `Bearer ${this.token}`
    }

    const url = `${this.apiUrl}/api/mcp/${this.transport}`
    logger.debug(`MCP Request to ${url}:`, request)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const responseText = await response.text()
      logger.debug(`MCP Response (${response.status}):`, responseText.substring(0, 500))

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText}`)
      }

      // Parse response based on content type
      const contentType = response.headers.get('content-type') || ''
      let result: MCPResponse

      if (contentType.includes('text/event-stream') || responseText.startsWith('event:')) {
        // Parse SSE response
        result = this.parseSSEResponse(responseText)
      } else {
        // Parse JSON response
        result = JSON.parse(responseText)
      }

      return result
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<any[]> {
    const response = await this.request('tools/list')
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`)
    }
    return response.result?.tools || []
  }

  /**
   * Call a specific tool
   */
  async callTool(name: string, args: any = {}): Promise<any> {
    const response = await this.request('tools/call', {
      name,
      arguments: args,
    })

    if (response.error) {
      throw new Error(`Tool Error: ${response.error.message}`)
    }

    return response.result
  }

  /**
   * Test connection health
   */
  async testConnection(): Promise<boolean> {
    try {
      const tools = await this.listTools()
      return Array.isArray(tools) && tools.length > 0
    } catch (error) {
      logger.debug('Connection test failed:', error)
      return false
    }
  }

  /**
   * Get server capabilities
   */
  async getCapabilities(): Promise<any> {
    const response = await this.request('initialize', {
      protocolVersion: '1.0',
      clientInfo: {
        name: 'veas-cli-e2e-test',
        version: '1.0.0',
      },
    })

    if (response.error) {
      throw new Error(`Capabilities Error: ${response.error.message}`)
    }

    return response.result
  }

  /**
   * Parse SSE response format
   */
  private parseSSEResponse(text: string): MCPResponse {
    const lines = text.split('\n')
    const dataLine = lines.find((line) => line.startsWith('data: '))

    if (!dataLine) {
      throw new Error('Invalid SSE response: no data line found')
    }

    const jsonData = dataLine.substring(6)
    return JSON.parse(jsonData)
  }

  /**
   * Make a raw HTTP request (for testing non-standard scenarios)
   */
  async rawRequest(
    method = 'POST',
    path = `/api/mcp/${this.transport}`,
    body?: any,
    headers?: Record<string, string>,
  ): Promise<Response> {
    const url = `${this.apiUrl}${path}`
    const requestHeaders = {
      ...this.defaultHeaders,
      ...headers,
    }

    if (this.token && !headers?.['X-MCP-Token']) {
      requestHeaders['X-MCP-Token'] = this.token
      requestHeaders['Authorization'] = `Bearer ${this.token}`
    }

    return fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    })
  }
}

// Factory function for creating test clients
export function createMCPClient(options?: MCPClientOptions): MCPTestClient {
  return new MCPTestClient(options)
}
