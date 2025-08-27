/**
 * Terminal Spawner Service
 *
 * Handles spawning commands in separate terminal windows
 * for better visibility during interactive execution
 */

import { exec } from 'node:child_process'
import { unlinkSync, writeFileSync } from 'node:fs'
import { platform, tmpdir } from 'node:os'
import { join } from 'node:path'
import chalk from 'chalk'

export interface TerminalOptions {
  /** Command to execute */
  command: string
  /** Working directory */
  cwd?: string
  /** Environment variables */
  env?: Record<string, string>
  /** Window title */
  title?: string
  /** Keep terminal open after command exits */
  keepOpen?: boolean
  /** Preferred terminal application (e.g., 'iterm', 'warp', 'alacritty') */
  terminalApp?: string
  /** Auto-responses to send */
  autoResponses?: Array<{
    trigger?: string
    input?: string
    delay?: number
    immediate?: boolean
    closeAfter?: boolean
  }>
}

export type MacTerminalApp = 'terminal' | 'iterm' | 'iterm2' | 'warp' | 'alacritty' | 'kitty' | 'hyper'
export type WindowsTerminalApp = 'cmd' | 'powershell' | 'windowsterminal' | 'wt'
export type LinuxTerminalApp = 'gnome-terminal' | 'konsole' | 'xterm' | 'terminator' | 'alacritty' | 'kitty'

export class TerminalSpawner {
  private platform: string

  constructor() {
    this.platform = platform()
  }

  /**
   * Check if a command is interactive and controls its own session
   */
  private isInteractiveCommand(command: string): boolean {
    const interactivePatterns = [
      /^claude\b/i,
      /^ssh\b/i,
      /^vim?\b/i,
      /^nano\b/i,
      /^emacs\b/i,
      /^less\b/i,
      /^more\b/i,
      /^top\b/i,
      /^htop\b/i,
      /^python\b(?!\s+\S+\.py)/i, // Python REPL, not python script.py
      /^node\b(?!\s+\S+\.js)/i, // Node REPL, not node script.js
      /^irb\b/i,
      /^pry\b/i,
      /^mysql\b/i,
      /^psql\b/i,
      /^redis-cli\b/i,
      /^mongo\b/i,
      /^sqlite3\b/i,
      /^bash\b(?!\s+\S+\.sh)/i, // Interactive bash, not bash script.sh
      /^zsh\b(?!\s+\S+\.sh)/i, // Interactive zsh, not zsh script.sh
      /^sh\b(?!\s+\S+\.sh)/i, // Interactive sh, not sh script.sh
      /docker\s+(exec|run)\s+.*-it/i,
      /^telnet\b/i,
      /^ftp\b/i,
      /^sftp\b/i,
      /^screen\b/i,
      /^tmux\b/i,
      /^watch\b/i,
      /^tail\s+-f/i,
      /^git\s+rebase\s+-i/i,
      /^npm\s+init\b/i,
      /^yarn\s+init\b/i,
      /^npx\s+create-/i,
    ]

    return interactivePatterns.some(pattern => pattern.test(command))
  }

  /**
   * Spawn a command in a new terminal window
   */
  async spawnInNewTerminal(options: TerminalOptions): Promise<{ pid: number; exitCode: number }> {
    console.log(chalk.cyan('🖥️  Opening new terminal window...'))

    switch (this.platform) {
      case 'darwin':
        return this.spawnMacTerminal(options)
      case 'win32':
        return this.spawnWindowsTerminal(options)
      case 'linux':
        return this.spawnLinuxTerminal(options)
      default:
        throw new Error(`Unsupported platform: ${this.platform}`)
    }
  }

