#!/usr/bin/env node

/**
 * Example: Running Claude in iTerm2 with auto-responses
 * This demonstrates the complete terminal spawning feature with iTerm2 support
 */

import { TerminalSpawner } from '../dist/services/terminal-spawner.js'

async function runClaudeInITerm() {
  console.log('🚀 Running Claude in iTerm2 with auto-responses\n')

  const spawner = new TerminalSpawner()

  // Auto-responses configuration for Claude
  const autoResponses = [
    {
      input: 'Hi\n',
      delay: 2000
    },
    {
      input: '\n',
      delay: 1000
    },
    {
      input: 'Continue\n',
      delay: 30000
    }
  ]

  try {
    console.log('📋 Task Configuration:')
    console.log(`  • Terminal: iTerm2`)
    console.log(`  • Auto-responses: ${autoResponses.length} configured`)
    console.log(`  • Keep terminal open: true`)
    console.log('')

    console.log('🖥️  Opening Claude in iTerm2...')
    
    const result = await spawner.spawnInNewTerminal({
      command: 'claude',
      title: 'Claude Analysis in iTerm2',
      terminalApp: 'iterm2',
      keepOpen: true,
      autoResponses: autoResponses
    })

    if (result.pid !== undefined) {
      console.log('✅ Claude session started successfully in iTerm2!')
      console.log(`📝 Process ID: ${result.pid}`)
      console.log('📝 Check the iTerm2 window for the Claude interface')
      console.log('🤖 Auto-responses will handle common prompts automatically')
    } else {
      console.error('❌ Failed to start Claude session')
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Run the example
runClaudeInITerm().catch(console.error)
