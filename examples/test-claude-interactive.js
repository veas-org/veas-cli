#!/usr/bin/env node

/**
 * Test pure interactive Claude session without auto-responses
 */

import { TerminalSpawner } from '../dist/services/terminal-spawner.js'

async function testClaudeInteractive() {
  console.log('🚀 Testing Pure Interactive Claude Session\n')
  
  const spawner = new TerminalSpawner()
  
  console.log('Opening Claude in iTerm2 (no auto-responses)...')
  console.log('The terminal should stay open with Claude running.')
  console.log('You should be able to interact with Claude normally.')
  console.log('The terminal will close when you exit Claude.\n')
  
  try {
    const result = await spawner.spawnInNewTerminal({
      command: 'claude',
      title: 'Claude Interactive Session',
      terminalApp: 'iterm2',
      keepOpen: true  // This should be ignored for interactive commands
    })
    
    console.log('✅ Claude session opened successfully!')
    console.log('📝 Check the iTerm2 window')
    console.log('💡 Type your message to Claude in the terminal')
    console.log('🚪 The terminal will close when you exit Claude')
  } catch (error) {
    console.error('❌ Failed to open Claude:', error.message)
  }
}

// Run the test
testClaudeInteractive().catch(console.error)