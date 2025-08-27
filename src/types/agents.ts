/**
 * Agent and Task Type Definitions
 */

export type TaskStatus = 'active' | 'inactive' | 'archived' | 'draft'
export type TaskType = 'workflow' | 'single' | 'batch' | 'report' | 'monitoring' | 'integration' | 'custom'
export type ScheduleType = 'cron' | 'webhook' | 'event' | 'manual' | 'interval' | 'once' | 'calendar'
export type ExecutionStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout'
  | 'retrying'
  | 'skipped'
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
  capabilities?: Record<string, unknown>
  tools?: string[]
  model_preferences?: Record<string, unknown>
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
  configuration: Record<string, unknown>
  tools?: any[]
  parameters?: Record<string, unknown>
  workflow?: any[]
  input_schema?: Record<string, unknown>
  output_schema?: Record<string, unknown>
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
  destination_id?: string // Destination-specific schedule

  // Calendar metadata
  title: string // Event title for calendar display
  description?: string // Event description
  location?: string // Physical or virtual location
  calendar_color?: string // Hex color for calendar display
  priority?: number // Priority level (0=low, 1=normal, 2=high, 3=critical)

  // Schedule configuration
  schedule_type: ScheduleType
  cron_expression?: string
  webhook_path?: string
  event_name?: string
  interval_seconds?: number

  // Calendar scheduling
  start_time?: string // Event start time (for calendar events)
  end_time?: string // Event end time (for calendar events)
  duration_minutes?: number // Duration in minutes (alternative to end_time)
  all_day?: boolean // All-day event flag

  // Recurrence (RRULE RFC 5545 compliant)
  recurrence_rule?: string // RRULE string (e.g., "FREQ=WEEKLY;BYDAY=MO,WE,FR")
  recurrence_end_date?: string // When recurrence ends
  recurrence_count?: number // Number of occurrences

  // Schedule metadata
  is_enabled: boolean
  timezone: string
  start_date: string
  end_date?: string

  // Execution tracking
  next_run_at?: string
  last_run_at?: string
  run_count: number
  consecutive_failures: number

  // Calendar metadata
  attendees?: Array<{
    email: string
    name?: string
    status?: 'pending' | 'accepted' | 'declined'
  }>
  reminders?: Array<{
    minutes_before: number
    method: 'email' | 'notification' | 'sms'
  }>
  attachments?: Array<{
    url: string
    name: string
    type?: string
  }>
  custom_fields?: Record<string, unknown>

  // Retry configuration
  retry_policy?: {
    max_attempts: number
    backoff_seconds: number
    backoff_multiplier: number
  }

  // Alerts
  alert_on_failure: boolean
  alert_email?: string
  alert_webhook_url?: string

  created_at: string
  updated_at: string
  created_by?: string
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
  input_params?: Record<string, unknown>
  output_result?: Record<string, unknown>
  error_message?: string
  error_details?: Record<string, unknown>
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
  context?: Record<string, unknown>
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
  capabilities?: Record<string, unknown>
  supported_tools?: string[]
  resource_limits?: Record<string, unknown>
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
  metadata?: Record<string, unknown>
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

export interface ScheduleException {
  id: string
  schedule_id: string
  exception_date: string // Date of the occurrence to modify
  exception_type: 'cancelled' | 'rescheduled' | 'modified'

  // Rescheduled/modified event details
  new_start_time?: string
  new_end_time?: string
  new_duration_minutes?: number
  new_title?: string
  new_description?: string
  new_location?: string

  // Metadata
  reason?: string
  created_by?: string
  created_at: string
}

export interface CalendarEvent {
  id: string
  schedule_id: string
  task_id: string
  destination_id?: string

  // Event details
  title: string
  description?: string
  location?: string
  start: string
  end: string
  all_day: boolean

  // Visual properties
  color: string
  priority: number

  // Metadata
  is_recurring: boolean
  is_exception: boolean
  is_active: boolean
  timezone: string
}

export interface DestinationSchedule {
  id: string
  task_id: string
  destination_id: string
  title: string
  description?: string
  location?: string
  calendar_color?: string
  priority?: number
  schedule_type: ScheduleType
  start_time?: string
  end_time?: string
  duration_minutes?: number
  all_day?: boolean
  timezone: string
  recurrence_rule?: string
  is_enabled: boolean
  next_run_at?: string
  last_run_at?: string
  run_count: number

  // Related data
  task_name: string
  task_description?: string
  task_status: TaskStatus
  destination_name: string
  destination_hostname: string
  destination_status: DestinationStatus
  destination_owner_id: string
}
