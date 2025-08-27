import * as prompts from '@clack/prompts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthManager } from '../auth/auth-manager.js'
import { createPAT, listPATs } from './pat.js'

// Mock dependencies
vi.mock('../auth/auth-manager.js', () => ({
  AuthManager: {
    getInstance: vi.fn(),
  },
}))

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@clack/prompts')

// Mock fetch globally
global.fetch = vi.fn()

describe('PAT Commands', () => {
  let mockAuthManager: unknown

  beforeEach(() => {
    mockAuthManager = {
      isAuthenticated: vi.fn(),
      getToken: vi.fn(),
    }
    ;(AuthManager.getInstance as any).mockReturnValue(mockAuthManager)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('createPAT', () => {
    it('should create a PAT successfully', async () => {
      // Setup mocks
      mockAuthManager.isAuthenticated.mockResolvedValue(true)
      mockAuthManager.getToken.mockResolvedValue('test-cli-token')
      ;(prompts.text as any).mockResolvedValue('My Test Token')
      ;(prompts.select as any).mockResolvedValue('projects:read,projects:write')

      const mockToken = 'mya_test123456789'
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ token: mockToken }),
      })

      // Capture console.log output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // Execute
      await createPAT()

      // Verify API call
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/cli/auth/pat/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-cli-token',
        },
        body: JSON.stringify({
          name: 'My Test Token',
          scopes: ['projects:read', 'projects:write'],
        }),
      })

      // Verify output includes the token
      const output = consoleSpy.mock.calls.map(call => call[0]).join('\n')
      expect(output).toContain(mockToken)
      expect(output).toContain('export VEAS_PAT=')
      expect(output).toContain('claude mcp add veas')

      consoleSpy.mockRestore()
    })

    it('should handle full access (*) scopes', async () => {
      mockAuthManager.isAuthenticated.mockResolvedValue(true)
      mockAuthManager.getToken.mockResolvedValue('test-cli-token')
      ;(prompts.text as any).mockResolvedValue('Full Access Token')
      ;(prompts.select as any).mockResolvedValue('*')
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'mya_fullaccess' }),
      })

      await createPAT()

      const fetchCall = (global.fetch as any).mock.calls[0]
      const body = JSON.parse(fetchCall[1].body)
      expect(body.scopes).toEqual(['*'])
    })

    it('should handle custom scopes', async () => {
      mockAuthManager.isAuthenticated.mockResolvedValue(true)
      mockAuthManager.getToken.mockResolvedValue('test-cli-token')
      ;(prompts.text as any).mockResolvedValue('Custom Token')
      ;(prompts.select as any).mockResolvedValue('custom')
      ;(prompts.text as any).mockResolvedValueOnce('Custom Token').mockResolvedValueOnce('read, write, admin')
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'mya_custom' }),
      })

      await createPAT()

      const fetchCall = (global.fetch as any).mock.calls[0]
      const body = JSON.parse(fetchCall[1].body)
      expect(body.scopes).toEqual(['read', 'write', 'admin'])
    })

    it('should exit if not authenticated', async () => {
      mockAuthManager.isAuthenticated.mockResolvedValue(false)

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit')
      })

      await expect(createPAT()).rejects.toThrow('process.exit')
      expect(exitSpy).toHaveBeenCalledWith(1)

      exitSpy.mockRestore()
    })

    it('should handle API errors', async () => {
      mockAuthManager.isAuthenticated.mockResolvedValue(true)
      mockAuthManager.getToken.mockResolvedValue('test-cli-token')
      ;(prompts.text as any).mockResolvedValue('Error Token')
      ;(prompts.select as any).mockResolvedValue('*')
      ;(global.fetch as any).mockResolvedValue({
        ok: false,
        text: async () => 'Internal Server Error',
      })

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit')
      })

      await expect(createPAT()).rejects.toThrow('process.exit')
      expect(exitSpy).toHaveBeenCalledWith(1)

      exitSpy.mockRestore()
    })
  })

  describe('listPATs', () => {
    it('should list PATs successfully', async () => {
      mockAuthManager.isAuthenticated.mockResolvedValue(true)
      mockAuthManager.getToken.mockResolvedValue('test-cli-token')

      const mockTokens = [
        {
          id: '1',
          name: 'Production Token',
          created_at: '2024-01-01T00:00:00Z',
          last_used_at: '2024-01-15T00:00:00Z',
        },
        {
          id: '2',
          name: 'Dev Token',
          created_at: '2024-01-02T00:00:00Z',
          last_used_at: null,
        },
      ]
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ tokens: mockTokens }),
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await listPATs()

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/cli/auth/pat', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-cli-token',
        },
      })

      const output = consoleSpy.mock.calls.map(call => call[0]).join('\n')
      expect(output).toContain('Production Token')
      expect(output).toContain('Dev Token')
      expect(output).toContain('Last used:')

      consoleSpy.mockRestore()
    })

    it('should handle empty token list', async () => {
      mockAuthManager.isAuthenticated.mockResolvedValue(true)
      mockAuthManager.getToken.mockResolvedValue('test-cli-token')
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ tokens: [] }),
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await listPATs()

      const output = consoleSpy.mock.calls.map(call => call[0]).join('\n')
      expect(output).toContain('Run "veas pat create" to create one')

      consoleSpy.mockRestore()
    })
  })
})
