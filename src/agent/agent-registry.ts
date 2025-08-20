/**
 * Agent Registry
 * 
 * Manages agent registration and heartbeat with the platform
 */

import { createClient } from '@supabase/supabase-js'
import { hostname, platform, arch, cpus, totalmem, freemem } from 'node:os'
import { createHash, randomBytes } from 'node:crypto'
import type { AgentConfig, AgentDestination, HeartbeatData } from './types.js'
import { logger } from '../utils/logger.js'

export class AgentRegistry {
  private supabase: any
  private config: AgentConfig
  private destinationId: string | null = null
  private apiKeyHash: string | null = null
  private heartbeatInterval: NodeJS.Timeout | null = null
  private isRegistered = false

  constructor(config: AgentConfig) {
    this.config = config

    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error('Supabase URL and anon key are required for agent registry')
    }

    this.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  }

  /**
   * Generate a unique machine ID
   */
  private generateMachineId(): string {
    const data = [
      hostname(),
      platform(),
      arch(),
      cpus()[0]?.model || 'unknown',
      process.env.USER || process.env.USERNAME || 'unknown'
    ].join(':')
    
    return createHash('sha256').update(data).digest('hex').substring(0, 16)
  }

  /**
   * Generate API key for this destination
   */
  private generateApiKey(): string {
    return randomBytes(32).toString('hex')
  }

  /**
   * Hash API key for storage
   */
  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex')
  }

  /**
   * Get system capabilities
   */
  private getCapabilities(): Record<string, any> {
    return {
      platform: platform(),
      arch: arch(),
      cpus: cpus().length,
      totalMemoryMb: Math.floor(totalmem() / 1024 / 1024),
      nodeVersion: process.version,
      cliVersion: '1.0.10' // TODO: Get from package.json
    }
  }

  /**
   * Get supported MCP tools
   */
  private getSupportedTools(): string[] {
    // TODO: Dynamically get from tools registry
    return [
      'list_my_projects',
      'get_project',
      'create_issue',
      'update_issue',
      'list_my_issues',
      'get_issue',
      'create_article',
      'update_article',
      'list_articles',
      'get_article'
    ]
  }

  /**
   * Register this agent with the platform
   */
  async register(): Promise<string> {
    logger.info('Registering agent with platform...')

    try {
      const apiKey = this.config.apiKey || this.generateApiKey()
      this.apiKeyHash = this.hashApiKey(apiKey)

      const machineId = this.generateMachineId()
      const capabilities = this.getCapabilities()
      const supportedTools = this.getSupportedTools()

      // Check if agent already exists
      const { data: existing } = await this.supabase
        .from('agent_destinations')
        .select('id')
        .eq('organization_id', this.config.organizationId)
        .eq('name', this.config.name)
        .single()

      if (existing) {
        // Update existing agent
        const { data, error } = await this.supabase
          .from('agent_destinations')
          .update({
            hostname: hostname(),
            machine_id: machineId,
            cli_version: capabilities.cliVersion,
            capabilities,
            supported_tools: supportedTools,
            api_key_hash: this.apiKeyHash,
            status: 'online',
            last_heartbeat_at: new Date().toISOString(),
            max_concurrent_tasks: this.config.maxConcurrentTasks || 1,
            is_active: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single()

        if (error) {
          throw error
        }

        this.destinationId = existing.id
        logger.info(`Agent updated: ${existing.id}`)
      } else {
        // Create new agent
        const { data, error } = await this.supabase
          .from('agent_destinations')
          .insert({
            organization_id: this.config.organizationId,
            name: this.config.name,
            hostname: hostname(),
            machine_id: machineId,
            cli_version: capabilities.cliVersion,
            capabilities,
            supported_tools: supportedTools,
            api_key_hash: this.apiKeyHash,
            status: 'online',
            max_concurrent_tasks: this.config.maxConcurrentTasks || 1,
            allowed_task_types: ['workflow', 'tool', 'transform'],
            metadata: this.config.capabilities || {},
            tags: [],
            is_active: true
          })
          .select()
          .single()

        if (error) {
          throw error
        }

        this.destinationId = data.id
        logger.info(`Agent registered: ${data.id}`)
        
        if (!this.config.apiKey) {
          logger.info(`Generated API key: ${apiKey}`)
          logger.info('Save this API key securely. It will not be shown again.')
        }
      }

      this.isRegistered = true
      
      // Start heartbeat
      this.startHeartbeat()

      return this.destinationId!
    } catch (error) {
      logger.error('Failed to register agent:', error)
      throw error
    }
  }

  /**
   * Unregister this agent
   */
  async unregister(): Promise<void> {
    if (!this.isRegistered || !this.destinationId) {
      return
    }

    logger.info('Unregistering agent...')

    try {
      // Update status to offline
      await this.supabase
        .from('agent_destinations')
        .update({
          status: 'offline',
          updated_at: new Date().toISOString()
        })
        .eq('id', this.destinationId)

      this.stopHeartbeat()
      this.isRegistered = false
      
      logger.info('Agent unregistered')
    } catch (error) {
      logger.error('Failed to unregister agent:', error)
    }
  }

  /**
   * Start sending heartbeats
   */
  private startHeartbeat(): void {
    const intervalMs = this.config.heartbeatIntervalMs || 30000 // Default 30 seconds

    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeat()
    }, intervalMs)

    // Send initial heartbeat
    this.sendHeartbeat()
  }

  /**
   * Stop sending heartbeats
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  /**
   * Send a heartbeat
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.destinationId) return

    try {
      const memUsage = process.memoryUsage()
      const cpuUsage = process.cpuUsage()
      
      const heartbeat: HeartbeatData = {
        destinationId: this.destinationId,
        cpuUsagePercent: 0, // TODO: Calculate actual CPU usage
        memoryUsageMb: Math.floor(memUsage.heapUsed / 1024 / 1024),
        diskUsagePercent: 0, // TODO: Calculate disk usage
        activeTasks: 0, // TODO: Get from task executor
        queuedTasks: 0, // TODO: Get from task executor
        status: 'online'
      }

      // Insert heartbeat record
      const { error: heartbeatError } = await this.supabase
        .from('destination_heartbeats')
        .insert({
          destination_id: this.destinationId,
          cpu_usage_percent: heartbeat.cpuUsagePercent,
          memory_usage_mb: heartbeat.memoryUsageMb,
          disk_usage_percent: heartbeat.diskUsagePercent,
          active_tasks: heartbeat.activeTasks,
          queued_tasks: heartbeat.queuedTasks,
          status: heartbeat.status
        })

      if (heartbeatError) {
        logger.error('Failed to send heartbeat:', heartbeatError)
      } else {
        logger.debug('Heartbeat sent')
      }

      // Also update the destination's last heartbeat
      const { error: updateError } = await this.supabase
        .from('agent_destinations')
        .update({
          last_heartbeat_at: new Date().toISOString(),
          status: 'online'
        })
        .eq('id', this.destinationId)

      if (updateError) {
        logger.error('Failed to update destination heartbeat:', updateError)
      }
    } catch (error) {
      logger.error('Error sending heartbeat:', error)
    }
  }

  /**
   * Update agent status
   */
  async updateStatus(status: AgentDestination['status'], errorMessage?: string): Promise<void> {
    if (!this.destinationId) return

    try {
      const updates: any = {
        status,
        updated_at: new Date().toISOString()
      }

      if (errorMessage) {
        updates.metadata = {
          ...this.config.capabilities,
          lastError: errorMessage,
          lastErrorAt: new Date().toISOString()
        }
      }

      const { error } = await this.supabase
        .from('agent_destinations')
        .update(updates)
        .eq('id', this.destinationId)

      if (error) {
        logger.error('Failed to update agent status:', error)
      } else {
        logger.info(`Agent status updated to: ${status}`)
      }
    } catch (error) {
      logger.error('Error updating agent status:', error)
    }
  }

  /**
   * Get destination ID
   */
  getDestinationId(): string | null {
    return this.destinationId
  }

  /**
   * Check if agent is registered
   */
  isAgentRegistered(): boolean {
    return this.isRegistered
  }
}