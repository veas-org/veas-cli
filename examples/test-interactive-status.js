#!/usr/bin/env node

/**
 * Test script to verify interactive task status handling
 * Shows the difference between completed vs spawned tasks
 */

import { createClient } from '@supabase/supabase-js'
import { TaskExecutor } from '../dist/services/task-executor.js'

// Mock Supabase client for testing
const mockSupabase = {
  schema: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({ error: null })
      }),
      select: () => ({
        eq: () => ({
          single: () => ({
            data: {
              id: 'test-execution-1',
              task_id: 'test-task-1',
              destination_id: 'test-dest-1',
              status: 'queued',
              queued_at: new Date().toISOString(),
              input_params: {}
            },
            error: null
          })
        })
      })
    })
  }),
  from: () => ({
    select: () => ({
      eq: () => ({
        single: () => ({
          data: {
            id: 'test-task-1',
            name: 'Test Interactive Task',
            task_type: 'single',
            configuration: {
              command: 'claude',
              openInNewTerminal: true,
              terminalApp: 'iterm2',
              keepTerminalOpen: true,
              autoResponses: [
                { input: 'Hi\n', delay: 2000 }
              ]
            }
          },
          error: null
        })
      })
    })
  })
}

async function testInteractiveStatus() {
  console.log('🧪 Testing Interactive Task Status Handling\n')
  
  const executor = new TaskExecutor(mockSupabase, 'test-dest-1', 'test-org-1')
  
  // Test 1: Regular command (should complete)
  console.log('Test 1: Regular command execution')
  try {
    const regularTask = {
      name: 'Regular Echo Task',
      task_type: 'single',
      configuration: {
        command: 'echo "Hello World"'
      }
    }
    
    const result1 = await executor.runTaskWorkflow(regularTask, {})
    console.log(`  Status: ${result1.status}`)
    console.log(`  Message: ${result1.message}`)
    console.log(`  Spawned in Terminal: ${result1.spawnedInTerminal || false}`)
    console.log('')
  } catch (error) {
    console.error('  Failed:', error.message)
  }
  
  // Test 2: Interactive command in terminal (should spawn)
  console.log('Test 2: Interactive command with terminal spawning')
  try {
    const interactiveTask = {
      name: 'Claude Interactive Task',
      task_type: 'single',
      configuration: {
        command: 'claude',
        openInNewTerminal: true,
        terminalApp: 'iterm2',
        keepTerminalOpen: true
      }
    }
    
    const result2 = await executor.runTaskWorkflow(interactiveTask, {})
    console.log(`  Status: ${result2.status}`)
    console.log(`  Message: ${result2.message}`)
    console.log(`  Spawned in Terminal: ${result2.spawnedInTerminal || false}`)
    console.log(`  Terminal App: ${result2.terminalApp || 'N/A'}`)
    console.log('')
  } catch (error) {
    console.error('  Failed:', error.message)
  }
  
  // Test 3: Interactive command without terminal (should complete)
  console.log('Test 3: Interactive command without terminal spawning')
  try {
    const interactiveInlineTask = {
      name: 'Claude Inline Task',
      task_type: 'single',
      configuration: {
        command: 'echo "Simulating claude"', // Using echo to avoid actual claude
        interactive: true,
        openInNewTerminal: false
      }
    }
    
    const result3 = await executor.runTaskWorkflow(interactiveInlineTask, {})
    console.log(`  Status: ${result3.status}`)
    console.log(`  Message: ${result3.message}`)
    console.log(`  Spawned in Terminal: ${result3.spawnedInTerminal || false}`)
    console.log(`  Interactive: ${result3.interactive || false}`)
  } catch (error) {
    console.error('  Failed:', error.message)
  }
  
  console.log('\n✅ Status handling tests completed!')
}

// Run the test
testInteractiveStatus().catch(console.error)