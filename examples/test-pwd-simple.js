#!/usr/bin/env node

/**
 * Simple test to verify working directory
 */

import { TerminalSpawner } from '../dist/services/terminal-spawner.js'

async function testPwd() {
  const spawner = new TerminalSpawner()
  const currentDir = process.cwd()
  
  console.log(`Testing pwd in: ${currentDir}`)
  
  await spawner.spawnInNewTerminal({
    command: 'echo "Current directory:" && pwd && echo "" && echo "Files:" && ls -la | head -10',
    title: 'PWD Test',
    terminalApp: 'iterm2',
    cwd: currentDir,
    keepOpen: true
  })
  
  console.log('✅ Check iTerm2 window for directory listing')
}

testPwd().catch(console.error)