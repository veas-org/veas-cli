#!/usr/bin/env node

/**
 * Debug the generated expect script
 */

import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Simulate what gets generated
const command = 'claude'
const autoResponses = [
  {
    input: 'Hello Claude!\n',
    delay: 3000
  },
  {
    input: 'This is message 2\n',
    delay: 5000
  }
]

const scriptPath = join(tmpdir(), `debug-expect-${Date.now()}.sh`)

let scriptContent = '#!/bin/bash\n'
scriptContent += 'cd "/Users/marcin/Projects/veas/m9sh/apps/veas-cli"\n'
scriptContent += 'echo "Starting Claude with auto-responses..."\n'
scriptContent += 'echo ""\n'

// Add expect script
scriptContent += `
# Check if expect is available
if ! command -v expect &> /dev/null; then
  echo "⚠️  'expect' not installed - running without auto-responses"
  ${command}
  exit $?
fi

# Run with expect for auto-responses
expect << 'EOF'
set timeout -1
spawn ${command}

# Handle auto-responses
`

autoResponses.forEach((response) => {
  scriptContent += `after ${response.delay}\n`
  scriptContent += `send "${response.input.replace(/\n/g, '\\r')}"\n`
})

scriptContent += `
# Hand over control to user
interact
EOF
`

writeFileSync(scriptPath, scriptContent, { mode: 0o755 })

console.log('Script generated at:', scriptPath)
console.log('\nScript content:')
console.log('================')
console.log(scriptContent)
console.log('================')
console.log('\nTo test manually, run:')
console.log(`bash ${scriptPath}`)
console.log('\nOr open in iTerm2:')
console.log(`open -a iTerm ${scriptPath}`)