  /**
   * Spawn terminal on macOS
   */
  private async spawnMacTerminal(options: TerminalOptions): Promise<{ pid: number; exitCode: number }> {
    const { command, cwd, env, title, keepOpen, autoResponses, terminalApp = 'terminal' } = options

    // Create a temporary script file for complex commands
    const scriptPath = join(tmpdir(), `veas-task-${Date.now()}.sh`)

    let scriptContent = '#!/bin/bash\n'

    // Add environment variables
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        scriptContent += `export ${key}="${value}"\n`
      }
    }

    // Change directory if specified
    if (cwd) {
      scriptContent += `cd "${cwd}"\n`
    }

    // Add title
    scriptContent += `echo -e "\\033]0;${title || 'Veas Task Execution'}\\007"\n`
    scriptContent += `echo ""\n`
    scriptContent += `echo "════════════════════════════════════════════════════════════════"\n`
    scriptContent += `echo "  🚀 VEAS TASK EXECUTION"\n`
    scriptContent += `echo "  📋 Command: ${command}"\n`
    if (autoResponses && autoResponses.length > 0) {
      scriptContent += `echo "  🤖 Auto-responses configured: ${autoResponses.length}"\n`
    }
    scriptContent += `echo "════════════════════════════════════════════════════════════════"\n`
    scriptContent += `echo ""\n`

    // Check if this is an interactive command that controls its own session
    const isInteractiveCommand = this.isInteractiveCommand(command)

    // If auto-responses are configured, create an expect script
    if (autoResponses && autoResponses.length > 0) {
      scriptContent += this.generateExpectScript(command, autoResponses)
    } else if (isInteractiveCommand) {
      // For interactive commands, we need to ensure they run with proper TTY
      // Don't use exec as it might not have proper TTY allocation
      scriptContent += `${command}\n`
      // The terminal will stay open as long as the interactive command is running
    } else {
      // Just run the command directly
      scriptContent += `${command}\n`
    }

    // Only add the "keep open" prompt for non-interactive commands
    // Interactive commands like claude, ssh, vim etc. control their own session
    if (keepOpen && !isInteractiveCommand) {
      scriptContent += `echo ""\n`
      scriptContent += `echo "════════════════════════════════════════════════════════════════"\n`
      scriptContent += `echo "  ✅ Task completed. Press any key to close this window..."\n`
      scriptContent += `echo "════════════════════════════════════════════════════════════════"\n`
      scriptContent += `read -n 1 -s\n`
    } else if (!keepOpen && !isInteractiveCommand) {
      // For non-interactive commands without keepOpen, just exit
      scriptContent += `exit\n`
    }
    // For interactive commands, don't add anything - let them control the session

    // Write script file
    writeFileSync(scriptPath, scriptContent, { mode: 0o755 })

    // Generate AppleScript based on terminal application
    // If we have auto-responses, always use the script (which contains expect)
    // Otherwise, for interactive commands, execute directly
    const shouldUseScript = (autoResponses && autoResponses.length > 0) || !isInteractiveCommand

    const appleScript = this.generateMacTerminalScript(
      terminalApp.toLowerCase(),
      scriptPath,
      title || 'Veas Task',
      command,
      isInteractiveCommand && !shouldUseScript, // Only use direct execution if interactive AND no auto-responses
      cwd || process.cwd(),
    )

    return new Promise((resolve, reject) => {
      // For iTerm2 and some other terminals, we might need to use a different approach
      if (terminalApp.toLowerCase() === 'iterm' || terminalApp.toLowerCase() === 'iterm2') {
        // Always use osascript for iTerm2 to ensure proper command execution
        exec(`osascript -e '${appleScript}'`, error => {
          if (error) {
            console.error(chalk.red('Failed to open iTerm:'), error)
            reject(error)
            return
          }
          console.log(chalk.green('✅ iTerm window opened'))
          // For interactive commands, don't monitor script completion
          // The terminal will stay open as long as the command is running
          if (!isInteractiveCommand) {
            this.monitorScriptCompletion(scriptPath, resolve)
          } else {
            // Return immediately for interactive commands
            resolve({ pid: 0, exitCode: 0 })
          }
        })
      } else if (terminalApp.toLowerCase() === 'warp') {
        // Warp terminal
        exec(`open -a Warp ${scriptPath}`, error => {
          if (error) {
            console.error(chalk.red('Failed to open Warp:'), error)
            reject(error)
            return
          }
          console.log(chalk.green('✅ Warp window opened'))
          this.monitorScriptCompletion(scriptPath, resolve)
        })
      } else if (terminalApp.toLowerCase() === 'alacritty') {
        // Alacritty
        exec(`open -na Alacritty --args -e bash ${scriptPath}`, error => {
          if (error) {
            console.error(chalk.red('Failed to open Alacritty:'), error)
            reject(error)
            return
          }
          console.log(chalk.green('✅ Alacritty window opened'))
          this.monitorScriptCompletion(scriptPath, resolve)
        })
      } else if (terminalApp.toLowerCase() === 'kitty') {
        // Kitty
        exec(`open -na kitty --args bash ${scriptPath}`, error => {
          if (error) {
            console.error(chalk.red('Failed to open Kitty:'), error)
            reject(error)
            return
          }
          console.log(chalk.green('✅ Kitty window opened'))
          this.monitorScriptCompletion(scriptPath, resolve)
        })
      } else if (terminalApp.toLowerCase() === 'hyper') {
        // Hyper
        exec(`open -na Hyper --args bash ${scriptPath}`, error => {
          if (error) {
            console.error(chalk.red('Failed to open Hyper:'), error)
            reject(error)
            return
          }
          console.log(chalk.green('✅ Hyper window opened'))
          this.monitorScriptCompletion(scriptPath, resolve)
        })
      } else {
        // Default Terminal.app or fallback
        exec(`osascript -e '${appleScript}'`, (error, stdout) => {
          if (error) {
            console.error(chalk.red('Failed to open terminal:'), error)
            reject(error)
            return
          }

          const windowId = parseInt(stdout.trim(), 10)
          console.log(chalk.green(`✅ Terminal window opened (ID: ${windowId})`))
          this.monitorScriptCompletion(scriptPath, resolve, windowId)
        })
      }
    })
  }

  /**
   * Generate AppleScript for different terminal applications
   */
  private generateMacTerminalScript(
    app: string,
    scriptPath: string,
    title: string,
    command?: string,
    isInteractive?: boolean,
    cwd?: string,
  ): string {
    switch (app) {
      case 'iterm':
      case 'iterm2': {
        // For interactive commands, execute directly in iTerm2 for proper TTY
        // For non-interactive, run the script
        let executeCommands = ''

        // For interactive commands, we need to cd and run the command
        if (isInteractive && command && cwd) {
          // Create a combined command that changes directory and runs the command
          // Use && to ensure the command only runs if cd succeeds
          const combinedCommand = `cd ${JSON.stringify(cwd)} && ${command}`
          // Escape for AppleScript string
          const escapedCommand = combinedCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
          executeCommands += `write text "${escapedCommand}"`
        } else if (isInteractive && command) {
          // Just the command, no directory change
          const escapedCommand = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
          executeCommands += `write text "${escapedCommand}"`
        } else {
          // Non-interactive - run the script
          executeCommands += `write text "bash ${scriptPath}"`
        }

        return `
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
      }
      default:
        return `
          tell application "Terminal"
            activate
            set newWindow to do script "bash ${scriptPath}"
            set current settings of newWindow to settings set "Pro"
            delay 0.5
            return id of front window
          end tell
        `
    }
  }

  /**
   * Monitor script completion and cleanup
   */
  private monitorScriptCompletion(
    scriptPath: string,
    resolve: (value: { pid: number; exitCode: number }) => void,
    pid: number = 0,
  ): void {
    const checkInterval = setInterval(() => {
      exec(`ps aux | grep -v grep | grep "${scriptPath}"`, (_err, out) => {
        if (!out.trim()) {
          clearInterval(checkInterval)
          // Clean up script file
          try {
            unlinkSync(scriptPath)
          } catch (_e) {
            // Ignore cleanup errors
          }
          resolve({ pid, exitCode: 0 })
        }
      })
    }, 1000)
  }

  /**
   * Spawn terminal on Windows
   */
  private async spawnWindowsTerminal(options: TerminalOptions): Promise<{ pid: number; exitCode: number }> {
    const { command, cwd, env, title, keepOpen, terminalApp = 'cmd' } = options

    // Create a batch file for complex commands
    const scriptPath = join(tmpdir(), `veas-task-${Date.now()}.bat`)

    let scriptContent = '@echo off\n'

    // Set title
    scriptContent += `title ${title || 'Veas Task Execution'}\n`

    // Add environment variables
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        scriptContent += `set ${key}=${value}\n`
      }
    }

    // Change directory if specified
    if (cwd) {
      scriptContent += `cd /d "${cwd}"\n`
    }

    scriptContent += 'echo.\n'
    scriptContent += 'echo ================================================================\n'
    scriptContent += 'echo   VEAS TASK EXECUTION\n'
    scriptContent += `echo   Command: ${command}\n`
    scriptContent += 'echo ================================================================\n'
    scriptContent += 'echo.\n'

    // Run the command
    scriptContent += `${command}\n`

    // Keep terminal open if requested
    if (keepOpen) {
      scriptContent += 'echo.\n'
      scriptContent += 'echo ================================================================\n'
      scriptContent += 'echo   Task completed. Press any key to close this window...\n'
      scriptContent += 'echo ================================================================\n'
      scriptContent += 'pause > nul\n'
    }

    // Write script file
    writeFileSync(scriptPath, scriptContent)

    // Choose terminal command based on preference
    let terminalCmd: string
    switch (terminalApp.toLowerCase()) {
      case 'wt':
      case 'windowsterminal':
        // Windows Terminal
        terminalCmd = `wt new-tab --title "${title || 'Veas Task'}" cmd /c "${scriptPath}"`
        break
      case 'powershell':
        terminalCmd = `start powershell -NoExit -Command "& '${scriptPath}'"`
        break
      default:
        terminalCmd = `start "Veas Task" cmd /c "${scriptPath}"`
        break
    }

    return new Promise((resolve, reject) => {
      exec(terminalCmd, error => {
        if (error) {
          console.error(chalk.red('Failed to open terminal:'), error)
          reject(error)
          return
        }

        console.log(chalk.green('✅ Terminal window opened'))

        // Monitor the script completion
        const checkInterval = setInterval(() => {
          exec(`tasklist | findstr "${scriptPath}"`, (_err, out) => {
            if (!out.trim()) {
              clearInterval(checkInterval)
              // Clean up script file
              try {
                unlinkSync(scriptPath)
              } catch (_e) {
                // Ignore cleanup errors
              }
              resolve({ pid: 0, exitCode: 0 })
            }
          })
        }, 1000)
      })
    })
  }

  /**
   * Spawn terminal on Linux
   */
  private async spawnLinuxTerminal(options: TerminalOptions): Promise<{ pid: number; exitCode: number }> {
    const { command, cwd, env, title, keepOpen, autoResponses, terminalApp } = options

    // Create a script file for complex commands
    const scriptPath = join(tmpdir(), `veas-task-${Date.now()}.sh`)

    let scriptContent = '#!/bin/bash\n'

    // Add environment variables
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        scriptContent += `export ${key}="${value}"\n`
      }
    }

    // Change directory if specified
    if (cwd) {
      scriptContent += `cd "${cwd}"\n`
    }

    scriptContent += 'echo ""\n'
    scriptContent += 'echo "════════════════════════════════════════════════════════════════"\n'
    scriptContent += 'echo "  🚀 VEAS TASK EXECUTION"\n'
    scriptContent += `echo "  📋 Command: ${command}"\n`
    if (autoResponses && autoResponses.length > 0) {
      scriptContent += `echo "  🤖 Auto-responses configured: ${autoResponses.length}"\n`
    }
    scriptContent += 'echo "════════════════════════════════════════════════════════════════"\n'
    scriptContent += 'echo ""\n'

    // If auto-responses are configured, create an expect script
    if (autoResponses && autoResponses.length > 0) {
      scriptContent += this.generateExpectScript(command, autoResponses)
    } else {
      scriptContent += `${command}\n`
    }

    // Keep terminal open if requested
    if (keepOpen) {
      scriptContent += 'echo ""\n'
      scriptContent += 'echo "════════════════════════════════════════════════════════════════"\n'
      scriptContent += 'echo "  ✅ Task completed. Press any key to close this window..."\n'
      scriptContent += 'echo "════════════════════════════════════════════════════════════════"\n'
      scriptContent += 'read -n 1 -s\n'
    }

    // Write script file
    writeFileSync(scriptPath, scriptContent, { mode: 0o755 })

    // Build terminal command based on preference or auto-detect
    let terminals: string[]

    if (terminalApp) {
      // Use specified terminal
      switch (terminalApp.toLowerCase()) {
        case 'gnome-terminal':
          terminals = [`gnome-terminal --title="${title || 'Veas Task'}" -- bash ${scriptPath}`]
          break
        case 'konsole':
          terminals = [`konsole --title "${title || 'Veas Task'}" -e bash ${scriptPath}`]
          break
        case 'xterm':
          terminals = [`xterm -title "${title || 'Veas Task'}" -e bash ${scriptPath}`]
          break
        case 'terminator':
          terminals = [`terminator -T "${title || 'Veas Task'}" -x bash ${scriptPath}`]
          break
        case 'alacritty':
          terminals = [`alacritty --title "${title || 'Veas Task'}" -e bash ${scriptPath}`]
          break
        case 'kitty':
          terminals = [`kitty --title "${title || 'Veas Task'}" bash ${scriptPath}`]
          break
        default:
          terminals = [`${terminalApp} -e bash ${scriptPath}`]
      }
    } else {
      // Try different terminal emulators in order of preference
      terminals = [
        `gnome-terminal --title="${title || 'Veas Task'}" -- bash ${scriptPath}`,
        `konsole --title "${title || 'Veas Task'}" -e bash ${scriptPath}`,
        `xterm -title "${title || 'Veas Task'}" -e bash ${scriptPath}`,
        `x-terminal-emulator -e bash ${scriptPath}`,
      ]
    }

    for (const termCmd of terminals) {
      try {
        return await new Promise((resolve, reject) => {
          exec(termCmd, error => {
            if (error) {
              reject(error)
              return
            }

            console.log(chalk.green('✅ Terminal window opened'))

            // Monitor the script completion
            const checkInterval = setInterval(() => {
              exec(`ps aux | grep -v grep | grep "${scriptPath}"`, (_err, out) => {
                if (!out.trim()) {
                  clearInterval(checkInterval)
                  // Clean up script file
                  try {
                    unlinkSync(scriptPath)
                  } catch (_e) {
                    // Ignore cleanup errors
                  }
                  resolve({ pid: 0, exitCode: 0 })
                }
              })
            }, 1000)
          })
        })
      } catch (_e) {}
    }

    throw new Error('No suitable terminal emulator found')
  }

  /**
   * Generate expect script for auto-responses (Unix-like systems)
   */
  private generateExpectScript(command: string, autoResponses: any[]): string {
    // Create an expect script for auto-responses
    let script = `
# Check if expect is available
if ! command -v expect &> /dev/null; then
  echo "⚠️  'expect' not installed - running without auto-responses"
  ${command}
  exit $?
fi

echo "🤖 Starting with auto-responses..."
echo ""

# Run with expect for auto-responses
expect -c '
set timeout -1
spawn ${command}

# Give the program time to start
sleep 1

# Handle auto-responses
`

    // Process each auto-response
    autoResponses.forEach((response, index) => {
      const escapedInput = response.input
        ? response.input.replace(/\n/g, '\\r').replace(/"/g, '\\"').replace(/'/g, "\\'")
        : '\\r'

      if (response.immediate) {
        // Send immediately after starting
        script += `puts "\\n>>> Sending message immediately..."\n`
        script += `after ${response.delay || 100}\n`
        script += `send "${escapedInput}"\n`
      } else if (response.trigger) {
        // Wait for trigger pattern
        script += `expect {\n`
        script += `  -re "${response.trigger}" {\n`
        script += `    puts "\\n>>> Trigger matched: ${response.trigger}"\n`
        script += `    after ${response.delay || 0}\n`
        script += `    send "${escapedInput}"\n`
        if (response.closeAfter) {
          script += `    send "\\003"\n` // Ctrl+C
          script += `    expect eof\n`
          script += `    exit 0\n`
        } else {
          script += `    exp_continue\n`
        }
        script += `  }\n`
        script += `  timeout {\n`
        script += `    exp_continue\n`
        script += `  }\n`
        script += `  eof {\n`
        script += `    exit 0\n`
        script += `  }\n`
        script += `}\n`
      } else if (response.delay) {
        // Send after delay only
        script += `puts "\\n>>> Waiting ${response.delay}ms before sending message ${index + 1}..."\n`
        script += `after ${response.delay}\n`
        script += `send "${escapedInput}"\n`
        if (response.closeAfter) {
          script += `send "\\003"\n`
          script += `expect eof\n`
          script += `exit 0\n`
        }
      }
    })

    // Keep the session interactive after auto-responses
    script += `
puts "\\n>>> Auto-responses complete. Handing over control..."

# Hand over control to user
interact
'`

    return script
  }

  /**
   * Spawn a command with a companion terminal for monitoring
   */
  async spawnWithCompanion(options: TerminalOptions): Promise<{ mainPid: number; companionPid: number }> {
    console.log(chalk.cyan('🖥️  Opening companion terminal for monitoring...'))

    // First, spawn the companion terminal with monitoring info
    const companionScript = join(tmpdir(), `veas-companion-${Date.now()}.sh`)

    let companionContent = '#!/bin/bash\n'
    companionContent += 'echo "════════════════════════════════════════════════════════════════"\n'
    companionContent += 'echo "  📊 VEAS TASK MONITOR"\n'
    companionContent += `echo "  📋 Monitoring: ${options.command}"\n`
    companionContent += 'echo "  🔄 Status: Running..."\n'
    companionContent += 'echo "════════════════════════════════════════════════════════════════"\n'
    companionContent += 'echo ""\n'
    companionContent += 'echo "Auto-responses will be sent to the main terminal:"\n'

    if (options.autoResponses) {
      options.autoResponses.forEach((r, i) => {
        companionContent += `echo "  ${i + 1}. ${r.trigger ? `On '${r.trigger}' → ` : ''}Send '${r.input?.replace(/\n/g, '\\n')}' (delay: ${r.delay}ms)"\n`
      })
    }

    companionContent += 'echo ""\n'
    companionContent += 'echo "Monitoring output..."\n'
    companionContent += 'echo "────────────────────────────────────────────────────────────────"\n'

    // Tail the log file if we create one
    const logFile = join(tmpdir(), `veas-task-${Date.now()}.log`)
    companionContent += `tail -f ${logFile}\n`

    writeFileSync(companionScript, companionContent, { mode: 0o755 })

    // Spawn companion terminal
    const companionPid = await this.spawnInNewTerminal({
      command: `bash ${companionScript}`,
      title: 'Veas Task Monitor',
      keepOpen: true,
    }).then(r => r.pid)

    // Now spawn the main terminal with the actual command
    const mainPid = await this.spawnInNewTerminal({
      ...options,
      title: options.title || 'Veas Task Execution',
      env: {
        ...options.env,
        VEAS_LOG_FILE: logFile,
      },
    }).then(r => r.pid)

    return { mainPid, companionPid }
  }
}
