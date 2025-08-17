/**
 * Authentication Helper for E2E Testing
 * Provides utilities for managing authentication in tests
 */

import type { AuthCredentials } from '../../../auth/auth-manager.js'
import { AuthManager } from '../../../auth/auth-manager.js'
import { E2E_CONFIG, TEST_TOKENS } from '../setup.js'

export class E2EAuthHelper {
  private authManager: AuthManager
  private originalCredentials?: AuthCredentials

  constructor() {
    this.authManager = AuthManager.getInstance()
  }

  /**
   * Save current authentication state
   */
  async saveAuthState(): Promise<void> {
    try {
      this.originalCredentials = await this.authManager.getCredentials()
    } catch (_error) {
      // No credentials to save
      this.originalCredentials = undefined
    }
  }

  /**
   * Restore original authentication state
   */
  async restoreAuthState(): Promise<void> {
    if (this.originalCredentials) {
      await this.authManager.saveCredentials(this.originalCredentials)
    } else {
      await this.authManager.logout()
    }
  }

  /**
   * Login with test credentials
   */
  async loginWithTestUser(email = 'test@example.com', password = 'test123'): Promise<string> {
    const credentials = await this.authManager.login({
      type: 'password',
      email,
      password,
    })

    if (!credentials.token) {
      throw new Error('Login failed: no token received')
    }

    return credentials.token
  }

  /**
   * Set a specific token for testing
   */
  async setTestToken(token: string, _type: 'pat' | 'cli' = 'cli'): Promise<void> {
    const credentials: AuthCredentials = {
      type: 'token',
      token,
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }

    await this.authManager.saveCredentials(credentials)
  }

  /**
   * Clear all authentication
   */
  async clearAuth(): Promise<void> {
    await this.authManager.logout()
  }

  /**
   * Create a Personal Access Token
   */
  async createPAT(name = 'E2E Test Token', scopes: string[] = ['*']): Promise<string> {
    const token = await this.authManager.getToken()
    if (!token) {
      throw new Error('No authentication token available')
    }

    const response = await fetch(`${E2E_CONFIG.apiUrl}/api/cli/auth/pat/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        scopes,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to create PAT: ${error}`)
    }

    const result = await response.json()
    return result.token
  }

  /**
   * Get current token
   */
  async getCurrentToken(): Promise<string | null> {
    return this.authManager.getToken()
  }

  /**
   * Check if authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    return this.authManager.isAuthenticated()
  }

  /**
   * Device authentication flow simulation
   */
  async simulateDeviceAuth(): Promise<string> {
    // Start device auth flow
    const deviceResponse = await fetch(`${E2E_CONFIG.apiUrl}/api/cli/auth/device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: 'veas-cli-e2e-test',
      }),
    })

    if (!deviceResponse.ok) {
      throw new Error('Failed to start device auth flow')
    }

    const { device_code, user_code } = await deviceResponse.json()

    // In a real test, you would automate the browser flow
    // For E2E testing, we'll simulate the approval
    const approvalResponse = await fetch(`${E2E_CONFIG.apiUrl}/api/cli/auth/device/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_TOKENS.validCLI}`, // Use a test token
      },
      body: JSON.stringify({
        user_code,
      }),
    })

    if (!approvalResponse.ok) {
      throw new Error('Failed to approve device')
    }

    // Poll for token
    let attempts = 0
    const maxAttempts = 10

    while (attempts < maxAttempts) {
      const tokenResponse = await fetch(`${E2E_CONFIG.apiUrl}/api/cli/auth/device/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      })

      if (tokenResponse.ok) {
        const { access_token } = await tokenResponse.json()
        return access_token
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++
    }

    throw new Error('Device auth timeout')
  }

  /**
   * Test token validation
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      const response = await fetch(`${E2E_CONFIG.apiUrl}/api/cli/auth/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      return response.ok
    } catch (_error) {
      return false
    }
  }

  /**
   * Get best available token (mimics auth-wrapper behavior)
   */
  async getBestToken(): Promise<string | null> {
    // Check for PAT in environment
    const envPat = process.env.VEAS_PAT || process.env.PAT
    if (envPat) {
      return envPat
    }

    // Check for MCP_TOKEN in environment
    const mcpToken = process.env.MCP_TOKEN
    if (mcpToken) {
      return mcpToken
    }

    // Fall back to CLI token
    return this.authManager.getToken()
  }
}

// Export singleton instance
export const authHelper = new E2EAuthHelper()
