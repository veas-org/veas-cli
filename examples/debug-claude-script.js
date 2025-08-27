#!/usr/bin/env node

/**
 * Debug script to check what's being generated for Claude
 */

import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Simulate what the terminal spawner generates
const command = 'claude'
const isInteractive = true

const scriptPath = join(tmpdir(), `debug-claude-${Date.now()}.sh`)

let scriptContent = '#!/bin/bash\n'
scriptContent += `echo "Starting Claude session..."\n`
scriptContent += `echo "PATH: $PATH"\n`
scriptContent += `echo "Which claude: $(which claude)"\n`
scriptContent += `echo ""\n`

// Try different approaches
if (isInteractive) {
  // Approach 1: Just run claude directly (what we currently do)
  scriptContent += `# Approach 1: exec claude\n`
  scriptContent += `exec claude\n`
}

writeFileSync(scriptPath, scriptContent, { mode: 0o755 })

console.log('Script generated at:', scriptPath)
console.log('\nScript content:')
console.log('================')
console.log(scriptContent)
console.log('================')
console.log('\nNow run this in iTerm2 to see what happens:')
console.log(`bash ${scriptPath}`)