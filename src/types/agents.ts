/**
 * Agent and Task Type Definitions
 */

export type TaskStatus = 'active' | 'inactive' | 'archived' | 'draft'
export type TaskType = 'workflow' | 'single' | 'batch' | 'report' | 'monitoring' | 'integration' | 'custom'
export type ScheduleType = 'cron' | 'webhook' | 'event' | 'manual' | 'interval' | 'once'
export type ExecutionStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout' | 'retrying' | 'skipped'
export type ExecutionTrigger = 'manual' | 'scheduled' | 'webhook' | 'event' | 'api' | 'retry' | 'test'
export type DestinationStatus = 'online' | 'offline' | 'busy' | 'maintenance' | 'error'

export interface Agent {
  id: string
  organization_id: string
  created_by: string
  name: string
  description?: string
  avatar_url?: string
  agent_type: 'system' | 'user' | 'organization' | 'template'
  capabilities?: Record<string, any>
  tools?: string[]
  model_preferences?: Record<string, any>
  system_prompt?: string
  temperature?: number
  max_tokens?: number
  is_active: boolean
  tags?: string[]
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  organization_id: string
  agent_id?: string
  created_by: string
  name: string
  description?: string
  task_type: TaskType
  status: TaskStatus
  configuration: Record<string, any>
  tools?: any[]
  parameters?: Record<string, any>
  workflow?: any[]
  input_schema?: Record<string, any>
  output_schema?: Record<string, any>
  webhook_secret?: string
  allowed_ips?: string[]
  require_auth: boolean
  max_retries: number
  timeout_seconds: number
  max_executions_per_day?: number
  estimated_cost_cents?: number
  max_cost_cents?: number
  tags?: string[]
  version: number
  is_public: boolean
  execution_count: number
  success_count: number
  failure_count: number
  avg_duration_ms?: number
  created_at: string
  updated_at: string
  last_executed_at?: string
}

export interface Schedule {
  id: string
  task_id: string
  schedule_type: ScheduleType
  cron_expression?: string
  webhook_path?: string
  event_name?: string
  interval_seconds?: number
  is_enabled: boolean
  timezone: string
  start_date: string
  end_date?: string
  next_run_at?: string
  last_run_at?: string
  run_count: number
  consecutive_failures: number
  retry_policy?: {
    max_attempts: number
    backoff_seconds: number
    backoff_multiplier: number
  }
  alert_on_failure: boolean
  alert_email?: string
  alert_webhook_url?: string
  created_at: string
  updated_at: string
}

export interface Execution {
  id: string
  task_id: string
  schedule_id?: string
  agent_id?: string
  destination_id?: string
  status: ExecutionStatus
  trigger: ExecutionTrigger
  trigger_source?: string
  input_params?: Record<string, any>
  output_result?: Record<string, any>
  error_message?: string
  error_details?: Record<string, any>
  queued_at: string
  started_at?: string
  completed_at?: string
  duration_ms?: number
  tokens_used?: number
  tool_calls_count?: number
  api_calls_count?: number
  cost_cents?: number
  execution_logs?: any[]
  tool_calls?: any[]
  retry_count: number
  parent_execution_id?: string
  context?: Record<string, any>
  assigned_at?: string
  claimed_at?: string
  created_at: string
}

export interface AgentDestination {
  id: string
  organization_id: string
  owner_id: string
  name: string
  hostname: string
  machine_id?: string
  cli_version?: string
  capabilities?: Record<string, any>
  supported_tools?: string[]
  resource_limits?: Record<string, any>
  status: DestinationStatus
  last_heartbeat_at?: string
  registered_at: string
  api_key_hash: string
  max_concurrent_tasks: number
  allowed_task_types?: TaskType[]
  total_executions: number
  successful_executions: number
  failed_executions: number
  avg_execution_time_ms?: number
  metadata?: Record<string, any>
  tags?: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TaskDestinationAssignment {
  id: string
  task_id: string
  destination_id: string
  priority: number
  is_exclusive: boolean
  created_at: string
}

export interface DestinationHeartbeat {
  id: string
  destination_id: string
  cpu_usage_percent?: number
  memory_usage_mb?: number
  disk_usage_percent?: number
  active_tasks: number
  queued_tasks: number
  ip_address?: string
  latency_ms?: number
  status: DestinationStatus
  error_message?: string
  created_at: string
}