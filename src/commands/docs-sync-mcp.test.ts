import path from 'node:path'
import * as prompts from '@clack/prompts'
import fg from 'fast-glob'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthManager } from '../auth/auth-manager'
import { VeasConfigParser } from '../config/veas-config-parser'
import { logger } from '../utils/logger'
import { docsSync } from './docs-sync-mcp'

vi.mock('../auth/auth-manager')
vi.mock('@clack/prompts')
vi.mock('../utils/logger')
vi.mock('fs-extra')
vi.mock('fast-glob')
vi.mock('../config/veas-config-parser')

// Mock MCPClient before importing the module that uses it
const mockMCPClient = {
  callTool: vi.fn(),
  callToolSafe: vi.fn(),
  listTools: vi.fn().mockResolvedValue([]),
  initialize: vi.fn().mockResolvedValue(undefined),
}

vi.mock('../mcp/mcp-client', () => ({
  MCPClient: {
    getInstance: vi.fn(() => mockMCPClient),
  },
}))

// Mock process.exit to not actually exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation(code => {
  throw new Error(`process.exit(${code})`)
})

describe('DocsSync Command', () => {
  let mockAuthManager: any
  let mockSpinner: any
  let consoleLogSpy: any
  let mockConfigParser: any

  beforeEach(() => {
    vi.clearAllMocks()

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Mock stdout.isTTY
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    })

    mockAuthManager = {
      getSession: vi.fn().mockResolvedValue({
        token: 'test-token',
        user: { id: 'test-user', email: 'test@example.com' },
      }),
    }
    vi.mocked(AuthManager).getInstance.mockReturnValue(mockAuthManager)

    // Mock VeasConfigParser
    const mockConfig = {
      version: 1,
      publication: {
        name: 'Test Publication',
        slug: 'test-pub',
      },
      sync: {
        roots: [
          {
            path: './docs',
            include: ['**/*.md'],
          },
        ],
      },
    }

    mockConfigParser = {
      load: vi.fn().mockResolvedValue(mockConfig),
      getSyncRoots: vi.fn().mockReturnValue([
        {
          root: { path: './docs', include: ['**/*.md'] },
          absolutePath: '/project/docs',
        },
      ]),
      getSyncConfig: vi.fn().mockReturnValue(mockConfig.sync),
      getPublication: vi.fn().mockReturnValue(mockConfig.publication),
      shouldIncludeFile: vi.fn().mockReturnValue(true),
      getRemoteFolder: vi.fn().mockReturnValue(undefined),
      configPath: '/project/.veas-config.yaml',
    }

    vi.mocked(VeasConfigParser).mockImplementation(() => mockConfigParser)

    // Reset MCPClient mocks
    mockMCPClient.callTool.mockReset()
    mockMCPClient.callToolSafe.mockReset()
    mockMCPClient.listTools.mockReset()
    mockMCPClient.initialize.mockReset()
    mockMCPClient.listTools.mockResolvedValue([])
    mockMCPClient.initialize.mockResolvedValue(undefined)

    // Set up default successful responses for common MCP calls
    mockMCPClient.callToolSafe.mockImplementation((toolName, params) => {
      // Return appropriate data for specific tools
      if (toolName === 'mcp-articles_list_publications') {
        return Promise.resolve({
          success: true,
          data: {
            publications: [
              {
                id: 'pub-123',
                name: 'Test Publication',
                slug: 'test-pub',
              },
            ],
            total: 1,
          },
        })
      }
      if (toolName === 'list_folders') {
        return Promise.resolve({
          success: true,
          data: {
            folders: [],
            total: 0,
          },
        })
      }
      if (toolName === 'mcp-articles_list_articles') {
        return Promise.resolve({
          success: true,
          data: {
            articles: [],
            total: 0,
          },
        })
      }
      // Default successful response for any unexpected calls
      return Promise.resolve({
        success: true,
        data: {},
      })
    })

    mockSpinner = {
      start: vi.fn(),
      stop: vi.fn(),
      message: vi.fn(),
    }
    vi.mocked(prompts.spinner).mockReturnValue(mockSpinner)

    // Mock logger
    vi.mocked(logger.info).mockImplementation(() => {})
    vi.mocked(logger.error).mockImplementation(() => {})
    vi.mocked(logger.warn).mockImplementation(() => {})
    vi.mocked(logger.debug).mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('docsSync', () => {
    const mockFiles = [
      '/project/docs/README.md',
      '/project/docs/api/endpoints.md',
      '/project/docs/guides/getting-started.md',
    ]

    beforeEach(() => {
      vi.mocked(fg).mockResolvedValue(mockFiles)
      vi.mocked(fs.readFile).mockImplementation(filePath => {
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
      // Reset and set up specific mock implementation
      mockMCPClient.callToolSafe.mockReset()
      mockMCPClient.callToolSafe.mockImplementation(toolName => {
        if (toolName === 'mcp-articles_list_publications') {
          return Promise.resolve({
            success: true,
            data: {
              publications: [
                {
                  id: 'pub-123',
                  name: 'Test Publication',
                  slug: 'test-pub',
                },
              ],
              total: 1,
            },
          })
        }
        if (toolName === 'list_folders') {
          return Promise.resolve({
            success: true,
            data: {
              folders: [],
              total: 0,
            },
          })
        }
        if (toolName === 'mcp-articles_list_articles') {
          return Promise.resolve({
            success: true,
            data: {
              articles: [],
              total: 0,
            },
          })
        }
        // Default response for any other tool
        return Promise.resolve({
          success: true,
          data: {},
        })
      })

      await docsSync({
        folder: './docs',
        dryRun: true,
      })

      expect(mockSpinner.start).toHaveBeenCalledWith('Initializing docs sync...')
      expect(mockSpinner.stop).toHaveBeenCalledWith('Dry run complete')
      expect(mockMCPClient.callToolSafe).toHaveBeenCalled()
    })

    it('should handle folder not found', async () => {
      vi.mocked(fg).mockResolvedValue([])

      // Use default mock which returns success for all calls
      await docsSync({
        folder: './non-existent',
      })

      expect(mockSpinner.stop).toHaveBeenCalled()
    })

    it.skip('should handle errors gracefully', async () => {
      mockMCPClient.callToolSafe.mockReset()
      // First call will fail with API Error
      mockMCPClient.callToolSafe.mockResolvedValueOnce({
        success: false,
        error: 'API Error',
      })

      await expect(
        docsSync({
          folder: './docs',
        }),
      ).rejects.toThrow('process.exit(1)')

      // Check that any error was logged
      expect(logger.error).toHaveBeenCalled()
    })

    it.skip('should handle missing session', async () => {
      mockAuthManager.getSession.mockResolvedValueOnce(null)

      await expect(
        docsSync({
          folder: './docs',
        }),
      ).rejects.toThrow('process.exit(1)')

      expect(logger.error).toHaveBeenCalledWith('Not logged in. Please run "veas login" first.')
    })

    it('should use default folder if not specified', async () => {
      vi.mocked(fg).mockResolvedValue([])

      // Use default mock which returns success for all calls
      await docsSync({})

      expect(VeasConfigParser).toHaveBeenCalledWith(undefined)
    })

    it.skip('should handle config file errors', async () => {
      mockConfigParser.load.mockRejectedValueOnce(new Error('Config parse error'))

      await expect(
        docsSync({
          folder: './docs',
        }),
      ).rejects.toThrow('process.exit(1)')

      expect(logger.error).toHaveBeenCalledWith('Sync failed: Config parse error')
    })

    it.skip('should handle watch mode', async () => {
      const mockWatcher = {
        on: vi.fn().mockReturnThis(),
        close: vi.fn(),
      }

      vi.doMock('chokidar', () => ({
        watch: vi.fn().mockReturnValue(mockWatcher),
      }))

      // Mock the MCP tool calls
      mockMCPClient.callTool
        .mockResolvedValueOnce({
          // mcp-articles_list_publications
          success: true,
          data: {
            publications: [
              {
                id: 'pub-123',
                name: 'Test Publication',
                slug: 'test-pub',
              },
            ],
            total: 1,
          },
        })
        .mockResolvedValueOnce({
          // list_folders
          success: true,
          data: {
            folders: [],
            total: 0,
          },
        })
        .mockResolvedValueOnce({
          // list articles
          success: true,
          data: {
            articles: [],
            total: 0,
          },
        })

      // This will start watch mode, but we can't test it fully without async control
      const syncPromise = docsSync({
        folder: './docs',
        watch: true,
      })

      // Since watch mode runs indefinitely, we just check that it started
      expect(syncPromise).toBeDefined()
    })

    it('should handle force mode', async () => {
      // Use default mock which returns success for all calls
      await docsSync({
        folder: './docs',
        force: true,
      })

      expect(mockSpinner.start).toHaveBeenCalled()
    })

    it('should process files without TTY', async () => {
      // Set TTY to false
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      })

      // Use default mock which returns success for all calls
      await docsSync({
        folder: './docs',
        dryRun: true,
      })

      // Should use logger instead of spinner
      expect(logger.info).toHaveBeenCalledWith('Initializing docs sync...')
      expect(mockSpinner.start).not.toHaveBeenCalled()
    })
  })
})
