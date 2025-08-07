import * as fs from 'fs/promises'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { logger } from '../utils/logger.js'

export interface VeasConfigFolder {
  local: string
  remote: string
  description?: string
  tags?: string[]
}

export interface VeasConfigPublication {
  name: string
  description?: string
  slug?: string
  organization_id?: string
  organization_slug?: string
  tags?: string[]
}

export interface VeasConfigSyncMetadata {
  frontmatter: boolean
  defaults?: {
    status?: 'draft' | 'published' | 'archived'
    tags?: string[]
  }
}

export interface VeasConfigSyncBehavior {
  missing_remote?: 'create' | 'skip' | 'warn'
  missing_local?: 'archive' | 'delete' | 'skip' | 'warn'
  update_strategy?: 'always' | 'modified' | 'never'
  preserve_remote?: string[]
}

export interface VeasConfigSyncWatch {
  enabled?: boolean
  debounce?: number
}

export interface VeasConfigSyncRoot {
  path: string
  include?: string[]
  exclude?: string[]
  folders?: VeasConfigFolder[]
  tags?: string[]
}

export interface VeasConfigSync {
  roots?: VeasConfigSyncRoot[]
  include?: string[]
  exclude?: string[]
  folders?: VeasConfigFolder[]
  metadata?: VeasConfigSyncMetadata
  watch?: VeasConfigSyncWatch
  behavior?: VeasConfigSyncBehavior
}

export interface VeasConfig {
  version: number
  publication?: VeasConfigPublication
  sync: VeasConfigSync
}

const DEFAULT_CONFIG: Partial<VeasConfig> = {
  version: 1,
  sync: {
    roots: [{
      path: '.',
      include: ['**/*.md', '**/*.mdx'],
      exclude: ['**/node_modules/**', '**/.git/**', '**/draft-*'],
    }],
    include: ['**/*.md', '**/*.mdx'],
    exclude: ['**/node_modules/**', '**/.git/**', '**/draft-*'],
    metadata: {
      frontmatter: true,
      defaults: {
        status: 'published',
        tags: ['documentation'],
      },
    },
    watch: {
      enabled: false,
      debounce: 1000,
    },
    behavior: {
      missing_remote: 'create',
      missing_local: 'archive',
      update_strategy: 'modified',
      preserve_remote: ['views_count', 'rating', 'comments'],
    },
  },
}

export class VeasConfigParser {
  private configPath: string
  private config?: VeasConfig

  constructor(configPath?: string) {
    // If no config path provided, search for it
    if (!configPath) {
      configPath = this.findConfigFile()
    }
    this.configPath = configPath
  }

  /**
   * Find the config file by searching up the directory tree
   */
  private findConfigFile(): string {
    const configFileName = '.veas-config.yaml'
    let currentDir = process.cwd()
    
    // Search up the directory tree
    while (currentDir !== path.dirname(currentDir)) {
      const candidatePath = path.join(currentDir, configFileName)
      try {
        // Check if file exists
        const stats = require('fs').statSync(candidatePath)
        if (stats.isFile()) {
          logger.debug(`Found config file at: ${candidatePath}`)
          return candidatePath
        }
      } catch (e) {
        // File doesn't exist, continue searching
      }
      currentDir = path.dirname(currentDir)
    }
    
    // If not found, use current directory
    return path.join(process.cwd(), configFileName)
  }

  /**
   * Load and parse the configuration file
   */
  async load(): Promise<VeasConfig> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf8')
      const rawConfig = yaml.load(configContent) as Partial<VeasConfig>
      
      // Merge with defaults
      this.config = this.mergeWithDefaults(rawConfig)
      
      // Validate configuration
      this.validateConfig(this.config)
      
