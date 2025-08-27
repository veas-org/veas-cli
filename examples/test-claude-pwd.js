#!/usr/bin/env node

/**
 * Test Claude running in the correct directory
 */

import { TerminalSpawner } from '../dist/services/terminal-spawner.js'

async function testClaudePwd() {
  console.log('🧪 Testing Claude in Current Directory\n')
  
  const spawner = new TerminalSpawner()
  const currentDir = process.cwd()
  
  console.log(`Current directory: ${currentDir}`)
  console.log('Opening Claude in this directory...\n')
  
  try {
    const result = await spawner.spawnInNewTerminal({
      command: 'claude',
      title: 'Claude in veas-cli',
      terminalApp: 'iterm2',
      cwd: currentDir,
      keepOpen: true
    })
    
    console.log('✅ Claude opened in iTerm2')
    console.log(`📁 Working directory: ${currentDir}`)
    console.log('💡 Ask Claude to run "pwd" or list files to verify the directory')
    console.log('🚪 The terminal will close when you exit Claude')
  } catch (error) {
    console.error('❌ Failed:', error.message)
  }
}

// Run the test
testClaudePwd().catch(console.error)