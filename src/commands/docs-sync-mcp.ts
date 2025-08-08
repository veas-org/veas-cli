import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'
import glob from 'fast-glob'
import { AuthManager } from '../auth/auth-manager.js'
import { VeasConfigParser } from '../config/veas-config-parser.js'
import type { VeasConfig, VeasConfigFolder } from '../config/veas-config-parser.js'
import { logger } from '../utils/logger.js'
import { confirm, text, spinner } from '@clack/prompts'
import pc from 'picocolors'
import { MCPClient } from '@veas/protocol'

interface DocsSyncOptions {
  watch?: boolean
  dryRun?: boolean
  force?: boolean
  folder?: string
  config?: string
}

interface FileInfo {
  path: string
  relativePath: string
  remoteFolder?: string
  content: string
  metadata: {
    title: string
    status?: string
    tags?: string[]
    [key: string]: any
  }
  hash: string
}

interface SyncResult {
  created: number
  updated: number
  archived: number
  skipped: number
  errors: string[]
}

export async function docsSync(options: DocsSyncOptions) {
  const authManager = AuthManager.getInstance()
  const session = await authManager.getSession()

  if (!session) {
    logger.error('Not logged in. Please run "veas login" first.')
    process.exit(1)
  }

  try {
    // Load configuration
    const configParser = new VeasConfigParser(options.config)
    const config = await configParser.load()

    // Initialize sync
    const syncer = new DocsSyncer(config, configParser, options, session)
    
    if (options.watch) {
      await syncer.watch()
    } else {
      await syncer.sync()
    }
  } catch (error) {
    logger.error(`Sync failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

class DocsSyncer {
  private config: VeasConfig
  private configParser: VeasConfigParser
  private options: DocsSyncOptions
  private session: any
  private publicationId?: string
  private remoteArticles: Map<string, any> = new Map()
  private localFiles: Map<string, FileInfo> = new Map()
  private folderIds: Map<string, string> = new Map()
  private mcpClient: MCPClient

  constructor(config: VeasConfig, configParser: VeasConfigParser, options: DocsSyncOptions, session: any) {
    this.config = config
    this.configParser = configParser
    this.options = options
    this.session = session
    
    // Initialize MCP client
    const mcpUrl = process.env.VEAS_MCP_URL || 'http://localhost:3000/api/mcp-manual'
    this.mcpClient = new MCPClient({
      endpoint: mcpUrl,
      headers: {
        'Authorization': `Bearer ${this.session.token}`
      }
    })
  }

  async sync(): Promise<SyncResult> {
    const s = spinner()
    s.start('Initializing docs sync...')

    try {
      // Ensure publication exists
      await this.ensurePublication()
      
      // Ensure folder structure
      await this.ensureFolders()
      
      // Collect local files
      s.message('Scanning local files...')
      await this.collectLocalFiles()
      
      // Fetch remote articles
      s.message('Fetching remote articles...')
      await this.fetchRemoteArticles()
      
      // Plan sync operations
      s.message('Planning sync operations...')
      const operations = await this.planOperations()
      
      if (this.options.dryRun) {
        s.stop('Dry run complete')
        await this.displayDryRunSummary(operations)
        return {
          created: operations.create.length,
          updated: operations.update.length,
          archived: operations.archive.length,
          skipped: operations.skip.length,
          errors: [],
        }
      }
      
      // Execute sync
      s.message('Syncing articles...')
      const result = await this.executeSync(operations)
      
      s.stop(`Sync complete: ${result.created} created, ${result.updated} updated, ${result.archived} archived`)
      
      if (result.errors.length > 0) {
        logger.warn('Sync completed with errors:')
        result.errors.forEach(err => logger.error(`  - ${err}`))
      }
      
      return result
    } catch (error) {
      s.stop('Sync failed')
      throw error
    }
  }

  async watch(): Promise<void> {
    logger.info('Starting watch mode...')
    
    // Initial sync
    await this.sync()
    
    // Set up file watcher
    const chokidar = await import('chokidar')
    const roots = this.configParser.getSyncRoots()
    const watchPaths = roots.map(r => r.absolutePath)
    
    const watcher = chokidar.watch(watchPaths, {
      ignored: this.config.sync.exclude || [],
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: this.config.sync.watch?.debounce || 1000,
        pollInterval: 100,
      },
    })
    
    let syncTimeout: NodeJS.Timeout | null = null
    const scheduleSync = () => {
      if (syncTimeout) clearTimeout(syncTimeout)
      syncTimeout = setTimeout(() => {
        logger.info('File changes detected, syncing...')
        this.sync().catch(err => logger.error('Sync error:', err))
      }, this.config.sync.watch?.debounce || 1000)
    }
    
    watcher
      .on('change', scheduleSync)
      .on('add', scheduleSync)
      .on('unlink', scheduleSync)
    
    logger.info('Watching for changes... (Press Ctrl+C to stop)')
    
    // Keep process alive
    process.on('SIGINT', () => {
      logger.info('Stopping watch mode...')
      watcher.close()
      process.exit(0)
    })
  }

  private async ensurePublication(): Promise<void> {
    // Check if publication name is provided
    if (!this.config.publication?.name) {
      const name = await text({
        message: 'Enter publication name:',
        placeholder: 'My Project Documentation',
        validate: (value) => {
          if (!value.trim()) return 'Publication name is required'
          return;
        },
      })
      
      if (typeof name === 'symbol') {
        throw new Error('Publication name is required')
      }
      
      this.config.publication = {
        ...this.config.publication,
        name: name as string,
      }
    }

    // List existing publications using MCP
    const result = await this.mcpClient.callTool('mcp__veas__mcp-articles_list_publications', {
      filters: {
        name_contains: this.config.publication.name
      },
      limit: 10
    })

    const publications = result.publications || []
    const exactMatch = publications.find((p: any) => p.name === this.config.publication!.name)

    if (exactMatch) {
      this.publicationId = exactMatch.id
      logger.info(`Using existing publication: ${exactMatch.name}`)
      return
    }

    // Ask to create new publication (skip if in non-interactive mode)
    let shouldCreate = true
    
    if (process.stdout.isTTY) {
      const confirmed = await confirm({
        message: `Publication "${this.config.publication.name}" not found. Create it?`,
      })
      
      if (typeof confirmed === 'symbol') {
        throw new Error('Publication creation cancelled')
      }
      
      shouldCreate = confirmed

      if (!shouldCreate) {
        throw new Error('Publication is required for sync')
      }
    } else {
      logger.info(`Publication "${this.config.publication.name}" not found. Creating it...`)
    }

    // Generate slug if not provided
    const slug = this.config.publication.slug || this.slugify(this.config.publication.name)

    // Create publication using MCP
    const newPublication = await this.mcpClient.callTool('mcp__veas__mcp-articles_create_publication', {
      name: this.config.publication.name,
      description: this.config.publication.description || null,
      slug,
      organization_id: this.config.publication.organization_id,
      is_active: true,
      is_public: true
    })

    this.publicationId = newPublication.id
    logger.info(`Created new publication: ${this.config.publication.name}`)
  }

  private async ensureFolders(): Promise<void> {
    // List existing folders using MCP
    const result = await this.mcpClient.callTool('mcp__veas__list_folders', {
      publication_id: this.publicationId,
      include_article_counts: false
    })

    const folders = result.folders || []
    const existingFolders = new Map<string, any>()
    for (const folder of folders) {
      existingFolders.set(folder.name, folder)
    }

    // Process folders from all roots
    const allFolders = new Map<string, VeasConfigFolder>()
    
    // Collect all unique folders from all roots
    const roots = this.configParser.getSyncRoots()
    for (const { root } of roots) {
      const folders = root.folders || this.config.sync.folders || []
      for (const folder of folders) {
        if (!allFolders.has(folder.remote)) {
          allFolders.set(folder.remote, folder)
        }
      }
    }

    // Add global folders if any
    if (this.config.sync.folders) {
      for (const folder of this.config.sync.folders) {
        if (!allFolders.has(folder.remote)) {
          allFolders.set(folder.remote, folder)
        }
      }
    }

    // Create missing folders
    for (const [remoteName, folderConfig] of allFolders) {
      const existing = existingFolders.get(remoteName)
      
      if (existing) {
        this.folderIds.set(remoteName, existing.id)
        logger.debug(`Using existing folder: ${remoteName}`)
      } else {
        try {
          const newFolder = await this.mcpClient.callTool('mcp__veas__create_folder', {
            publication_id: this.publicationId!,
            name: remoteName,
            description: folderConfig.description || null
          })

          this.folderIds.set(remoteName, newFolder.id)
          logger.info(`Created folder: ${remoteName}`)
        } catch (error: any) {
          logger.warn(`Failed to create folder "${remoteName}": ${error.message}`)
          continue
        }
      }
    }
  }

  private async collectLocalFiles(): Promise<void> {
    const roots = this.configParser.getSyncRoots()
    
    for (const { root, absolutePath } of roots) {
      const patterns = root.include || this.config.sync.include || ['**/*.md', '**/*.mdx']
      const excludePatterns = root.exclude || this.config.sync.exclude || []
      
      const files = await glob(patterns, {
        cwd: absolutePath,
        absolute: true,
        ignore: excludePatterns,
      })

      for (const filePath of files) {
        if (this.options.folder) {
          const relativePath = path.relative(absolutePath, filePath)
          const parts = relativePath.split(path.sep)
          if (parts[0] !== this.options.folder) {
            continue
          }
        }

        const content = await fs.readFile(filePath, 'utf8')
        const relativePath = path.relative(absolutePath, filePath)
        const metadata = this.extractMetadata(content, relativePath)
        const remoteFolder = this.configParser.getRemoteFolder(filePath, absolutePath, root)
        const hash = this.hashContent(content)
        
        // Create a unique key that includes the root path
        const uniqueKey = path.join(path.relative(process.cwd(), absolutePath), relativePath)

        this.localFiles.set(uniqueKey, {
          path: filePath,
          relativePath,
          remoteFolder,
          content,
          metadata,
          hash,
        })
      }
    }

    logger.debug(`Found ${this.localFiles.size} local files across ${roots.length} roots`)
  }

  private extractMetadata(content: string, relativePath: string): any {
    const metadata: any = {
      title: this.extractTitle(content, relativePath),
      ...this.config.sync.metadata?.defaults,
    }

    // Extract front matter if enabled
    if (this.config.sync.metadata?.frontmatter) {
      const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
      if (frontMatterMatch) {
        try {
          const yaml = require('js-yaml')
          const frontMatter = yaml.load(frontMatterMatch[1]) as any
          Object.assign(metadata, frontMatter)
        } catch (error) {
          logger.warn(`Failed to parse front matter in ${relativePath}`)
        }
      }
    }

    return metadata
  }

  private extractTitle(content: string, relativePath: string): string {
    // Try to extract from first H1
    const h1Match = content.match(/^#\s+(.+)$/m)
    if (h1Match && h1Match[1]) {
      return h1Match[1].trim()
    }

    // Use filename without extension
    const basename = path.basename(relativePath, path.extname(relativePath))
    return basename
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
  }

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  private async fetchRemoteArticles(): Promise<void> {
    const result = await this.mcpClient.callTool('mcp__veas__mcp-articles_list_articles', {
      filters: {
        publication_id: this.publicationId
      },
      limit: 1000 // TODO: Handle pagination
    })

    const articles = result.articles || []

    for (const article of articles) {
      // Store article by slug or title for matching
      const key = article.slug || article.title
      this.remoteArticles.set(key, article)
    }

    logger.debug(`Found ${this.remoteArticles.size} remote articles`)
  }

  private async planOperations(): Promise<{
    create: FileInfo[]
    update: Array<{ file: FileInfo; article: any }>
    archive: any[]
    skip: FileInfo[]
  }> {
    const operations = {
      create: [] as FileInfo[],
      update: [] as Array<{ file: FileInfo; article: any }>,
      archive: [] as any[],
      skip: [] as FileInfo[],
    }

    // Process local files
    for (const file of this.localFiles.values()) {
      const remoteKey = this.generateRemoteKey(file)
      const remoteArticle = this.remoteArticles.get(remoteKey)

      if (!remoteArticle) {
        // Article doesn't exist remotely
        if (this.config.sync.behavior?.missing_remote === 'skip') {
          operations.skip.push(file)
        } else if (this.config.sync.behavior?.missing_remote === 'warn') {
          logger.warn(`Local file has no remote article: ${file.relativePath}`)
          operations.skip.push(file)
        } else {
          operations.create.push(file)
        }
      } else {
        // Article exists remotely
        this.remoteArticles.delete(remoteKey) // Mark as processed

        if (this.options.force || this.config.sync.behavior?.update_strategy === 'always') {
          operations.update.push({ file, article: remoteArticle })
        } else if (this.config.sync.behavior?.update_strategy === 'never') {
          operations.skip.push(file)
        } else {
          // Check if content changed (simplified - in real implementation, compare actual content)
          if (this.hasContentChanged(file, remoteArticle)) {
            operations.update.push({ file, article: remoteArticle })
          } else {
            operations.skip.push(file)
          }
        }
      }
    }

    // Process remaining remote articles (exist remotely but not locally)
    for (const article of this.remoteArticles.values()) {
      if (this.config.sync.behavior?.missing_local === 'archive') {
        operations.archive.push(article)
      } else if (this.config.sync.behavior?.missing_local === 'delete') {
        // For safety, we'll archive instead of delete
        operations.archive.push(article)
      } else if (this.config.sync.behavior?.missing_local === 'warn') {
        logger.warn(`Remote article has no local file: ${article.title}`)
      }
    }

    return operations
  }

  private generateRemoteKey(file: FileInfo): string {
    // Generate a key for matching local files to remote articles
    return this.slugify(file.metadata.title)
  }

  private hasContentChanged(_file: FileInfo, _remoteArticle: any): boolean {
    // Simplified check - in real implementation, compare actual content
    // or store content hash in article metadata
    return true // Always assume changed for now
  }

  private async displayDryRunSummary(operations: any): Promise<void> {
    console.log('\n' + pc.bold('Dry Run Summary:'))
    console.log(pc.green(`  Create: ${operations.create.length} articles`))
    console.log(pc.yellow(`  Update: ${operations.update.length} articles`))
    console.log(pc.red(`  Archive: ${operations.archive.length} articles`))
    console.log(pc.gray(`  Skip: ${operations.skip.length} articles`))

    if (operations.create.length > 0) {
      console.log('\n' + pc.green('Articles to create:'))
      operations.create.forEach((file: FileInfo) => {
        console.log(`  - ${file.relativePath} → ${file.metadata.title}`)
      })
    }

    if (operations.update.length > 0) {
      console.log('\n' + pc.yellow('Articles to update:'))
      operations.update.forEach(({ file, article }: any) => {
        console.log(`  - ${file.relativePath} → ${article.title}`)
      })
    }

    if (operations.archive.length > 0) {
      console.log('\n' + pc.red('Articles to archive:'))
      operations.archive.forEach((article: any) => {
        console.log(`  - ${article.title}`)
      })
    }
  }

  private async executeSync(operations: any): Promise<SyncResult> {
    const result: SyncResult = {
      created: 0,
      updated: 0,
      archived: 0,
      skipped: operations.skip.length,
      errors: [],
    }

    // Create articles
    for (const file of operations.create) {
      try {
        const folderId = file.remoteFolder 
          ? this.folderIds.get(file.remoteFolder)
          : undefined

        const article = await this.mcpClient.callTool('mcp__veas__mcp-articles_create_article', {
          title: file.metadata.title,
          content: file.content,
          status: file.metadata.status || 'published',
          publication_id: this.publicationId!,
          folder_id: folderId || null
        })

        result.created++
        logger.debug(`Created: ${file.metadata.title}`)
        
        // Add tags if any
        if (file.metadata.tags && file.metadata.tags.length > 0 && article) {
          await this.addTagsToArticle(article.id, file.metadata.tags)
        }
      } catch (error: any) {
        result.errors.push(`Failed to create ${file.relativePath}: ${error.message}`)
      }
    }

    // Update articles
    for (const { file, article } of operations.update) {
      try {
        const updateData: any = {
          title: file.metadata.title,
          content: file.content,
          status: file.metadata.status,
        }

        // Preserve remote metadata if configured
        if (this.config.sync.behavior?.preserve_remote) {
          for (const field of this.config.sync.behavior.preserve_remote) {
            delete updateData[field]
          }
        }

        await this.mcpClient.callTool('mcp__veas__mcp-articles_update_article', {
          article_id: article.id,
          ...updateData
        })

        result.updated++
        logger.debug(`Updated: ${file.metadata.title}`)
      } catch (error: any) {
        result.errors.push(`Error updating ${file.relativePath}: ${error.message}`)
      }
    }

    // Archive articles
    for (const article of operations.archive) {
      try {
        await this.mcpClient.callTool('mcp__veas__mcp-articles_update_article', {
          article_id: article.id,
          status: 'archived'
        })

        result.archived++
        logger.debug(`Archived: ${article.title}`)
      } catch (error: any) {
        result.errors.push(`Error archiving ${article.title}: ${error.message}`)
      }
    }

    return result
  }

  private async addTagsToArticle(articleId: string, tagNames: string[]): Promise<void> {
    try {
      // First create tags if they don't exist
      for (const tagName of tagNames) {
        try {
          const existingTags = await this.mcpClient.callTool('mcp__veas__search_tags', {
            search_term: tagName,
            filters: {
              publication_id: this.publicationId
            }
          })

          if (!existingTags.tags || existingTags.tags.length === 0) {
            await this.mcpClient.callTool('mcp__veas__create_tag', {
              data: {
                name: tagName,
                publication_id: this.publicationId
              }
            })
          }
        } catch (error) {
          // Tag might already exist, continue
        }
      }

      // Get all tag IDs
      const tagIds: string[] = []
      for (const tagName of tagNames) {
        const tags = await this.mcpClient.callTool('mcp__veas__list_tags', {
          filters: {
            name_contains: tagName,
            publication_id: this.publicationId
          }
        })
        const tag = tags.tags?.find((t: any) => t.name === tagName)
        if (tag) {
          tagIds.push(tag.id)
        }
      }

      // Add tags to article
      if (tagIds.length > 0) {
        await this.mcpClient.callTool('mcp__veas__mcp-articles_add_article_tags', {
          article_id: articleId,
          tag_ids: tagIds
        })
      }
    } catch (error: any) {
      logger.warn(`Failed to add tags to article: ${error.message}`)
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }
}