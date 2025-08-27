# Interactive Task Execution with Auto-Responses and Terminal Spawning

## Overview

The TaskExecutor in veas-cli supports interactive command execution with automatic response capabilities and the ability to spawn commands in separate terminal windows. This feature is particularly useful for:
- Automating interactions with CLI tools like Claude, SSH sessions, or any command that requires user input
- Maintaining visibility of both the executing process and the monitoring console
- Running long-running interactive sessions without blocking the main terminal

## Features

### 1. Interactive Command Detection

The system automatically detects commands that require interactive execution:

- **Claude CLI**: `claude`
- **SSH Sessions**: `ssh user@host`
- **Docker Interactive**: `docker exec -it`, `docker run -it`
- **Text Editors**: `vim`, `vi`, `nano`, `emacs`
- **REPLs**: `python`, `node`, `irb`
- **Database Clients**: `mysql`, `psql`, `redis-cli`, `mongo`
- **Package Managers**: `npm init`, `yarn init`
- **Git Interactive**: `git rebase -i`

When an interactive command is detected, the executor:
- Uses `stdio: 'inherit'` for manual interaction (default)
- Switches to `stdio: ['pipe', 'pipe', 'pipe']` when auto-responses are configured

### 2. Auto-Response Configuration

Auto-responses can be configured via `input_params.autoResponses` or `task.configuration.autoResponses`:

```javascript
{
  "command": "claude",
  "autoResponses": [
    {
      "trigger": "Would you like to",  // Regex pattern to match in output
      "input": "yes\n",                 // Response to send
      "delay": 2000,                    // Delay in ms before sending
      "immediate": false,               // Send immediately without waiting
      "closeAfter": false              // Close session after sending
    },
    {
      "delay": 15000,                  // Send after delay (no trigger)
      "input": "continue\n"
    }
  ]
}
```

### 3. Auto-Response Types

#### Pattern-Based Triggers
Responds when output matches a regex pattern:
```javascript
{
  "trigger": "Would you like to|Do you want to",
  "input": "yes\n",
  "delay": 1000
}
```

#### Delay-Only Responses
Sends response after a timeout, regardless of output:
```javascript
{
  "delay": 15000,
  "input": "continue\n"
}
```

#### Immediate Responses
Sends response immediately on session start:
```javascript
{
  "immediate": true,
  "input": "start\n",
  "delay": 100
}
```

#### Session Termination
Closes the session after sending response:
```javascript
{
  "input": "exit\n",
  "closeAfter": true
}
```

### 4. Claude-Specific Support

When `autoClaudeResponses` is enabled, the system applies default patterns for common Claude interactions:

```javascript
{
  "command": "claude",
  "configuration": {
    "autoClaudeResponses": true
  }
}
```

Default Claude responses:
- "Would you like to..." → "yes\n"
- "Continue?" → "\n" (Enter)
- After 15 seconds of no match → "continue\n"

## Terminal Spawning Features

### 1. Separate Terminal Window

Open commands in a new terminal window for better visibility:

```javascript
{
  "input_params": {
    "command": "claude",
    "openInNewTerminal": true,
    "keepTerminalOpen": true
  }
}
```

### 2. Companion Monitor Terminal

Open two terminals - one for execution, one for monitoring:

```javascript
{
  "input_params": {
    "command": "claude",
    "openInNewTerminal": true,
    "useCompanion": true,
    "autoResponses": [...]
  }
}
```

### 3. Platform Support

The terminal spawner supports:
- **macOS**: Terminal.app with AppleScript
- **Windows**: cmd.exe with batch scripts
- **Linux**: gnome-terminal, konsole, xterm, or x-terminal-emulator

### 4. Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `openInNewTerminal` | Open command in separate terminal | `false` |
| `separateTerminal` | Alternative flag for separate terminal | `false` |
| `useCompanion` | Open companion monitor terminal | `false` |
| `keepTerminalOpen` | Keep terminal open after completion | `true` for interactive |

## Implementation Details

### Detection Logic

The `isInteractiveCommand()` method uses regex patterns to identify interactive commands:

```typescript
private isInteractiveCommand(command: string): boolean {
  const interactivePatterns = [
    /^claude\b/i,
    /^ssh\b/i,
    /docker\s+exec\s+-it/i,
    // ... more patterns
  ]
  return interactivePatterns.some(pattern => pattern.test(command))
}
```

### Auto-Response Execution

When auto-responses are configured:

