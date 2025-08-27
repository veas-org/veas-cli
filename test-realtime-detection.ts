#!/usr/bin/env tsx
/**
 * Test script to create test data for realtime detection
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function createTestData() {
  console.log('Creating test data for realtime detection...')
  
  // First get the organization from team_management schema
  const { data: org } = await supabase
    .schema('team_management')
    .from('organizations')
    .select('id')
    .limit(1)
    .single()
    
  if (!org) {
    console.error('No organization found. Please run seed first.')
    return
  }
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id || 'f47ac10b-58cc-4372-a567-0e02b2c3d479' // Default user ID
  
  // First, create an agent if not exists
  const { data: agent, error: agentError } = await supabase
    .schema('agents')
    .from('agents')
    .upsert({
      id: 'test-agent-001',
      organization_id: org.id,
      created_by: userId,
      name: 'Test Agent',
      description: 'Agent for testing realtime detection',
      agent_type: 'system',
      is_active: true,
      capabilities: {},
      tools: ['test-tool'],
      model_preferences: {}
    })
    .select()
    .single()

  if (agentError) {
    console.error('Error creating agent:', agentError)
  } else {
    console.log('Agent created/updated:', agent?.id)
  }

  // Create a test task
  const { data: task, error: taskError } = await supabase
    .schema('agents')
    .from('tasks')
    .insert({
      organization_id: org.id,
      agent_id: 'test-agent-001',
      created_by: userId,
      name: 'Test Task for Realtime',
      description: 'Test task to verify realtime detection',
      task_type: 'single',
      status: 'active',
      configuration: { test: true },
      tools: [{ name: 'test-tool', config: { test: true } }],
      parameters: {},
      workflow: []
    })
    .select()
    .single()

  if (taskError) {
    console.error('Error creating task:', taskError)
    return
  }

  console.log('Task created:', task?.id)

  // Create an unclaimed execution
  const { data: execution, error: execError } = await supabase
    .schema('agents')
    .from('executions')
    .insert({
      task_id: task.id,
      status: 'pending',
      trigger: 'manual',
      trigger_source: 'test-script',
      destination_id: null, // Unclaimed
      claimed_at: null,
      queued_at: new Date().toISOString(),
      input_params: { test: true },
      execution_logs: [],
      tool_calls: [],
      retry_count: 0,
      context: { test: true }
    })
    .select()
    .single()

  if (execError) {
    console.error('Error creating execution:', execError)
    return
  }

  console.log('Unclaimed execution created:', execution?.id)
  console.log('Status:', execution?.status)
  console.log('Destination ID:', execution?.destination_id)
  console.log('\nThe agent should now detect and claim this execution!')
  
  // Monitor the execution status
  let attempts = 0
  const maxAttempts = 30 // 30 seconds timeout
  
  console.log('\nMonitoring execution status...')
  const interval = setInterval(async () => {
    attempts++
    
    const { data: updated, error } = await supabase
      .schema('agents')
      .from('executions')
      .select('*')
      .eq('id', execution.id)
      .single()
    
    if (error) {
      console.error('Error checking execution:', error)
      clearInterval(interval)
      process.exit(1)
    }
    
    if (updated?.destination_id) {
      console.log(`✅ Execution claimed by destination: ${updated.destination_id}`)
      console.log(`   Status: ${updated.status}`)
      console.log(`   Claimed at: ${updated.claimed_at}`)
      clearInterval(interval)
      process.exit(0)
    }
    
    if (attempts >= maxAttempts) {
      console.log('❌ Timeout: Execution was not claimed after 30 seconds')
      clearInterval(interval)
      process.exit(1)
    }
    
    process.stdout.write('.')
  }, 1000)
}

createTestData().catch(console.error)