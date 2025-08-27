# Auto-Response Guide for Interactive Commands

## Overview

The veas-cli now supports automatic responses to interactive commands, allowing you to automate interactions with tools like Claude, SSH sessions, database clients, and more.

## Features

- **Automatic Input**: Send predefined responses to interactive prompts
- **Pattern Matching**: Trigger responses based on output patterns
- **Configurable Delays**: Set timing for each response
- **Multiple Response Modes**: Immediate, triggered, or delayed responses
- **Session Control**: Automatically close sessions after specific responses

## Configuration Options

### Auto-Response Object Structure

```json
{
  "trigger": "pattern to match",   // Optional regex pattern
  "input": "text to send\n",      // Input to send (default: "\n")
  "delay": 5000,                   // Delay in ms (default: 0)
  "immediate": false,              // Send without waiting for output
  "closeAfter": false              // Close session after this response
}
```

## Usage Examples

### 1. Simple Auto-Continue for Claude

For Claude sessions that might pause and wait for input:

```json
{
  "task_configuration": {
    "command": "claude",
    "autoContinue": true,
    "autoContinueDelay": 15000,
    "autoContinueInput": "continue\n"
  }
}
```

This will automatically send "continue" after 15 seconds of inactivity.

### 2. Multiple Auto-Responses

```json
{
  "task_configuration": {
    "command": "claude",
    "autoResponses": [
      {
        "trigger": "Would you like to proceed",
        "input": "yes\n",
        "delay": 2000
      },
      {
        "trigger": "Press enter to continue",
        "input": "\n",
        "delay": 500
      },
      {
        "delay": 15000,
        "input": "continue\n"
      }
    ]
  }
}
```

### 3. Database Client Automation

```json
{
  "task_configuration": {
    "command": "mysql -u root -p",
    "autoResponses": [
      {
        "trigger": "Enter password:",
        "input": "mypassword\n",
        "delay": 100
      },
      {
        "trigger": "mysql>",
        "input": "USE mydatabase;\n",
        "delay": 500
      },
      {
        "trigger": "Database changed",
        "input": "SELECT COUNT(*) FROM users;\n",
        "delay": 500
      },
      {
        "trigger": "row",
        "input": "exit\n",
        "delay": 1000,
        "closeAfter": true
      }
    ]
  }
}
```

### 4. SSH Session with Commands

```json
{
  "task_configuration": {
    "command": "ssh user@server.com",
    "autoResponses": [
      {
        "trigger": "password:",
        "input": "mysshpassword\n",
        "delay": 100
      },
      {
        "trigger": "\\$",
        "input": "ls -la\n",
        "delay": 1000
      },
      {
        "trigger": "\\$",
        "input": "exit\n",
        "delay": 2000,
        "closeAfter": true
      }
    ]
  }
}
```

### 5. Python REPL Automation

```json
{
  "task_configuration": {
    "command": "python",
    "autoResponses": [
      {
        "trigger": ">>>",
        "input": "import sys\n",
        "delay": 500
      },
      {
        "trigger": ">>>",
        "input": "print(sys.version)\n",
        "delay": 500
      },
      {
        "trigger": ">>>",
        "input": "exit()\n",
        "delay": 1000,
        "closeAfter": true
      }
    ]
  }
}
```

## Special Configuration Shortcuts

### Auto-Continue Mode

Enable simple auto-continue behavior:

```json
{
  "autoContinue": true,              // Enable auto-continue
  "autoContinueDelay": 20000,        // Wait 20 seconds
  "autoContinueInput": "continue\n"  // Send "continue"
}
```

### Claude-Specific Responses

Enable predefined Claude responses:

```json
{
  "command": "claude",
  "autoClaudeResponses": true  // Enables smart Claude responses
}
```

This automatically configures:
- Responds "yes" to confirmation prompts
- Presses Enter for continue prompts
- Sends "continue" after 15 seconds of inactivity

## Input Parameters

You can also pass auto-responses via execution input parameters:

