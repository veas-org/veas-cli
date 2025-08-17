import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { AuthManager } from '../../auth/auth-manager.js'
import { LogLevel, logger } from '../../utils/logger.js'

// Test configuration
export const E2E_CONFIG = {
  apiUrl: process.env.VEAS_API_URL || 'http://localhost:3000',
  testTimeout: 30000, // 30 seconds for E2E tests
  retryAttempts: 3,
  retryDelay: 1000,
  verbose: process.env.E2E_VERBOSE === 'true',
}

// Test tokens for different scenarios
export const TEST_TOKENS = {
  validPAT: process.env.E2E_PAT_TOKEN || 'mcp_test_1234567890abcdef1234567890abcdef',
  validCLI: process.env.E2E_CLI_TOKEN || 'cli_test_1234567890abcdef1234567890abcdef',
  expiredToken: 'mcp_exp_1234567890abcdef1234567890abcdef',
  invalidToken: 'invalid_token_format',
}

// Global test state
let originalEnv: NodeJS.ProcessEnv
let authManager: AuthManager

beforeAll(async () => {
  // Store original environment
  originalEnv = { ...process.env }

  // Set test environment
  process.env.NODE_ENV = 'test'
  process.env.VEAS_API_URL = E2E_CONFIG.apiUrl

  // Enable verbose logging if requested
  if (E2E_CONFIG.verbose) {
    logger.setLevel(LogLevel.DEBUG)
  }

  // Initialize auth manager
  authManager = AuthManager.getInstance()

  console.log('🧪 E2E Test Environment Setup:')
  console.log(`   API URL: ${E2E_CONFIG.apiUrl}`)
  console.log(`   Timeout: ${E2E_CONFIG.testTimeout}ms`)
  console.log(`   Verbose: ${E2E_CONFIG.verbose}`)
  console.log('')
})

afterAll(async () => {
  // Restore original environment
  process.env = originalEnv
})

beforeEach(async () => {
  // Clear any cached data
  if (global.fetch) {
    global.fetch = originalFetch
  }
})

afterEach(async () => {
  // Clean up after each test
  // Reset any mocks
})

// Helper to wait for server to be ready
export async function waitForServer(url: string = E2E_CONFIG.apiUrl, maxAttempts = 10): Promise<boolean> {
  console.log(`⏳ Waiting for server at ${url}...`)

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${url}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })

      if (response.ok) {
        console.log('✅ Server is ready')
        return true
      }
    } catch (_error) {
      // Server not ready yet
    }

    if (i < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  console.log('❌ Server is not responding')
  return false
}

// Store original fetch for restoration
const originalFetch = global.fetch

// Helper to mock fetch responses in E2E tests
export function mockE2EFetch(handler: (url: string, options?: RequestInit) => Promise<Response> | Response) {
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const response = await handler(url, init)
    return response
  }
}

// Helper to restore original fetch
export function restoreFetch() {
  global.fetch = originalFetch
}

// Export test utilities
export { authManager, E2E_CONFIG as config }
