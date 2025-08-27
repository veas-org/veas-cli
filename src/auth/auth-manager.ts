import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import axios from 'axios'
import { logger } from '../utils/logger.js'
import { OAuthDeviceFlow } from './device-flow.js'

export interface User {
  id: string
  email: string
  [key: string]: any
}

export interface Session {
  user: User
  token: string
  refreshToken?: string
  expiresAt?: number
  patToken?: string
  email?: string
  type?: string
}

export class AuthManager {
  private static instance: AuthManager
  private configDir: string
  private authFile: string
  private encryptionKey: Buffer
  private apiUrl: string

  private constructor() {
    this.configDir = path.join(os.homedir(), '.veas')
    this.authFile = path.join(this.configDir, 'auth.json')
    // Use machine ID as encryption key source
    const machineId = os.hostname() + os.platform() + os.arch()
    this.encryptionKey = crypto.scryptSync(machineId, 'veas-cli-salt', 32)
    // Initialize with default, but allow dynamic updates
    this.apiUrl = 'https://veas.app'
    this.updateApiUrl()
  }

  private updateApiUrl(): void {
    // Check environment variable and update if set
    if (process.env.VEAS_API_URL) {
      this.apiUrl = process.env.VEAS_API_URL
    }
  }

  getApiUrl(): string {
    return this.apiUrl
  }

  private async ensureConfigDir() {
    try {
      await fs.mkdir(this.configDir, { recursive: true })
    } catch (_error) {
      // Directory might already exist
    }
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return `${iv.toString('hex')}:${encrypted}`
  }

