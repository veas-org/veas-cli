#!/usr/bin/env node

/**
 * Test that commands run in the correct working directory
 */

import { TerminalSpawner } from '../dist/services/terminal-spawner.js'
import { resolve } from 'path'

async function testWorkingDirectory() {
  console.log('🧪 Testing Working Directory\n')
  
  const spawner = new TerminalSpawner()
  const currentDir = process.cwd()
  
  console.log(`Current directory: ${currentDir}\n`)
  
  // Test 1: Non-interactive command showing pwd
  console.log('Test 1: Non-interactive command (pwd)')
  try {
    await spawner.spawnInNewTerminal({
      command: 'pwd && echo "Files in this directory:" && ls -la',
      title: 'PWD Test',
      terminalApp: 'iterm2',
      cwd: currentDir,
      keepOpen: true
    })
    console.log('✅ Check iTerm2 - should show current directory\n')
  } catch (error) {
    console.error('❌ Failed:', error.message)
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Test 2: Interactive command (python) with pwd check
  console.log('Test 2: Interactive Python with pwd check')
  try {
    await spawner.spawnInNewTerminal({
      command: 'python -c "import os; print(\'Current dir:\', os.getcwd())" && python',
      title: 'Python PWD Test',
      terminalApp: 'iterm2',
      cwd: currentDir,
      keepOpen: true
    })
    console.log('✅ Python should show current directory first, then open REPL\n')
  } catch (error) {
    console.error('❌ Failed:', error.message)
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Test 3: Claude in current directory
  console.log('Test 3: Claude in current directory')
  console.log(`Should start in: ${currentDir}`)
  try {
    await spawner.spawnInNewTerminal({
      command: 'claude',
      title: 'Claude in Project Dir',
      terminalApp: 'iterm2',
      cwd: currentDir,
      keepOpen: true
    })
    console.log('✅ Claude should be running in the current project directory')
    console.log('💡 You can ask Claude to list files to verify the directory\n')
  } catch (error) {
    console.error('❌ Failed:', error.message)
  }
  
  console.log('✅ Working directory tests completed!')
  console.log('Check the iTerm2 windows to verify they\'re in the correct directory')
}

// Run the test
testWorkingDirectory().catch(console.error)