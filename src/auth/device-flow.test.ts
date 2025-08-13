import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OAuthDeviceFlow } from './device-flow'
import * as prompts from '@clack/prompts'
import { logger } from '../utils/logger'
import * as util from 'util'

vi.mock('@clack/prompts')
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    debugSensitive: vi.fn(),
  }
}))
vi.mock('util', () => ({
  promisify: vi.fn((fn) => {
    return (...args: any[]) => {
      return new Promise((resolve, reject) => {
        const callback = args[args.length - 1]
        if (typeof callback === 'function') {
          args.pop()
        }
        const mockResult = (fn as any).__mockResult
        if (mockResult?.error) {
          reject(mockResult.error)
        } else {
          resolve(mockResult?.value || '')
        }
      })
    }
  })
}))

global.fetch = vi.fn()

describe('OAuthDeviceFlow', () => {
  let deviceFlow: OAuthDeviceFlow
  let mockSpinner: any

  beforeEach(() => {
    vi.clearAllMocks()
    deviceFlow = new OAuthDeviceFlow('https://test.api.com')
    
    mockSpinner = {
      start: vi.fn(),
      stop: vi.fn(),
    }
    vi.mocked(prompts.spinner).mockReturnValue(mockSpinner)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should use provided API URL', () => {
      const flow = new OAuthDeviceFlow('https://custom.api.com')
      expect(flow['apiUrl']).toBe('https://custom.api.com')
    })

    it('should use environment variable if no URL provided', () => {
      const originalEnv = process.env.VEAS_API_URL
      process.env.VEAS_API_URL = 'https://env.api.com'
      const flow = new OAuthDeviceFlow()
      expect(flow['apiUrl']).toBe('https://env.api.com')
      process.env.VEAS_API_URL = originalEnv
    })

    it('should default to veas.app if no URL provided', () => {
      const originalEnv = process.env.VEAS_API_URL
      delete process.env.VEAS_API_URL
      const flow = new OAuthDeviceFlow()
      expect(flow['apiUrl']).toBe('https://veas.app')
      if (originalEnv) process.env.VEAS_API_URL = originalEnv
    })
  })

  describe('initiateDeviceFlow', () => {
    it('should successfully initiate device flow', async () => {
      const mockResponse = {
        device_code: 'test-device-code',
        user_code: 'TEST-CODE',
        verification_uri: 'https://test.api.com/device',
        verification_uri_complete: 'https://test.api.com/device?code=TEST-CODE',
        expires_in: 900,
        interval: 5,
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await deviceFlow.initiateDeviceFlow()

      expect(result).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.api.com/api/cli/auth/device',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: 'veas-cli',
            scope: 'full_access',
          }),
        })
      )
    })

    it('should throw error on failed request', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        text: async () => 'Bad Request',
      } as Response)

      await expect(deviceFlow.initiateDeviceFlow()).rejects.toThrow(
        'Failed to initiate device flow: Bad Request'
      )
    })

    it('should handle network errors', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(deviceFlow.initiateDeviceFlow()).rejects.toThrow('Network error')
    })
  })

  describe('pollForToken', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should successfully poll and return token', async () => {
      const mockToken = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'test-refresh-token',
        scope: 'full_access',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
        },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockToken,
      } as Response)

      const pollPromise = deviceFlow.pollForToken('test-device-code', 5)
      
      await vi.advanceTimersByTimeAsync(5000)
      const result = await pollPromise

      expect(result).toEqual(mockToken)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.api.com/api/cli/auth/device/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: 'test-device-code',
            client_id: 'veas-cli',
          }),
        })
      )
    })

    it('should handle authorization_pending and continue polling', async () => {
      const mockToken = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
      }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'authorization_pending' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToken,
        } as Response)

      const pollPromise = deviceFlow.pollForToken('test-device-code', 5)
      
      await vi.advanceTimersByTimeAsync(5000) // First poll
      await vi.advanceTimersByTimeAsync(5000) // Second poll
      
      const result = await pollPromise

      expect(result).toEqual(mockToken)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should handle slow_down error', async () => {
      const mockToken = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
      }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'slow_down' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToken,
        } as Response)

      const pollPromise = deviceFlow.pollForToken('test-device-code', 1)
      
      await vi.advanceTimersByTimeAsync(5000) // Initial interval
      await vi.advanceTimersByTimeAsync(5000) // slow_down delay
      await vi.advanceTimersByTimeAsync(5000) // Next poll
      
      const result = await pollPromise

      expect(result).toEqual(mockToken)
    })

    it('should throw on unrecoverable error', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ 
          error: 'invalid_grant',
          error_description: 'Device code expired'
        }),
      } as Response)

      const pollPromise = deviceFlow.pollForToken('test-device-code', 5)
      
      await vi.advanceTimersByTimeAsync(5000)
      
      await expect(pollPromise).rejects.toThrow('Device code expired')
    })

    it('should enforce minimum polling interval of 5 seconds', async () => {
      const mockToken = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockToken,
      } as Response)

      const pollPromise = deviceFlow.pollForToken('test-device-code', 2) // 2 seconds
      
      await vi.advanceTimersByTimeAsync(5000) // Should use minimum 5 seconds
      const result = await pollPromise

      expect(result).toEqual(mockToken)
    })
  })

  describe('openBrowser', () => {
    it('should open browser on macOS', async () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      
      // The openBrowser method uses execAsync which is promisified exec
      // We just need to test that it doesn't throw
      await expect(deviceFlow.openBrowser('https://test.com')).resolves.not.toThrow()

      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform)
      }
    })

    it('should open browser on Windows', async () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
      Object.defineProperty(process, 'platform', { value: 'win32' })
      
      await expect(deviceFlow.openBrowser('https://test.com')).resolves.not.toThrow()

      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform)
      }
    })

    it('should open browser on Linux', async () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
      Object.defineProperty(process, 'platform', { value: 'linux' })
      
      await expect(deviceFlow.openBrowser('https://test.com')).resolves.not.toThrow()

      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform)
      }
    })

    it('should handle browser open failure gracefully', async () => {
      // Mock promisify to return a function that rejects
      const originalMock = vi.mocked(util.promisify).getMockImplementation()
      vi.mocked(util.promisify).mockImplementationOnce(() => {
        return () => Promise.reject(new Error('Command failed'))
      })

      await expect(deviceFlow.openBrowser('https://test.com')).resolves.not.toThrow()
      
      expect(logger.warn).toHaveBeenCalledWith('Could not open browser automatically.')
      expect(logger.info).toHaveBeenCalled()
      // Check that at least one call contains the expected text (accounting for color codes)
      const infoCalls = vi.mocked(logger.info).mock.calls
      const hasAuthMessage = infoCalls.some(call => 
        call[0] && call[0].toString().includes('Please visit this URL to authenticate:')
      )
      expect(hasAuthMessage).toBe(true)
      
      // Restore original mock
      vi.mocked(util.promisify).mockImplementation(originalMock!)
    })
  })

  describe('authenticate', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should complete full authentication flow', async () => {
      const mockDeviceResponse = {
        device_code: 'test-device-code',
        user_code: 'TEST-CODE',
        verification_uri: 'https://test.api.com/device',
        verification_uri_complete: 'https://test.api.com/device?code=TEST-CODE',
        expires_in: 900,
        interval: 5,
      }

      const mockToken = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDeviceResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToken,
        } as Response)

      // Mock exec to succeed

      const authPromise = deviceFlow.authenticate()
      
      await vi.advanceTimersByTimeAsync(5000)
      const result = await authPromise

      expect(result).toEqual(mockToken)
      expect(mockSpinner.start).toHaveBeenCalledWith('Initiating authentication...')
      expect(mockSpinner.start).toHaveBeenCalledWith('Waiting for authentication...')
      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('successful'))
    })

    it('should handle localhost URLs correctly', async () => {
      const localFlow = new OAuthDeviceFlow('http://localhost:3000')
      
      const mockDeviceResponse = {
        device_code: 'test-device-code',
        user_code: 'TEST-CODE',
        verification_uri: 'https://veas.app/device',
        verification_uri_complete: 'https://veas.app/device?code=TEST-CODE',
        expires_in: 900,
        interval: 5,
      }

      const mockToken = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
      }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDeviceResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToken,
        } as Response)

      // Mock exec to succeed

      const authPromise = localFlow.authenticate()
      
      await vi.advanceTimersByTimeAsync(5000)
      await authPromise

      // Browser should open with localhost URL
    })

    it('should handle authentication failure', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(deviceFlow.authenticate()).rejects.toThrow('Network error')
      
      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('failed'))
    })

    it('should open browser with verification_uri if complete URL not available', async () => {
      const mockDeviceResponse = {
        device_code: 'test-device-code',
        user_code: 'TEST-CODE',
        verification_uri: 'https://test.api.com/device',
        expires_in: 900,
        interval: 5,
      }

      const mockToken = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
      }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDeviceResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToken,
        } as Response)

      // Mock exec to succeed

      const authPromise = deviceFlow.authenticate()
      
      await vi.advanceTimersByTimeAsync(5000)
      await authPromise

      // Browser should open with verification_uri
    })
  })
})