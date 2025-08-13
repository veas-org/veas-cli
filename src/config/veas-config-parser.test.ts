import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VeasConfigParser } from './veas-config-parser'
import fs from 'fs/promises'
import * as fsSync from 'fs'
import path from 'path'
import yaml from 'js-yaml'

vi.mock('fs/promises')
vi.mock('fs')
vi.mock('js-yaml')
vi.mock('fast-glob', () => ({
  default: vi.fn().mockResolvedValue(['/project/docs/README.md', '/project/docs/guide.md'])
}))
vi.mock('../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

describe('VeasConfigParser', () => {
  let parser: VeasConfigParser
  const mockProjectDir = '/project'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(process, 'cwd').mockReturnValue(mockProjectDir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should use provided config path', () => {
      const parser = new VeasConfigParser('/custom/path/.veas-config.yaml')
      expect(parser['configPath']).toBe('/custom/path/.veas-config.yaml')
    })

    it('should find config file if not provided', () => {
      vi.mocked(fsSync.statSync).mockImplementation((path) => {
        if (path === '/project/.veas-config.yaml') {
          return { isFile: () => true } as any
        }
        throw new Error('File not found')
      })

      const parser = new VeasConfigParser()
      expect(parser['configPath']).toBe('/project/.veas-config.yaml')
    })

    it('should search up directory tree for config', () => {
      let callCount = 0
      vi.mocked(fsSync.statSync).mockImplementation((path) => {
        callCount++
        if (callCount === 3 && path === '/parent/.veas-config.yaml') {
          return { isFile: () => true } as any
        }
        throw new Error('File not found')
      })

      vi.spyOn(path, 'dirname')
        .mockReturnValueOnce('/parent/project')
        .mockReturnValueOnce('/parent')
        .mockReturnValueOnce('/')

      const parser = new VeasConfigParser()
      // Will find it in parent directory
    })
  })

  describe('load', () => {
    it('should load and parse YAML config', async () => {
      const mockConfig = {
        version: 1,
        publication: {
          name: 'Test Publication',
          slug: 'test-pub',
        },
        sync: {
          roots: [{
            path: './docs',
            include: ['**/*.md'],
          }],
        },
      }

      vi.mocked(fs.readFile).mockResolvedValue(yaml.dump(mockConfig))
      vi.mocked(yaml.load).mockReturnValue(mockConfig)

      const parser = new VeasConfigParser('/project/.veas-config.yaml')
      const config = await parser.load()

      expect(config).toMatchObject(mockConfig)
      expect(fs.readFile).toHaveBeenCalledWith('/project/.veas-config.yaml', 'utf8')
    })

    it('should merge with default configuration', async () => {
      const partialConfig = {
        version: 1,
        publication: {
          name: 'Test',
        },
      }

      vi.mocked(fs.readFile).mockResolvedValue(yaml.dump(partialConfig))
      vi.mocked(yaml.load).mockReturnValue(partialConfig)

      const parser = new VeasConfigParser('/project/.veas-config.yaml')
      const config = await parser.load()

      // Should have defaults for sync
      expect(config.sync).toBeDefined()
      expect(config.sync.metadata?.frontmatter).toBe(true)
      expect(config.sync.behavior?.missing_remote).toBe('create')
    })

    it('should create default config if file does not exist', async () => {
      const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException
      error.code = 'ENOENT'
      vi.mocked(fs.readFile).mockRejectedValue(error)

      const parser = new VeasConfigParser('/project/.veas-config.yaml')
      const config = await parser.load()

      // Should return default config
      expect(config.version).toBe(1)
      expect(config.sync).toBeDefined()
    })

    it('should validate configuration', async () => {
      const invalidConfig = {
        version: 2, // Unsupported version
        sync: {
          roots: [{
            path: './docs',
            include: ['**/*.md'],
          }],
        },
      }

      vi.mocked(fs.readFile).mockResolvedValue(yaml.dump(invalidConfig))
      vi.mocked(yaml.load).mockReturnValue(invalidConfig)

      const parser = new VeasConfigParser('/project/.veas-config.yaml')
      
      // Should throw error for unsupported version
      await expect(parser.load()).rejects.toThrow('Unsupported configuration version: 2')
    })
  })

  describe('save', () => {
    it('should save configuration to YAML file', async () => {
      const config = {
        version: 1,
        publication: {
          name: 'Test Publication',
        },
        sync: {
          roots: [{
            path: '.',
            include: ['**/*.md'],
          }],
        },
      }

      const yamlContent = 'version: 1\npublication:\n  name: Test Publication'
      vi.mocked(yaml.dump).mockReturnValue(yamlContent)

      const parser = new VeasConfigParser('/project/.veas-config.yaml')
      await parser.save(config)

      expect(yaml.dump).toHaveBeenCalledWith(config, expect.any(Object))
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/project/.veas-config.yaml',
        yamlContent,
        'utf8'
      )
    })
  })

  describe('getPublication', () => {
    it('should return publication config', async () => {
      const mockConfig = {
        version: 1,
        publication: {
          name: 'Test Pub',
          organization_id: 'org-123',
        },
        sync: {},
      }

      vi.mocked(fs.readFile).mockResolvedValue(yaml.dump(mockConfig))
      vi.mocked(yaml.load).mockReturnValue(mockConfig)

      const parser = new VeasConfigParser('/project/.veas-config.yaml')
      await parser.load()
      
      const publication = parser.getPublication()
      expect(publication).toEqual(mockConfig.publication)
    })

    it('should return undefined if no publication', async () => {
      const mockConfig = {
        version: 1,
        sync: {},
      }

      vi.mocked(fs.readFile).mockResolvedValue(yaml.dump(mockConfig))
      vi.mocked(yaml.load).mockReturnValue(mockConfig)

      const parser = new VeasConfigParser('/project/.veas-config.yaml')
      await parser.load()
      
      const publication = parser.getPublication()
      expect(publication).toBeUndefined()
    })
  })

  describe('getSyncConfig', () => {
    it('should return sync configuration', async () => {
      const mockConfig = {
        version: 1,
        sync: {
          roots: [{
            path: './docs',
            include: ['**/*.md'],
            exclude: ['**/draft-*'],
          }],
          metadata: {
            frontmatter: true,
          },
        },
      }

      vi.mocked(fs.readFile).mockResolvedValue(yaml.dump(mockConfig))
      vi.mocked(yaml.load).mockReturnValue(mockConfig)

      const parser = new VeasConfigParser('/project/.veas-config.yaml')
      await parser.load()
      
      const syncConfig = parser.getSyncConfig()
      // The config is merged with defaults, so check the key parts
      expect(syncConfig.roots).toEqual(mockConfig.sync.roots)
      expect(syncConfig.metadata?.frontmatter).toEqual(mockConfig.sync.metadata.frontmatter)
    })
  })

  describe('resolveGlobs', () => {
    it('should resolve glob patterns for roots', async () => {
      const mockConfig = {
        version: 1,
        sync: {
          roots: [{
            path: './docs',
            include: ['**/*.md', '**/*.mdx'],
            exclude: ['**/node_modules/**'],
          }],
        },
      }

      vi.mocked(fs.readFile).mockResolvedValue(yaml.dump(mockConfig))
      vi.mocked(yaml.load).mockReturnValue(mockConfig)

      const parser = new VeasConfigParser('/project/.veas-config.yaml')
      await parser.load()
      
      const globs = await parser.resolveGlobs()
      expect(globs).toBeDefined()
      expect(globs.length).toBe(2)
      expect(globs).toContain('/project/docs/README.md')
    })
  })

  describe('error handling', () => {
    it('should handle YAML parse errors', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid: yaml: content:')
      vi.mocked(yaml.load).mockImplementation(() => {
        throw new Error('YAML parse error')
      })

      const parser = new VeasConfigParser('/project/.veas-config.yaml')
      
      // Should throw error for YAML parse errors
      await expect(parser.load()).rejects.toThrow('Failed to load configuration: YAML parse error')
    })

    it('should handle file read errors', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'))

      const parser = new VeasConfigParser('/project/.veas-config.yaml')
      
      // Should throw error for permission errors
      await expect(parser.load()).rejects.toThrow('Failed to load configuration: Permission denied')
    })
  })

  describe('mergeWithDefaults', () => {
    it('should deep merge configurations', async () => {
      const userConfig = {
        sync: {
          metadata: {
            frontmatter: false,
          },
        },
      }

      vi.mocked(fs.readFile).mockResolvedValue(yaml.dump(userConfig))
      vi.mocked(yaml.load).mockReturnValue(userConfig)

      const parser = new VeasConfigParser('/project/.veas-config.yaml')
      const config = await parser.load()

      // User config should override default
      expect(config.sync.metadata?.frontmatter).toBe(false)
      // But other defaults should remain
      expect(config.sync.behavior?.missing_remote).toBe('create')
    })
  })
})