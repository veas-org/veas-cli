#!/usr/bin/env node

import { TerminalSpawner } from './dist/services/terminal-spawner.js'

// Create a spawner just to access the private method via reflection
const spawner = new TerminalSpawner()

// Simulate the parameters
const scriptPath = '/var/folders/temp/test-script.sh'
const title = 'Test Claude'
const command = 'claude'
const isInteractiveWithAutoResponses = false // because shouldUseScript = true when autoResponses exist
const cwd = '/Users/marcin/Projects/veas/m9sh/apps/veas-cli'

// Since generateMacTerminalScript is private, let's simulate what it generates
const app = 'iterm2'

let executeCommands = ''

// When shouldUseScript is true (we have auto-responses), isInteractive passed here is false
// So we go to the else branch
if (isInteractiveWithAutoResponses && command && cwd) {
  const combinedCommand = `cd ${JSON.stringify(cwd)} && ${command}`
  const escapedCommand = combinedCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  executeCommands += `write text "${escapedCommand}"`
} else {
  // This is what gets executed when we have auto-responses
  executeCommands += `write text "bash ${scriptPath}"`
}

const appleScript = `
tell application "iTerm"
  activate
  create window with default profile
  tell current session of current window
    ${executeCommands}
    set name to "${title}"
  end tell
  return id of current window
end tell
`

console.log('Generated AppleScript when auto-responses are configured:')
console.log('=========================================================')
console.log(appleScript)
console.log('=========================================================')
console.log('\nThis should execute: bash', scriptPath)
console.log('Which contains the expect script with auto-responses')