1. **Process Creation**: Spawns with piped stdio for programmatic control
2. **Output Monitoring**: Listens to both stdout and stderr
3. **Pattern Matching**: Checks output against trigger patterns
4. **Response Timing**: Respects configured delays
5. **Response Sending**: Writes to stdin when conditions are met

### Code Flow

```typescript
// Extract auto-responses from configuration
const autoResponses = this.extractAutoResponses(task, inputParams)

if (autoResponses && autoResponses.length > 0) {
  // Use auto-response mode with piped stdio
  return this.executeInteractiveCommandWithAutoResponse(command, autoResponses)
} else {
  // Traditional interactive mode with inherited stdio
  return this.executeInteractiveCommandTraditional(command)
}
```

## Usage Examples

### Example 1: Claude with Auto-Confirmation

```javascript
{
  "task_type": "single",
  "name": "Claude Analysis",
  "input_params": {
    "command": "claude",
    "autoResponses": [
      {
        "trigger": "Would you like to",
        "input": "yes\n",
        "delay": 2000
      },
      {
        "delay": 15000,
        "input": "continue\n"
      }
    ]
  }
}
```

### Example 2: SSH with Auto-Login

```javascript
{
  "task_type": "single",
  "name": "SSH Deployment",
  "input_params": {
    "command": "ssh deploy@server.com",
    "autoResponses": [
      {
        "trigger": "password:",
        "input": "${SSH_PASSWORD}\n",
        "delay": 500
      },
      {
        "trigger": "\\$ ",
        "input": "cd /app && ./deploy.sh\n",
        "delay": 1000
      },
      {
        "delay": 5000,
        "input": "exit\n",
        "closeAfter": true
      }
    ]
  }
}
```

### Example 3: Claude with Companion Terminal

```javascript
{
  "task_type": "single",
  "name": "Claude with Monitor",
  "input_params": {
    "command": "claude",
    "openInNewTerminal": true,
    "useCompanion": true,
    "keepTerminalOpen": true,
    "autoResponses": [
      {
        "trigger": "Would you like to",
        "input": "yes\n",
        "delay": 2000
      },
      {
        "delay": 15000,
        "input": "continue\n"
      }
    ]
  }
}
```

This configuration will:
1. Open a main terminal window running Claude
2. Open a companion monitor terminal showing the task status
3. Automatically respond to prompts based on patterns
4. Keep both terminals open after completion

### Example 4: Workflow with Mixed Steps

```javascript
{
  "task_type": "workflow",
  "workflow": [
    {
      "name": "Setup",
      "command": "echo 'Starting deployment'"
    },
    {
      "name": "Interactive Deploy",
      "command": "claude",
      "interactive": true,
      "params": {
        "autoResponses": [
          {
            "trigger": "Proceed\\?",
            "input": "y\n"
          }
        ]
      }
    },
    {
      "name": "Cleanup",
      "command": "echo 'Deployment complete'"
    }
  ]
}
```

## Testing

The feature has been tested with:
- ✅ Pattern-based triggers
- ✅ Multiple sequential responses
- ✅ Delay-based responses
- ✅ Immediate responses
- ✅ Session termination flags
- ✅ Both stdout and stderr monitoring
- ✅ Workflow integration
- ✅ Error handling

Test files:
- `src/services/task-executor.test.ts` - Unit tests
- `src/services/task-executor-interactive.test.ts` - Interactive feature tests
- `test-auto-response.js` - Integration test
- `examples/test-interactive-claude.js` - End-to-end example

## Best Practices

1. **Use Specific Triggers**: Make trigger patterns specific to avoid false matches
2. **Add Delays**: Include small delays between responses for stability
3. **Test Patterns**: Test regex patterns against actual command output
4. **Handle Errors**: Include responses for error scenarios
5. **Use CloseAfter**: Properly terminate sessions to avoid hanging processes
6. **Monitor Both Streams**: Some commands output to stderr instead of stdout

## Troubleshooting

### Issue: Auto-response not triggering
- Check if the trigger pattern matches the exact output
- Verify the command is detected as interactive
- Ensure auto-responses are properly configured

### Issue: Process hangs
- Add a closeAfter flag to terminate the session
- Use delay-only responses as fallbacks
- Set appropriate timeout values

### Issue: Responses sent too quickly
- Increase the delay value
- Use pattern-based triggers instead of immediate responses

## Security Considerations

- **Never hardcode sensitive data** in auto-responses
- Use environment variables for passwords/tokens
- Validate input patterns to prevent injection
- Limit auto-response usage to trusted commands
- Review logs to ensure no sensitive data is exposed