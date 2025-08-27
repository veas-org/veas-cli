#!/usr/bin/env node

/**
 * Test script for the terminal spawning feature
 * This demonstrates opening interactive commands in separate terminal windows
 */

import { TerminalSpawner } from '../dist/services/terminal-spawner.js'

async function testTerminalSpawning() {
  console.log('🧪 Testing Terminal Spawning Feature\n')
  
  const spawner = new TerminalSpawner()
  
  // Test 1: Simple command in new terminal
  console.log('Test 1: Opening simple command in new terminal...')
  try {
    const result1 = await spawner.spawnInNewTerminal({
      command: 'echo "Hello from separate terminal!" && sleep 2',
      title: 'Test Terminal 1',
      keepOpen: true
    })
    console.log(`✅ Terminal opened with PID: ${result1.pid}`)
  } catch (error) {
    console.error('❌ Failed:', error.message)
  }
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Test 2: Interactive command with auto-responses
  console.log('\nTest 2: Opening interactive command with auto-responses...')
  try {
    const result2 = await spawner.spawnInNewTerminal({
      command: 'read -p "Enter your name: " name && echo "Hello, $name!"',
      title: 'Interactive Test',
      keepOpen: true,
      autoResponses: [
        {
          trigger: 'Enter your name:',
          input: 'Claude\n',
          delay: 1000
        }
      ]
    })
    console.log(`✅ Interactive terminal opened with PID: ${result2.pid}`)
  } catch (error) {
    console.error('❌ Failed:', error.message)
  }
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Test 3: Companion mode with two terminals
  console.log('\nTest 3: Opening with companion monitor terminal...')
  try {
    const result3 = await spawner.spawnWithCompanion({
      command: 'for i in {1..5}; do echo "Processing item $i..."; sleep 1; done',
      title: 'Main Task',
      keepOpen: true,
      autoResponses: []
    })
    console.log(`✅ Main terminal PID: ${result3.mainPid}`)
    console.log(`✅ Monitor terminal PID: ${result3.companionPid}`)
  } catch (error) {
    console.error('❌ Failed:', error.message)
  }
  
  console.log('\n✅ All tests completed!')
  console.log('Check the opened terminal windows to see the results.')
}

// Run the test
testTerminalSpawning().catch(console.error)