      logger.debug('Configuration loaded successfully', this.config)
      return this.config
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn(`Configuration file not found at ${this.configPath}`)
        logger.info('Using default configuration')
        this.config = DEFAULT_CONFIG as VeasConfig
        return this.config
      }
      
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Merge user configuration with defaults
   */
  private mergeWithDefaults(userConfig: Partial<VeasConfig>): VeasConfig {
    // Handle legacy root config
    let roots = userConfig.sync?.roots
    if (!roots && (userConfig.sync as any)?.root) {
      // Convert legacy single root to roots array
      roots = [{
        path: (userConfig.sync as any).root,
        include: userConfig.sync?.include,
        exclude: userConfig.sync?.exclude,
        folders: userConfig.sync?.folders,
      }]
    }

    const merged: VeasConfig = {
      version: userConfig.version || DEFAULT_CONFIG.version!,
      publication: userConfig.publication,
      sync: {
        ...DEFAULT_CONFIG.sync!,
        ...userConfig.sync,
        roots: roots || DEFAULT_CONFIG.sync?.roots,
        metadata: userConfig.sync?.metadata ? {
          ...DEFAULT_CONFIG.sync?.metadata,
          ...userConfig.sync.metadata,
          defaults: {
            ...DEFAULT_CONFIG.sync?.metadata?.defaults,
            ...userConfig.sync.metadata?.defaults,
          },
        } : DEFAULT_CONFIG.sync?.metadata!,
        watch: {
          ...DEFAULT_CONFIG.sync?.watch,
          ...userConfig.sync?.watch,
        },
        behavior: {
          ...DEFAULT_CONFIG.sync?.behavior,
          ...userConfig.sync?.behavior,
        },
      },
    }

    // If user provides global folders/include/exclude, apply to all roots
    if (userConfig.sync?.folders && !roots) {
      merged.sync.folders = userConfig.sync.folders
    }
    if (userConfig.sync?.include && !roots) {
      merged.sync.include = userConfig.sync.include
    }
    if (userConfig.sync?.exclude && !roots) {
      merged.sync.exclude = userConfig.sync.exclude
    }

    return merged
  }

  /**
   * Validate the configuration
   */
  private validateConfig(config: VeasConfig): void {
    if (config.version !== 1) {
      throw new Error(`Unsupported configuration version: ${config.version}`)
    }

    if (!config.sync.roots || config.sync.roots.length === 0) {
      throw new Error('At least one sync root is required in configuration')
    }

    // Validate each root
    for (const root of config.sync.roots) {
      if (!root.path) {
        throw new Error('Each sync root must have a path')
      }
    }

    // Validate folder mappings
    if (config.sync.folders) {
      for (const folder of config.sync.folders) {
        if (!folder.local || !folder.remote) {
          throw new Error('Each folder mapping must have both "local" and "remote" fields')
        }
      }
    }

    // Validate behavior options
    const validBehaviors = {
      missing_remote: ['create', 'skip', 'warn'],
      missing_local: ['archive', 'delete', 'skip', 'warn'],
      update_strategy: ['always', 'modified', 'never'],
    }

    if (config.sync.behavior) {
      for (const [key, validValues] of Object.entries(validBehaviors)) {
        const value = config.sync.behavior[key as keyof VeasConfigSyncBehavior]
        if (value && !validValues.includes(value as string)) {
          throw new Error(`Invalid ${key}: ${value}. Must be one of: ${validValues.join(', ')}`)
        }
      }
    }
  }

  /**
   * Get all sync roots with absolute paths
   */
  getSyncRoots(): Array<{ root: VeasConfigSyncRoot; absolutePath: string }> {
    if (!this.config) {
      throw new Error('Configuration not loaded')
    }

    const configDir = path.dirname(this.configPath)
    return (this.config.sync.roots || []).map(root => ({
      root,
      absolutePath: path.resolve(configDir, root.path),
    }))
  }

  /**
   * Get the configuration
   */
  getConfig(): VeasConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded')
    }
    return this.config
  }

  /**
   * Check if a file path should be included based on include/exclude patterns
   */
  shouldIncludeFile(filePath: string, rootPath: string): boolean {
    if (!this.config) {
      throw new Error('Configuration not loaded')
    }

    const relativePath = path.relative(rootPath, filePath)

    // Check exclude patterns first
    if (this.config.sync.exclude) {
      for (const pattern of this.config.sync.exclude) {
        if (this.matchesPattern(relativePath, pattern)) {
          return false
        }
      }
    }

    // Check include patterns
    if (this.config.sync.include) {
      for (const pattern of this.config.sync.include) {
        if (this.matchesPattern(relativePath, pattern)) {
          return true
        }
      }
    }

    // If no include patterns, include by default
    return !this.config.sync.include || this.config.sync.include.length === 0
  }

  /**
   * Simple glob pattern matching
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regex = pattern
      .replace(/\*\*/g, '{{DOUBLE_STAR}}')
      .replace(/\*/g, '{{SINGLE_STAR}}')
      .replace(/{{DOUBLE_STAR}}/g, '.*')
      .replace(/{{SINGLE_STAR}}/g, '[^/]*')
      .replace(/\?/g, '.')

    return new RegExp(`^${regex}$`).test(filePath)
  }

  /**
   * Get the remote folder for a local path
   */
  getRemoteFolder(localPath: string, rootPath: string, rootConfig: VeasConfigSyncRoot): string | undefined {
    const folders = rootConfig.folders || this.config?.sync.folders
    if (!folders) {
      return undefined
    }

    const relativePath = path.relative(rootPath, localPath)
    const parts = relativePath.split(path.sep)

    for (const folder of folders) {
      if (parts[0] === folder.local) {
        return folder.remote
      }
    }

    return undefined
  }

  /**
   * Create a sample configuration file
   */
  static async createSampleConfig(targetPath?: string): Promise<void> {
    const configPath = targetPath || path.join(process.cwd(), '.veas-config.yaml')
    
    const sampleConfig = `# Veas Documentation Sync Configuration
version: 1

# Publication settings (optional - will prompt if not provided)
publication:
  name: "My Project Documentation"
  description: "Official documentation for My Project"
  # subdomain: "my-project-docs"  # Optional, auto-generated from name
  # organization_id: "org-uuid"    # Optional, uses default org
  
  # Tags applied to all articles in this publication
  tags: ["documentation", "official"]

# Sync configuration
sync:
  # Multiple root directories (relative to this config file)
  # By default, current directory is used
  roots:
    - path: "./docs"
      # File patterns specific to this root
      include:
        - "**/*.md"
        - "**/*.mdx"
      exclude:
        - "**/node_modules/**"
        - "**/.git/**"
        - "**/draft-*"
      
      # Tags applied to all articles in this root
      tags: ["docs"]
      
      # Folder mappings for this root
      folders:
        - local: "getting-started"
          remote: "Getting Started"
          description: "Quick start guides and tutorials"
          # Tags applied to all articles in this folder
          tags: ["tutorial", "beginner"]
        
        - local: "api"
          remote: "API Reference"
          description: "API documentation"
          tags: ["api", "reference"]
    
    # You can add more roots
    # - path: "./packages"
    #   include:
    #     - "*/README.md"
    #     - "*/docs/**/*.md"
    #   tags: ["packages"]
    #   folders:
    #     - local: "."
    #       remote: "Package Documentation"
    #       tags: ["package"]
  
  # Global settings (applies to all roots if not overridden)
  # include:
  #   - "**/*.md"
  #   - "**/*.mdx"
  # exclude:
  #   - "**/node_modules/**"
  #   - "**/.git/**"
  
  # Metadata extraction
  metadata:
    # Extract front matter from markdown files
    frontmatter: true
    
    # Default values for articles
    defaults:
      status: "published"  # draft, published, archived
      tags: ["documentation"]
    
    # Note: Tags can be specified at multiple levels and are combined:
    # 1. Publication-level tags (applied to all articles)
    # 2. Root-level tags (applied to all articles in that root)
    # 3. Folder-level tags (applied to all articles in that folder)
    # 4. File-level tags (from frontmatter, e.g., tags: ["guide", "advanced"])
    # All tags are merged together, with no duplicates
  
  # Watch mode settings
  watch:
    enabled: false
    debounce: 1000  # milliseconds
    
  # Sync behavior
  behavior:
    # What to do with articles that exist locally but not in Veas
    missing_remote: "create"  # create, skip, warn
    
    # What to do with articles that exist in Veas but not locally
    missing_local: "archive"  # archive, delete, skip, warn
    
    # Update strategy
    update_strategy: "modified"  # always, modified, never
    
    # Preserve remote metadata
    preserve_remote:
      - "views_count"
      - "rating"
      - "comments"
`

    await fs.writeFile(configPath, sampleConfig, 'utf8')
    logger.info(`Created sample configuration file at ${configPath}`)
  }
}