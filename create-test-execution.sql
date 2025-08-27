-- Create test data for agent realtime detection
-- First ensure we have an organization
INSERT INTO team_management.organizations (id, name, slug, created_by)
VALUES ('12341234-1234-1234-1234-123412341234', 'Veas', 'veas', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Create test agent
INSERT INTO agents.agents (id, organization_id, created_by, name, description, agent_type, is_active)
VALUES (
  'a1234567-1234-1234-1234-123456789012',
  '12341234-1234-1234-1234-123412341234',
  '00000000-0000-0000-0000-000000000001',
  'Test Agent',
  'Agent for testing realtime detection',
  'system',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true;

-- Create test task
INSERT INTO agents.tasks (
  id,
  organization_id,
  agent_id,
  created_by,
  name,
  description,
  task_type,
  status,
  configuration
)
VALUES (
  'b1234567-1234-1234-1234-123456789012',
  '12341234-1234-1234-1234-123412341234',
  'a1234567-1234-1234-1234-123456789012',
  '00000000-0000-0000-0000-000000000001',
  'Test Task for Realtime',
  'Test task to verify realtime detection',
  'single',
  'active',
  '{"test": true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  status = 'active',
  name = EXCLUDED.name;

-- Create an unclaimed execution
INSERT INTO agents.executions (
  task_id,
  status,
  trigger,
  trigger_source,
  destination_id,
  claimed_at,
  queued_at,
  input_params,
  execution_logs,
  tool_calls,
  retry_count,
  context
)
VALUES (
  'b1234567-1234-1234-1234-123456789012',
  'pending',
  'manual',
  'test-script',
  NULL, -- Unclaimed
  NULL,
  NOW(),
  '{"test": true}'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  0,
  '{"test": true}'::jsonb
);

-- Show the created execution
SELECT 
  id,
  task_id,
  status,
  destination_id,
  claimed_at,
  queued_at
FROM agents.executions
WHERE task_id = 'b1234567-1234-1234-1234-123456789012'
ORDER BY created_at DESC
LIMIT 1;