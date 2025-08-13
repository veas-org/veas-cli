import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { docsSync } from './docs-sync-mcp'
import { AuthManager } from '../auth/auth-manager'
import * as prompts from '@clack/prompts'
import { logger } from '../utils/logger'
import fs from 'fs-extra'
import path from 'path'
import fg from 'fast-glob'

vi.mock('../auth/auth-manager')
vi.mock('@clack/prompts')
vi.mock('../utils/logger')
vi.mock('fs-extra')
vi.mock('fast-glob')

global.fetch = vi.fn()

describe('DocsSync Command', () => {
  let mockAuthManager: any
  let mockSpinner: any
  let consoleLogSpy: any
  let processExitSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    mockAuthManager = {
      ensureAuthenticated: vi.fn(),
      getCredentials: vi.fn().mockResolvedValue({
        token: 'test-token',
        user: { id: 'test-user', email: 'test@example.com' }
      }),
      getSession: vi.fn().mockResolvedValue({
        token: 'test-token',
        user: { id: 'test-user', email: 'test@example.com' }
      }),
    }
    vi.mocked(AuthManager).getInstance.mockReturnValue(mockAuthManager)

    mockSpinner = {
      start: vi.fn(),
      stop: vi.fn(),
      message: vi.fn(),
    }
    vi.mocked(prompts.spinner).mockReturnValue(mockSpinner)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('docsSync', () => {
    const mockFiles = [
      'docs/README.md',
      'docs/api/endpoints.md',
      'docs/guides/getting-started.md',
    ]

    beforeEach(() => {
      vi.mocked(fg).mockResolvedValue(mockFiles)
      vi.mocked(fs.readFile).mockImplementation((filePath) => {
        const name = path.basename(filePath as string)
        return Promise.resolve(`# ${name}\n\nContent for ${name}`)
      })
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        size: 1024,
        mtime: new Date('2024-01-01'),
      } as any)
    })

    it('should sync documents successfully in dry run mode', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      const mockResponse = {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'success',
                articlesCreated: 2,
                articlesUpdated: 1,
                articlesSkipped: 0,
              }),
            },
          ],
        },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await docsSync({
        folder: './docs',
        publicationId: 'pub-123',
        dryRun: true,
        verbose: false,
      })

      expect(mockSpinner.start).toHaveBeenCalledWith(expect.stringContaining('Scanning'))
      expect(mockSpinner.message).toHaveBeenCalledWith(expect.stringContaining('Found 3 markdown files'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Created: 2'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Updated: 1'))
    })

    it('should handle folder not found', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(fg).mockResolvedValue([])

      await docsSync({
        folder: './non-existent',
        publicationId: 'pub-123',
      })

      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('No markdown files found'))
    })

    it('should handle verbose mode', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      const mockResponse = {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'success',
                articlesCreated: 1,
                details: [
                  { file: 'README.md', action: 'created', id: 'article-123' },
                ],
              }),
            },
          ],
        },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await docsSync({
        folder: './docs',
        publicationId: 'pub-123',
        verbose: true,
      })

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Processing:'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('README.md'))
      expect(logger.debug).toHaveBeenCalled()
    })

    it('should handle API errors', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      const mockError = {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Publication not found',
        },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockError,
      } as Response)

      await expect(docsSync({
        folder: './docs',
        publicationId: 'invalid-pub',
      })).rejects.toThrow('process.exit')

      expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining('Failed'))
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Publication not found'))
    })

    it('should handle file read errors', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('Permission denied'))

      await expect(docsSync({
        folder: './docs',
        publicationId: 'pub-123',
      })).rejects.toThrow('process.exit')

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Permission denied'))
    })

    it('should use default folder if not specified', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(fg).mockResolvedValue([])

      await docsSync({
        publicationId: 'pub-123',
      })

      expect(fg).toHaveBeenCalledWith(
        expect.stringContaining('**/*.md'),
        expect.objectContaining({
          cwd: process.cwd(),
        })
      )
    })

    it('should exclude ignored patterns', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      await docsSync({
        folder: './docs',
        publicationId: 'pub-123',
      })

      expect(fg).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ignore: expect.arrayContaining(['**/node_modules/**', '**/.git/**']),
        })
      )
    })

    it('should handle empty file content', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(fs.readFile).mockResolvedValueOnce('')

      const mockResponse = {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'success',
                articlesSkipped: 1,
                skippedReasons: ['Empty file: README.md'],
              }),
            },
          ],
        },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await docsSync({
        folder: './docs',
        publicationId: 'pub-123',
      })

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Skipped: 1'))
    })

    it('should process files in batches', async () => {
      const manyFiles = Array.from({ length: 50 }, (_, i) => `docs/file${i}.md`)
      vi.mocked(fg).mockResolvedValue(manyFiles)

      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      const mockResponse = {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'success',
                articlesCreated: 50,
              }),
            },
          ],
        },
      }

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await docsSync({
        folder: './docs',
        publicationId: 'pub-123',
      })

      expect(mockSpinner.message).toHaveBeenCalledWith(expect.stringContaining('Found 50 markdown files'))
      // Should batch process, check multiple fetch calls
      expect(global.fetch).toHaveBeenCalled()
    })

    it('should respect publication ID from environment', async () => {
      const originalEnv = process.env.VEAS_PUBLICATION_ID
      process.env.VEAS_PUBLICATION_ID = 'env-pub-id'

      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: { content: [{ type: 'text', text: '{"status":"success"}' }] },
        }),
      } as Response)

      await docsSync({
        folder: './docs',
      })

      const callArg = vi.mocked(global.fetch).mock.calls[0][1]
      const body = JSON.parse(callArg.body)
      
      expect(body.params.arguments.publicationId).toBe('env-pub-id')

      process.env.VEAS_PUBLICATION_ID = originalEnv
    })

    it('should handle network timeouts', async () => {
      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      const timeoutError = new Error('Request timeout')
      timeoutError.name = 'AbortError'
      vi.mocked(global.fetch).mockRejectedValueOnce(timeoutError)

      await expect(docsSync({
        folder: './docs',
        publicationId: 'pub-123',
      })).rejects.toThrow('process.exit')

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('timeout'))
    })

    it('should create folder structure in publication', async () => {
      const nestedFiles = [
        'docs/api/v1/users.md',
        'docs/api/v1/projects.md',
        'docs/api/v2/users.md',
        'docs/guides/quickstart.md',
      ]
      vi.mocked(fg).mockResolvedValue(nestedFiles)

      mockAuthManager.ensureAuthenticated.mockResolvedValue({
        accessToken: 'test-token',
      })

      const mockResponse = {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'success',
                foldersCreated: ['api', 'api/v1', 'api/v2', 'guides'],
                articlesCreated: 4,
              }),
            },
          ],
        },
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await docsSync({
        folder: './docs',
        publicationId: 'pub-123',
        preserveStructure: true,
      })

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Folders created'))
    })
  })
})