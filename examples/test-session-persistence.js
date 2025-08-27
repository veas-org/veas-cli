#!/usr/bin/env node

/**
 * Test script to verify terminal session persistence
 * Shows different behaviors for interactive vs non-interactive commands
 */

import { TerminalSpawner } from '../dist/services/terminal-spawner.js'

async function testSessionPersistence() {
  console.log('🧪 Testing Terminal Session Persistence\n')
  
  const spawner = new TerminalSpawner()
  
  // Test 1: Non-interactive command with keepOpen=true
  console.log('Test 1: Non-interactive command (echo) with keepOpen=true')
  console.log('  Expected: Terminal stays open with "Press any key to close" message')
  try {
    await spawner.spawnInNewTerminal({
      command: 'echo "This is a non-interactive command" && sleep 2',
      title: 'Non-Interactive Test',
      terminalApp: 'iterm2',
      keepOpen: true
    })
    console.log('  ✅ Terminal opened - check for close prompt\n')
  } catch (error) {
    console.error('  ❌ Failed:', error.message)
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Test 2: Interactive command (Claude) with keepOpen=true
  console.log('Test 2: Interactive command (claude) with keepOpen=true')
  console.log('  Expected: Terminal stays open, controlled by Claude, no extra prompt')
  try {
    await spawner.spawnInNewTerminal({
      command: 'claude',
      title: 'Claude Interactive',
      terminalApp: 'iterm2',
      keepOpen: true
    })
    console.log('  ✅ Claude session opened - should stay open until you exit Claude\n')
  } catch (error) {
    console.error('  ❌ Failed:', error.message)
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Test 3: Python REPL (interactive)
  console.log('Test 3: Python REPL (interactive)')
  console.log('  Expected: Python REPL opens and stays open until you exit()')
  try {
    await spawner.spawnInNewTerminal({
      command: 'python',
      title: 'Python REPL',
      terminalApp: 'iterm2',
      keepOpen: true
    })
    console.log('  ✅ Python REPL opened - type exit() to close\n')
  } catch (error) {
    console.error('  ❌ Failed:', error.message)
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Test 4: Non-interactive command with keepOpen=false
  console.log('Test 4: Non-interactive command with keepOpen=false')
  console.log('  Expected: Terminal closes immediately after command completes')
  try {
    await spawner.spawnInNewTerminal({
      command: 'echo "Quick command" && sleep 2',
      title: 'Auto-Close Test',
      terminalApp: 'iterm2',
      keepOpen: false
    })
    console.log('  ✅ Terminal opened - should close after 2 seconds\n')
  } catch (error) {
    console.error('  ❌ Failed:', error.message)
  }
  
  console.log('✅ Session persistence tests completed!')
  console.log('Check the opened terminals to verify behavior:')
  console.log('  1. Non-interactive with keepOpen: Has "Press any key" prompt')
  console.log('  2. Claude: Stays open, controlled by Claude')
  console.log('  3. Python REPL: Stays open, controlled by Python')
  console.log('  4. Non-interactive without keepOpen: Closes automatically')
}

// Run the test
testSessionPersistence().catch(console.error)