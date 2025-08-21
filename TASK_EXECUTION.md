# Task Execution with Command Line

The Veas CLI now executes actual shell commands when processing tasks. When an execution request is received, the CLI will run `echo "Hello World!"` by default, or execute custom commands based on the task configuration.

## How It Works

### Default Behavior
When any task execution is triggered, if no specific command is configured, the CLI will execute:
```bash
echo "Hello World!"
```

### Task Types and Commands

#### 1. Single Task
- Default: `echo "Hello World!"`
- Configurable via `task.configuration.command` or `inputParams.command`
- Example output:
  ```
  ============================================================
  📋 NEW EXECUTION REQUEST
     Execution ID: exec-123
     Time: 10:30:45 AM
  ============================================================

  Executing single task...
  Running command: echo "Hello World!"
  Output: Hello World!
  
  ✅ TASK EXECUTION COMPLETED SUCCESSFULLY
  ============================================================
  ```

#### 2. Workflow Task
- Executes multiple steps sequentially
- Each step can have its own command
- Default for each step: `echo "Hello World!"`
- Configurable via `step.command` or `inputParams.step{N}_command`

#### 3. Batch Task
- Executes commands for multiple items
- Supports `{{index}}` placeholder for item number
- Default: `echo "Hello World!"` for each item

#### 4. Report Task
- Generates reports using shell commands
- Default: `echo "Hello World! - Report Generated"`
- Configurable via `task.configuration.report_command`

#### 5. Monitoring Task
- Runs monitoring commands and detects alerts
- Default: `echo "Hello World! - System OK"`
- Detects alerts if output contains "error" or "fail"

#### 6. Custom Task
- Fully customizable command execution
- Default: `echo "Hello World!"`
- Configurable via `task.configuration.custom_command` or `task.configuration.command`

### Tool Execution

The CLI can also execute predefined tools. Available tools and their commands:

- `echo`: `echo "Hello World!"`
- `date`: Shows current date/time
- `pwd`: Shows current directory
- `ls`: Lists files (`ls -la`)
- `env`: Shows environment variables (first 5)
- `ping`: Pings google.com once
- `curl`: Fetches a GitHub Zen quote
- `node`: Runs Node.js hello world
- `python`: Runs Python hello world

### Configuration Examples

Tasks can be configured to run specific commands:

```json
{
  "task_type": "single",
  "configuration": {
    "command": "date && echo 'Task executed at this time'"
  }
}
```

```json
{
  "task_type": "workflow",
  "workflow": [
    {
      "name": "Step 1",
      "command": "echo 'Starting workflow...'"
    },
    {
      "name": "Step 2", 
      "command": "date"
    },
    {
      "name": "Step 3",
      "command": "echo 'Workflow complete!'"
    }
  ]
}
```

### Security Notes

- Commands are executed with the permissions of the CLI process
- Be cautious with commands that modify the system
- Consider using sandboxing for untrusted commands
- Validate and sanitize any user-provided commands

### Usage

1. Start the destination watcher:
   ```bash
   npx veas dest watch <destination-id>
   ```

2. When a task is scheduled or triggered, the CLI will:
   - Receive the execution request
   - Fetch task configuration
   - Execute the configured command (or default `echo "Hello World!"`)
   - Log the output to console
   - Update the execution status in the database

### Example Output

```
🔍 Starting schedule monitor...
✅ Schedule monitor started

============================================================
📋 NEW EXECUTION REQUEST
   Execution ID: exec-abc-123
   Time: 10:45:32 AM
============================================================

  Task: Daily Health Check
  Type: monitoring
  Status: active
  Running monitor: echo "Hello World! - System OK"
  Monitor Output: Hello World! - System OK

✅ TASK EXECUTION COMPLETED SUCCESSFULLY
============================================================
```

## Development

To modify the command execution behavior, edit:
- `/src/services/task-executor.ts` - Main execution logic
- `/src/services/schedule-monitor.ts` - Schedule monitoring and triggering

The default command `echo "Hello World!"` ensures that every execution produces visible output, making it easy to verify that the task execution system is working correctly.