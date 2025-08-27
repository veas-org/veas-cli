import * as prompts from '@clack/prompts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthManager } from '../auth/auth-manager'
import { mockUser } from '../test/mocks'
import { login, logout, status } from './auth'

// Mock dependencies
vi.mock('../auth/auth-manager')
vi.mock('@clack/prompts')

describe('Auth Commands', () => {
  let mockAuthManager: unknown
  let mockSpinner: unknown
  let consoleLogSpy: any
  let consoleErrorSpy: any
  let processExitSpy: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup console spies
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    // Setup auth manager mock
    mockAuthManager = {
      login: vi.fn(),
      logout: vi.fn(),
      getCredentials: vi.fn(),
      getSession: vi.fn(),
      refreshToken: vi.fn(),
      getToken: vi.fn(),
    }
    vi.mocked(AuthManager).getInstance.mockReturnValue(mockAuthManager)

    // Setup prompts mock
    mockSpinner = {
      start: vi.fn(),
      stop: vi.fn(),
    }
    vi.mocked(prompts.spinner).mockReturnValue(mockSpinner)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      vi.mocked(prompts.text).mockResolvedValueOnce('test@example.com')
      vi.mocked(prompts.password).mockResolvedValueOnce('V3@s$2024!Dev#Seed&Test')

      mockAuthManager.login.mockResolvedValueOnce({
        user: mockUser,
        token: 'test-token',
      })

      await login()

      expect(prompts.text).toHaveBeenCalledWith({
        message: 'Email:',
        validate: expect.any(Function),
      })

      expect(prompts.password).toHaveBeenCalledWith({
        message: 'Password:',
        validate: expect.any(Function),
      })

      expect(mockAuthManager.login).toHaveBeenCalledWith('test@example.com', 'V3@s$2024!Dev#Seed&Test')

      expect(mockSpinner.start).toHaveBeenCalledWith('Logging in...')
      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('Logged in as'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Authentication credentials saved securely'))
    })

    it('should validate email input', async () => {
      let validateFn: any
      vi.mocked(prompts.text).mockImplementation(async (options: unknown) => {
        validateFn = options.validate
        return 'test@example.com'
      })
      vi.mocked(prompts.password).mockResolvedValueOnce('V3@s$2024!Dev#Seed&Test')
      mockAuthManager.login.mockResolvedValueOnce({
        user: mockUser,
        token: 'test-token',
      })

      await login()

      expect(validateFn?.('valid@email.com')).toBeUndefined()
      expect(validateFn?.('invalid-email')).toBe('Please enter a valid email')
      expect(validateFn?.('')).toBe('Please enter a valid email')
    })

    it('should validate password input', async () => {
      let validateFn: any
      vi.mocked(prompts.text).mockResolvedValueOnce('test@example.com')
      vi.mocked(prompts.password).mockImplementation(async (options: unknown) => {
        validateFn = options.validate
        return 'V3@s$2024!Dev#Seed&Test'
      })
      mockAuthManager.login.mockResolvedValueOnce({
        user: mockUser,
        token: 'test-token',
      })

      await login()

      expect(validateFn?.('validpass')).toBeUndefined()
      expect(validateFn?.('short')).toBe('Password must be at least 6 characters')
      expect(validateFn?.('')).toBe('Password must be at least 6 characters')
    })

    it('should handle cancelled email input', async () => {
      vi.mocked(prompts.text).mockResolvedValueOnce(Symbol.for('cancel'))

      await expect(login()).rejects.toThrow('process.exit called')

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Login cancelled'))
      expect(processExitSpy).toHaveBeenCalledWith(0)
    })

    it('should handle cancelled password input', async () => {
      vi.mocked(prompts.text).mockResolvedValueOnce('test@example.com')
      vi.mocked(prompts.password).mockResolvedValueOnce(Symbol.for('cancel'))

      await expect(login()).rejects.toThrow('process.exit called')

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Login cancelled'))
      expect(processExitSpy).toHaveBeenCalledWith(0)
    })

    it('should handle login failure', async () => {
      vi.mocked(prompts.text).mockResolvedValueOnce('test@example.com')
      vi.mocked(prompts.password).mockResolvedValueOnce('wrongpassword')

      mockAuthManager.login.mockRejectedValueOnce(new Error('Invalid credentials'))

      await expect(login()).rejects.toThrow('process.exit called')

      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('Login failed'))
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'Invalid credentials')
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('logout', () => {
    it('should successfully logout', async () => {
      mockAuthManager.logout.mockResolvedValueOnce(undefined)

      await logout()

      expect(mockSpinner.start).toHaveBeenCalledWith('Logging out...')
      expect(mockAuthManager.logout).toHaveBeenCalled()
      expect(mockSpinner.stop).toHaveBeenCalledWith('Logged out successfully')
    })

    it('should handle logout failure', async () => {
      mockAuthManager.logout.mockRejectedValueOnce(new Error('Logout failed'))

      await expect(logout()).rejects.toThrow('process.exit called')

      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('Logout failed'))
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'Logout failed')
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('status', () => {
    it('should show logged in status with user info', async () => {
      const session = {
        user: mockUser,
        token: 'test-token',
        email: 'test@example.com',
      }
      mockAuthManager.getSession.mockResolvedValueOnce(session)

      await status()

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Logged in'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Email: test@example.com'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`User ID: ${mockUser.id}`))
    })

    it('should show not logged in status', async () => {
      mockAuthManager.getSession.mockResolvedValueOnce(null)

      await status()

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Not logged in'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Run "veas login" to authenticate'))
    })

    it('should handle credentials without user ID', async () => {
      const session = {
        user: { ...mockUser, id: undefined },
        token: 'test-token',
        email: 'test@example.com',
      }
      mockAuthManager.getSession.mockResolvedValueOnce(session)

      await status()

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Email: test@example.com'))
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('User ID:'))
    })

    it.skip('should handle status check errors', async () => {
      mockAuthManager.getCredentials.mockRejectedValueOnce(new Error('Failed to read credentials'))

      await expect(status()).rejects.toThrow('process.exit called')

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'Error checking status:', expect.any(Error))
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })
})
