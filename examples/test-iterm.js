#!/usr/bin/env node

/**
 * Test script for iTerm2 terminal spawning
 */

import { TerminalSpawner } from '../dist/services/terminal-spawner.js'

async function testITermSpawning() {
  console.log('🧪 Testing iTerm2 Terminal Spawning\n')
  
  const spawner = new TerminalSpawner()
  
  // Test 1: Simple command in iTerm2
  console.log('Test 1: Opening command in iTerm2...')
  try {
    const result1 = await spawner.spawnInNewTerminal({
      command: 'echo "Hello from iTerm2!" && sleep 3',
      title: 'iTerm2 Test',
      terminalApp: 'iterm2',
      keepOpen: true
    })
    console.log(`✅ iTerm2 opened with PID: ${result1.pid}`)
  } catch (error) {
    console.error('❌ Failed:', error.message)
  }
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Test 2: Interactive command with auto-responses in iTerm2
  console.log('\nTest 2: Interactive command with auto-responses in iTerm2...')
  try {
    const result2 = await spawner.spawnInNewTerminal({
      command: 'read -p "Enter your name: " name && echo "Hello, $name!"',
      title: 'iTerm2 Interactive',
      terminalApp: 'iterm2',
      keepOpen: true,
      autoResponses: [
        {
          trigger: 'Enter your name:',
          input: 'iTerm User\n',
          delay: 1500
        }
      ]
    })
    console.log(`✅ iTerm2 interactive session opened with PID: ${result2.pid}`)
  } catch (error) {
    console.error('❌ Failed:', error.message)
  }
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Test 3: Test other terminals (Warp, Alacritty, etc.)
  console.log('\nTest 3: Testing different terminal applications...')
  
  const terminals = ['terminal', 'iterm2', 'warp', 'alacritty', 'kitty', 'hyper']
  
  for (const term of terminals) {
    console.log(`\nTrying ${term}...`)
    try {
      const result = await spawner.spawnInNewTerminal({
        command: `echo "Hello from ${term}!" && echo "Terminal: ${term}" && sleep 2`,
        title: `${term} Test`,
        terminalApp: term,
        keepOpen: false
      })
      console.log(`✅ ${term} opened successfully`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (error) {
      console.log(`⚠️  ${term} not available or failed to open`)
    }
  }
  
  console.log('\n✅ Terminal spawning tests completed!')
  console.log('Check the opened terminal windows to see the results.')
}

// Run the test
testITermSpawning().catch(console.error)