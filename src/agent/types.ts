/**
 * Agent Types
 *
 * Type definitions for the agent execution system
 */

export interface AgentDestination {
  id: string
  organizationId: string
  name: string
  hostname: string
  machineId?: string
  cliVersion?: string
  capabilities: Record<string, unknown>
  supportedTools: string[]
  resourceLimits: {
    maxConcurrentTasks?: number
    maxMemoryMb?: number
    maxCpuPercent?: number
  }
  status: 'online' | 'offline' | 'busy' | 'maintenance' | 'error'
  lastHeartbeatAt?: string
  registeredAt: string
  maxConcurrentTasks: number
  allowedTaskTypes: string[]
  metadata: Record<string, unknown>
  tags: string[]
  isActive: boolean
}

export interface TaskExecution {
  id: string
  taskId: string
  scheduleId?: string
  agentId?: string
  destinationId?: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  trigger: 'manual' | 'scheduled' | 'webhook' | 'event'
  triggerSource?: string
  inputParams: Record<string, unknown>
  outputResult?: Record<string, unknown>
  errorMessage?: string
  errorDetails?: Record<string, unknown>
  queuedAt: string
  startedAt?: string
  completedAt?: string
  assignedAt?: string
  claimedAt?: string
  durationMs?: number
  tokensUsed?: number
  toolCallsCount?: number
  apiCallsCount?: number
  costCents?: number
  executionLogs: ExecutionLog[]
  toolCalls: ToolCall[]
  retryCount: number
  parentExecutionId?: string
  context: Record<string, unknown>
}

export interface Task {
  id: string
  organizationId: string
  agentId?: string
  createdBy: string
  name: string
  description?: string
  taskType: 'workflow' | 'tool' | 'transform' | 'analysis' | 'generation'
  status: 'draft' | 'active' | 'paused' | 'archived'
  configuration: TaskConfiguration
  tools: string[]
  parameters: Record<string, unknown>
  workflow: WorkflowStep[]
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  maxRetries: number
  timeoutSeconds: number
  maxExecutionsPerDay?: number
  estimatedCostCents?: number
  maxCostCents?: number
  tags: string[]
  version: number
  isPublic: boolean
}

export interface TaskConfiguration {
  workflow?: WorkflowStep[]
  tools?: string[]
  parameters?: Record<string, unknown>
  retryPolicy?: {
    maxAttempts: number
    backoffSeconds: number
    backoffMultiplier: number
  }
  timeout?: number
  environment?: Record<string, string>
}

export interface WorkflowStep {
  id: string
  name: string
  type: 'tool' | 'condition' | 'loop' | 'parallel' | 'transform'
  tool?: string
  params?: Record<string, unknown>
  condition?: {
    type: 'expression' | 'comparison'
    expression?: string
    left?: any
    operator?: string
    right?: any
  }
  onSuccess?: string
  onFailure?: string
  retryOnFailure?: boolean
  continueOnError?: boolean
}

export interface ExecutionLog {
  timestamp: string
  level: 'debug' | 'info' | 'warning' | 'error'
  message: string
  data?: Record<string, unknown>
}

export interface ToolCall {
  id: string
  tool: string
  params: Record<string, unknown>
  startedAt: string
  completedAt?: string
  durationMs?: number
  result?: any
  error?: string
}

export interface HeartbeatData {
  destinationId: string
  cpuUsagePercent?: number
  memoryUsageMb?: number
  diskUsagePercent?: number
  activeTasks: number
  queuedTasks: number
  ipAddress?: string
  latencyMs?: number
  status: 'online' | 'offline' | 'busy' | 'maintenance' | 'error'
  errorMessage?: string
}

export interface AgentConfig {
  name: string
  organizationId: string
  capabilities?: Record<string, unknown>
  supportedTools?: string[]
  maxConcurrentTasks?: number
  heartbeatIntervalMs?: number
  apiKey?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
  verbose?: boolean
}

export interface RealtimeMessage {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  new?: any
  old?: any
  eventType: string
  commitTimestamp: string
}