```javascript
// Via API or task execution
{
  "input_params": {
    "command": "claude",
    "autoResponses": [
      {
        "delay": 15000,
        "input": "continue\n"
      }
    ]
  }
}
```

## Interactive Commands Detected

The following commands are automatically detected as interactive:
- `claude` - Claude CLI
- `ssh` - SSH sessions
- `docker exec -it` - Interactive Docker
- `vim`, `vi`, `nano`, `emacs` - Text editors
- `python`, `node`, `irb` - Language REPLs
- `mysql`, `psql`, `redis-cli`, `mongo` - Database clients
- `npm init`, `yarn init` - Interactive initializers
- `git rebase -i` - Interactive git operations

## Testing Auto-Responses

1. Create a test task with auto-responses:
```bash
# Create a task with auto-continue
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Claude Auto Test",
    "command": "claude",
    "configuration": {
      "autoContinue": true,
      "autoContinueDelay": 15000
    }
  }'
```

2. Execute the task and watch the auto-responses:
```bash
# The CLI will show:
# 🤖 Starting auto-interactive session: claude
# ⚡ Auto-response mode - 1 response(s) configured
# 🔄 Detected trigger: "any output"
# ➡️ Sending auto-response: "continue"
```

## Output Capture

When using auto-responses, the system captures all output from the interactive session, unlike traditional interactive mode where output isn't captured. This allows you to:
- Log all interactions
- Parse command outputs
- Verify expected responses
- Debug automation flows

## Best Practices

1. **Test Patterns**: Test your trigger patterns with the actual command output
2. **Use Delays**: Add appropriate delays between responses to avoid overwhelming the target program
3. **Error Handling**: Consider adding responses for error messages
4. **Session Cleanup**: Use `closeAfter` to ensure sessions are properly terminated
5. **Security**: Never hardcode passwords in task configurations - use environment variables or secrets management

## Troubleshooting

### Responses Not Triggering
- Check that your trigger pattern matches the actual output
- Use `.*` as a trigger to match any output
- Increase delay values if responses are sent too quickly

### Session Hangs
- Add a final response with `closeAfter: true`
- Use a timeout response without a trigger as a fallback

### Pattern Matching Issues
- Remember that patterns are regex - escape special characters
- Use simple patterns like `password:` instead of complex ones
- Test patterns with online regex testers

## Example: Complete Claude Automation

```json
{
  "name": "Automated Claude Session",
  "task_type": "single",
  "configuration": {
    "command": "claude",
    "interactive": true,
    "autoResponses": [
      {
        "trigger": "What would you like to do",
        "input": "Write a Python hello world program\n",
        "delay": 1000
      },
      {
        "trigger": "Would you like me to",
        "input": "yes\n",
        "delay": 2000
      },
      {
        "trigger": "Is there anything else",
        "input": "no, exit\n",
        "delay": 2000,
        "closeAfter": true
      },
      {
        "delay": 30000,
        "input": "exit\n",
        "closeAfter": true
      }
    ]
  }
}
```

This configuration:
1. Waits for Claude to ask what to do
2. Requests a Python hello world program
3. Confirms any follow-up questions
4. Exits when done
5. Has a 30-second timeout fallback

## API Integration

Use the auto-response feature when creating executions via API:

```javascript
const execution = await createExecution({
  task_id: 'task-uuid',
  input_params: {
    command: 'claude',
    autoContinue: true,
    autoContinueDelay: 15000,
    autoContinueInput: 'continue\n'
  }
});
```

## Security Considerations

⚠️ **Important**: Never store sensitive information like passwords directly in task configurations. Instead:

1. Use environment variables
2. Use secret management systems
3. Pass sensitive data via secure input parameters
4. Use SSH keys instead of passwords when possible

## Summary

The auto-response feature enables powerful automation of interactive commands while maintaining full control over the interaction flow. It's particularly useful for:
- CI/CD pipelines requiring interactive tools
- Automated testing of CLI applications
- Batch processing with interactive programs
- Scheduled tasks that need user input
- Integration with AI tools like Claude that may pause for input