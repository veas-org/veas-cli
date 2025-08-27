#!/usr/bin/env node

/**
 * Debug auto-responses with visible timing
 */

import { TerminalSpawner } from '../dist/services/terminal-spawner.js'

async function testAutoResponseDebug() {
  console.log('🧪 Testing Auto-Responses with Claude\n')
  
  const spawner = new TerminalSpawner()
  
  // Auto-responses with clear timing
  const autoResponses = [
    {
      input: 'Hello Claude! This is an automated message sent after 3 seconds.\n',
      delay: 3000
    },
    {
      input: 'This is the second message, sent 5 seconds after the first.\n',
      delay: 5000
    },
    {
      input: 'And this is the third message, sent 5 seconds after the second.\n',
      delay: 5000
    }
  ]
  
  console.log('📋 Auto-response Schedule:')
  console.log('  • After 3 seconds: Send first message')
  console.log('  • After 8 seconds: Send second message')
  console.log('  • After 13 seconds: Send third message')
  console.log('')
  
  try {
    const result = await spawner.spawnInNewTerminal({
      command: 'claude',
      title: 'Claude Auto-Response Test',
      terminalApp: 'iterm2',
      cwd: process.cwd(),
      keepOpen: true,
      autoResponses: autoResponses
    })
    
    console.log('✅ Claude opened with auto-responses configured')
    console.log('⏱️  Watch the terminal - messages should appear automatically')
    console.log('📝 The messages should be sent at 3, 8, and 13 seconds')
  } catch (error) {
    console.error('❌ Failed:', error.message)
  }
}

// Run the test
testAutoResponseDebug().catch(console.error)