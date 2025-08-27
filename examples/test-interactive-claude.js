#!/usr/bin/env node

/**
 * Manual test for interactive Claude execution with auto-responses
 * 
 * This demonstrates how the TaskExecutor handles interactive commands
 * with automatic responses for the Claude CLI.
 */

import { createClient } from '@supabase/supabase-js'
import { TaskExecutor } from '../dist/services/task-executor.js'

// Use local Supabase instance
const supabaseUrl = 'http://127.0.0.1:54321'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testInteractiveExecution() {
  console.log('🧪 Testing Interactive Claude Execution with Auto-Responses\n')
  
  // Create a test task
  const task = {
    id: 'test-task-' + Date.now(),
    organization_id: 'test-org',
    created_by: 'test-user',
    name: 'Interactive Claude Test',
    description: 'Test Claude with auto-responses',
    task_type: 'single',
    status: 'active',
    configuration: {},
    tools: [],
    parameters: {},
    workflow: [],
    require_auth: false,
    max_retries: 3,
    timeout_seconds: 300,
    version: 1,
    is_public: false,
    execution_count: 0,
    success_count: 0,
    failure_count: 0,
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  
  // Insert task
  const { data: insertedTask, error: taskError } = await supabase
    .schema('agents')
    .from('tasks')
    .insert(task)
    .select()
    .single()
    
  if (taskError) {
    console.error('Failed to create task:', taskError)
    return
  }
  
  console.log('✅ Created test task:', insertedTask.id)
  
  // Create test execution with auto-responses
  const execution = {
    id: 'test-exec-' + Date.now(), 
    task_id: insertedTask.id,
    organization_id: 'test-org',
    created_by: 'test-user',
    trigger_type: 'manual',
    status: 'pending',
    queued_at: new Date().toISOString(),
    input_params: {
      command: 'echo "Testing auto-response:" && read -p "Would you like to continue? " response && echo "You said: $response"',
      autoResponses: [
        {
          trigger: 'Would you like to',
          input: 'yes\n',
          delay: 1000,
        }
      ]
    }
  }
  
  // Insert execution
  const { data: insertedExec, error: execError } = await supabase
    .schema('agents')
    .from('executions')
    .insert(execution)
    .select()
    .single()
    
  if (execError) {
    console.error('Failed to create execution:', execError)
    return
  }
  
  console.log('✅ Created test execution:', insertedExec.id)
  console.log('📋 Input params:', JSON.stringify(execution.input_params, null, 2))
  
  // Create executor
  const executor = new TaskExecutor(
    supabase,
    'test-destination',
    'test-org'
  )
  
  console.log('\n🚀 Starting execution...\n')
  console.log('=' .repeat(60))
  
  try {
    // Execute the task
    await executor.executeTask(insertedExec.id)
    
    console.log('=' .repeat(60))
    console.log('\n✅ Execution completed successfully!')
    
    // Check final status
    const { data: finalExec } = await supabase
      .schema('agents')
      .from('executions')
      .select()
      .eq('id', insertedExec.id)
      .single()
      
    console.log('📊 Final status:', finalExec?.status)
    console.log('📝 Output:', JSON.stringify(finalExec?.output_result, null, 2))
  } catch (error) {
    console.error('❌ Execution failed:', error)
  }
  
  // Cleanup
  console.log('\n🧹 Cleaning up test data...')
  await supabase
    .schema('agents')
    .from('executions')
    .delete()
    .eq('id', insertedExec.id)
    
  await supabase
    .schema('agents')
    .from('tasks')
    .delete()
    .eq('id', insertedTask.id)
    
  console.log('✅ Cleanup complete')
}

// Run the test
testInteractiveExecution().catch(console.error)