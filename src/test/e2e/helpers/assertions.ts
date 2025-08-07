/**
 * Custom Assertions for E2E Testing
 * Provides specialized assertions for MCP protocol testing
 */

import { expect } from 'vitest';
import type { MCPResponse } from './mcp-client.js';

/**
 * Assert that an MCP response is successful
 */
export function expectMCPSuccess(response: MCPResponse, id?: string | number): void {
  expect(response).toBeDefined();
  expect(response.jsonrpc).toBe('2.0');
  
  if (id !== undefined) {
    expect(response.id).toBe(id);
  }
  
  expect(response.error).toBeUndefined();
  expect(response.result).toBeDefined();
}

/**
 * Assert that an MCP response contains an error
 */
export function expectMCPError(
  response: MCPResponse,
  expectedCode?: number,
  expectedMessage?: string | RegExp
): void {
  expect(response).toBeDefined();
  expect(response.jsonrpc).toBe('2.0');
  expect(response.error).toBeDefined();
  expect(response.result).toBeUndefined();

  if (expectedCode !== undefined) {
    expect(response.error!.code).toBe(expectedCode);
  }

  if (expectedMessage !== undefined) {
    if (typeof expectedMessage === 'string') {
      expect(response.error!.message).toContain(expectedMessage);
    } else {
      expect(response.error!.message).toMatch(expectedMessage);
    }
  }
}

/**
 * Assert that a tool exists in the tools list
 */
export function expectToolExists(tools: any[], toolName: string): void {
  expect(tools).toBeDefined();
  expect(Array.isArray(tools)).toBe(true);
  
  const tool = tools.find(t => t.name === toolName);
  expect(tool).toBeDefined();
  expect(tool.description).toBeDefined();
  expect(tool.inputSchema).toBeDefined();
}

/**
 * Assert tool response format
 */
export function expectToolResponse(result: any, expectedFormat?: 'json' | 'text' | 'markdown'): void {
  expect(result).toBeDefined();

  if (expectedFormat) {
    switch (expectedFormat) {
      case 'json':
        expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
        break;
      case 'text':
        expect(typeof result).toBe('string');
        break;
      case 'markdown':
        expect(typeof result).toBe('string');
        // Could add more specific markdown checks
        break;
    }
  }
}

/**
 * Assert HTTP response status
 */
export async function expectHTTPStatus(response: Response, expectedStatus: number): Promise<void> {
  expect(response.status).toBe(expectedStatus);
}

/**
 * Assert response time is within limits
 */
export function expectResponseTime(startTime: number, maxDuration: number): void {
  const duration = Date.now() - startTime;
  expect(duration).toBeLessThan(maxDuration);
}

/**
 * Assert authentication headers are present
 */
export function expectAuthHeaders(headers: Headers): void {
  const hasAuth = headers.has('Authorization') || headers.has('X-MCP-Token');
  expect(hasAuth).toBe(true);
}

/**
 * Assert rate limit headers
 */
export function expectRateLimitHeaders(headers: Headers): void {
  expect(headers.has('X-RateLimit-Limit')).toBe(true);
  expect(headers.has('X-RateLimit-Remaining')).toBe(true);
  expect(headers.has('X-RateLimit-Reset')).toBe(true);
}

/**
 * Assert content type
 */
export function expectContentType(headers: Headers, expectedType: string): void {
  const contentType = headers.get('Content-Type');
  expect(contentType).toBeDefined();
  expect(contentType).toContain(expectedType);
}

/**
 * Assert tool parameter validation
 */
export function expectParameterValidation(
  error: any,
  parameterName: string,
  expectedMessage?: string
): void {
  expect(error).toBeDefined();
  expect(error.message).toContain(parameterName);
  
  if (expectedMessage) {
    expect(error.message).toContain(expectedMessage);
  }
}

/**
 * Assert connection error
 */
export function expectConnectionError(error: any, expectedType?: 'timeout' | 'network' | 'dns'): void {
  expect(error).toBeDefined();
  
  switch (expectedType) {
    case 'timeout':
      expect(error.message).toMatch(/timeout|timed out/i);
      break;
    case 'network':
      expect(error.message).toMatch(/network|connection|ECONNREFUSED/i);
      break;
    case 'dns':
      expect(error.message).toMatch(/dns|ENOTFOUND|getaddrinfo/i);
      break;
  }
}

/**
 * Custom matchers for MCP testing
 */
export const mcpMatchers = {
  toBeValidMCPResponse(received: any) {
    const pass = 
      received?.jsonrpc === '2.0' &&
      received?.id !== undefined &&
      (received?.result !== undefined || received?.error !== undefined);

    return {
      pass,
      message: () => 
        pass
          ? `expected ${JSON.stringify(received)} not to be a valid MCP response`
          : `expected ${JSON.stringify(received)} to be a valid MCP response`,
    };
  },

  toHaveMCPError(received: any, expectedCode?: number) {
    const hasError = received?.error !== undefined;
    const codeMatches = expectedCode === undefined || received?.error?.code === expectedCode;
    const pass = hasError && codeMatches;

    return {
      pass,
      message: () => {
        if (!hasError) {
          return `expected response to have an MCP error, but got: ${JSON.stringify(received)}`;
        }
        if (!codeMatches) {
          return `expected error code ${expectedCode}, but got ${received.error.code}`;
        }
        return `expected response not to have MCP error with code ${expectedCode}`;
      },
    };
  },
};

// Extend Vitest's expect with custom matchers
declare module 'vitest' {
  interface Assertion {
    toBeValidMCPResponse(): void;
    toHaveMCPError(expectedCode?: number): void;
  }
}