  private decrypt(text: string): string {
    const parts = text.split(':')
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format')
    }
    const iv = Buffer.from(parts[0]!, 'hex')
    const encryptedText = parts[1]!
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv)
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    try {
      // Call Veas API directly for authentication
      const response = await axios.post(
        `${this.apiUrl}/api/cli/auth/login`,
        { email, password },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'veas-cli/0.1.0',
          },
        },
      )

      const { user, token, refreshToken } = response.data

      if (!user || !token) {
        throw new Error('Invalid response from authentication server')
      }

      await this.saveSession({
        user,
        token,
        refreshToken,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      })

      logger.debug('Login successful', { userId: user.id })
      return { user, token }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message
        throw new Error(`Authentication failed: ${message}`)
      }
      throw error
    }
  }

  async loginWithToken(pat: string): Promise<{ user: User; token: string }> {
    try {
      // Validate PAT with API
      const response = await axios.post(
        `${this.apiUrl}/api/cli/auth/validate-pat`,
        { token: pat },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'veas-cli/0.1.0',
          },
        },
      )

      const { user } = response.data

      if (!user) {
        throw new Error('Invalid personal access token')
      }

      await this.saveSession({
        user,
        token: pat,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days for PAT
      })

      logger.debug('PAT login successful', { userId: user.id })
      return { user, token: pat }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message
        throw new Error(`Token validation failed: ${message}`)
      }
      throw error
    }
  }

  async loginWithDeviceCode(tokenResponse?: any): Promise<{ user: User; token: string }> {
    try {
      // If no token response provided, perform the device flow
      let authTokenResponse = tokenResponse
      if (!authTokenResponse) {
        const deviceFlow = new OAuthDeviceFlow(this.apiUrl)
        authTokenResponse = await deviceFlow.authenticate()
      }

      // Try to get user info from the token response or validate endpoint
      let user: User

      // Check if user info is included in the token response
      if (authTokenResponse.user) {
        logger.debug('Using user info from token response:', authTokenResponse.user)
        user = authTokenResponse.user
      } else {
        logger.debug('No user info in token response, will try to fetch it')
        // Try to validate the token and get user info
        try {
          logger.debug('Attempting to validate token to get user info')
          const validateResponse = await axios.post(
            `${this.apiUrl}/api/cli/auth/validate-pat`,
            {},
            {
              headers: {
                Authorization: `Bearer ${authTokenResponse.access_token}`,
                'Content-Type': 'application/json',
              },
            },
          )
          user = validateResponse.data.user
          logger.debug('Got user info from validate endpoint')
        } catch (_validateError: unknown) {
          // If validate endpoint doesn't exist, try alternate endpoints
          logger.debug('Validate endpoint not available, trying /api/auth/me')
          try {
            const meResponse = await axios.get(`${this.apiUrl}/api/auth/me`, {
              headers: {
                Authorization: `Bearer ${authTokenResponse.access_token}`,
              },
            })
            user = meResponse.data
            logger.debug('Got user info from /api/auth/me')
          } catch (_meError: unknown) {
            // Last resort: create a minimal user object
            logger.warn('No user info endpoints available, using placeholder user')
            user = {
              id: 'device-auth-user',
              email: 'user@device-auth',
              name: 'Device Auth User',
            }
          }
        }
      }

      // Save the session
      await this.saveSession({
        user,
        token: authTokenResponse.access_token,
        refreshToken: authTokenResponse.refresh_token,
        expiresAt:
          Date.now() + (authTokenResponse.expires_in ? authTokenResponse.expires_in * 1000 : 7 * 24 * 60 * 60 * 1000),
      })

      logger.debug('Device flow login successful', { userId: user.id })
      return { user, token: authTokenResponse.access_token }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message
        throw new Error(`Device flow failed: ${message}`)
      }
      throw error
    }
  }

  async logout(): Promise<void> {
    try {
      await fs.unlink(this.authFile)
      logger.debug('Logged out successfully')
    } catch (_error) {
      // File might not exist
    }
  }

  async getSession(): Promise<Session | null> {
    try {
      const data = await fs.readFile(this.authFile, 'utf-8')
      const decrypted = this.decrypt(data)
      const session = JSON.parse(decrypted) as Session

      // Check if session is expired
      if (session.expiresAt && session.expiresAt < Date.now()) {
        await this.logout()
        return null
      }

      return session
    } catch (_error) {
      return null
    }
  }

  async getToken(): Promise<string | null> {
    const session = await this.getSession()
    return session?.token || null
  }

  private async saveSession(session: Session): Promise<void> {
    await this.ensureConfigDir()
    const encrypted = this.encrypt(JSON.stringify(session))
    await fs.writeFile(this.authFile, encrypted, 'utf-8')
    // Set restrictive permissions
    await fs.chmod(this.authFile, 0o600)
  }

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager()
    }
    // Always update API URL in case env vars were loaded after initial creation
    AuthManager.instance.updateApiUrl()
    return AuthManager.instance
  }

  // Backward compatibility methods
  async getCredentials(): Promise<Session | null> {
    return this.getSession()
  }

  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession()
    return session !== null && !!session.token
  }

  async ensureAuthenticated(): Promise<void> {
    const isAuth = await this.isAuthenticated()
    if (!isAuth) {
      throw new Error('Not authenticated. Please run "veas login" first.')
    }
  }

  async refreshToken(): Promise<void> {
    const session = await this.getSession()
    if (!session) {
      throw new Error('No stored session found')
    }
    // For now, just log out to force re-login
    await this.logout()
  }

  async createPAT(name: string, scopes: string[] = ['read', 'write']): Promise<string> {
    const session = await this.getSession()
    if (!session) {
      throw new Error('Not authenticated. Please login first.')
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/api/cli/pat/create`,
        { name, scopes },
        {
          headers: {
            Authorization: `Bearer ${session.token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'veas-cli/0.1.0',
          },
        },
      )

      return response.data.token
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message
        throw new Error(`Failed to create PAT: ${message}`)
      }
      throw error
    }
  }

  async listPATs(): Promise<any[]> {
    const session = await this.getSession()
    if (!session) {
      throw new Error('Not authenticated. Please login first.')
    }

    try {
      const response = await axios.get(`${this.apiUrl}/api/cli/pat/list`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
          'User-Agent': 'veas-cli/0.1.0',
        },
      })

      return response.data.tokens || []
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message
        throw new Error(`Failed to list PATs: ${message}`)
      }
      throw error
    }
  }
}
