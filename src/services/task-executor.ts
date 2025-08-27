/**
 * Task Executor Service
 *
 * Handles execution of agent tasks
 */

import { spawn } from 'node:child_process'
import type { SupabaseClient } from '@supabase/supabase-js'
import chalk from 'chalk'
import type { Execution, ExecutionStatus, Task } from '../types/agents.js'
import { TerminalSpawner } from './terminal-spawner.js'

/**
 * Auto-response configuration for interactive commands
 */
interface AutoResponse {
  /** Pattern to match in output before sending response (optional - if not set, responds to any output) */
  trigger?: string
  /** The input to send (defaults to '\n' - Enter key) */
  input?: string
  /** Delay in milliseconds before sending the response (defaults to 0) */
  delay?: number
  /** Send immediately without waiting for output */
  immediate?: boolean
  /** Close the session after sending this response */
  closeAfter?: boolean
}

export class TaskExecutor {
  private supabase: SupabaseClient
  private destinationId: string
  private terminalSpawner: TerminalSpawner
  // private organizationId: string // May be used for organization-specific logic in future

  constructor(supabase: SupabaseClient, destinationId: string, _organizationId: string) {
    this.supabase = supabase
    this.destinationId = destinationId
    this.terminalSpawner = new TerminalSpawner()
    // this.organizationId = organizationId // Store for future use
  }

  /**
   * Execute a task
   */
  async executeTask(executionId: string): Promise<void> {
    console.log(chalk.blue(`\n${'='.repeat(60)}`))
    console.log(chalk.blue(`📋 NEW EXECUTION REQUEST`))
    console.log(chalk.blue(`   Execution ID: ${executionId}`))
    console.log(chalk.blue(`   Time: ${new Date().toLocaleTimeString()}`))
    console.log(chalk.blue(`${'='.repeat(60)}\n`))

    try {
      // Fetch execution details
      const { data: execution, error: execError } = await this.supabase
        .schema('agents')
        .from('executions')
        .select('*, tasks(*)')
        .eq('id', executionId)
        .single()

      if (execError || !execution) {
        console.error(chalk.red('Failed to fetch execution:'), execError)
        return
      }

      const task = execution.tasks as unknown as Task
      if (!task) {
        console.error(chalk.red('Task not found for execution'))
        await this.updateExecutionStatus(executionId, 'failed', {
          error_message: 'Task not found',
        })
        return
      }

      // Claim the execution
      await this.claimExecution(executionId)

      // Update status to running
      await this.updateExecutionStatus(executionId, 'running', {
        started_at: new Date().toISOString(),
      })

      console.log(chalk.gray(`  Task: ${task.name}`))
      console.log(chalk.gray(`  Type: ${task.task_type}`))
      console.log(chalk.gray(`  Status: ${task.status}`))

      // Log input params if provided
      if (execution.input_params && Object.keys(execution.input_params).length > 0) {
        console.log(chalk.gray(`  Input Params:`))
        console.log(
          chalk.gray(
            JSON.stringify(execution.input_params, null, 2)
              .split('\n')
              .map(line => `    ${line}`)
              .join('\n'),
          ),
        )
      }

      // Execute based on task type
      const result = await this.runTaskWorkflow(task, execution.input_params || {})

      // Check if task was spawned in a terminal
      const wasSpawnedInTerminal = result.spawnedInTerminal === true

      if (wasSpawnedInTerminal) {
        // For spawned terminals, mark as "running" since the process continues in another window
        await this.updateExecutionStatus(executionId, 'running', {
          output_result: result,
          duration_ms: Date.now() - new Date(execution.started_at || execution.queued_at).getTime(),
        })

        console.log(chalk.cyan(`\n🖥️  TASK SPAWNED IN ${String(result.terminalApp || 'TERMINAL').toUpperCase()}`))
        console.log(chalk.cyan(`   The task is running interactively in a separate terminal window`))
        console.log(chalk.cyan(`${'='.repeat(60)}\n`))
      } else {
        // Update execution as completed for non-spawned tasks
        await this.updateExecutionStatus(executionId, 'completed', {
          completed_at: new Date().toISOString(),
          output_result: result,
          duration_ms: Date.now() - new Date(execution.started_at || execution.queued_at).getTime(),
        })

        console.log(chalk.green(`\n✅ TASK EXECUTION COMPLETED SUCCESSFULLY`))
        console.log(chalk.green(`${'='.repeat(60)}\n`))
      }
    } catch (error) {
      console.error(chalk.red('Task execution failed:'), error)
      await this.updateExecutionStatus(executionId, 'failed', {
        error_message: error instanceof Error ? error.message : 'Unknown error',
        error_details: { error: String(error) },
        completed_at: new Date().toISOString(),
      })
    }
  }

  /**
   * Claim an execution for this destination
   */
  private async claimExecution(executionId: string): Promise<void> {
    const { error } = await this.supabase
      .schema('agents')
      .from('executions')
      .update({
        destination_id: this.destinationId,
        claimed_at: new Date().toISOString(),
      })
      .eq('id', executionId)
      .is('destination_id', null) // Only claim if not already claimed

    if (error) {
      throw new Error(`Failed to claim execution: ${error.message}`)
    }
  }

  /**
   * Run the task workflow
   */
  private async runTaskWorkflow(task: Task, inputParams: Record<string, unknown>): Promise<Record<string, unknown>> {
    console.log(chalk.gray('  Running task workflow...'))

    // Simulate task execution based on type
    switch (task.task_type) {
      case 'single':
        return this.executeSingleTask(task, inputParams)

      case 'workflow':
        return this.executeWorkflow(task, inputParams)

      case 'batch':
        return this.executeBatchTask(task, inputParams)

      case 'report':
        return this.executeReportTask(task, inputParams)

      case 'monitoring':
        return this.executeMonitoringTask(task, inputParams)

      default:
        return this.executeCustomTask(task, inputParams)
    }
  }

  /**
   * Execute a single task
   */
  private async executeSingleTask(task: Task, inputParams: Record<string, unknown>): Promise<Record<string, unknown>> {
    console.log(chalk.gray('  Executing single task...'))

    // Get command from input params first, then task configuration, then default
    const command = inputParams.command || task.configuration?.command || 'echo "Hello World!"'
    const isInteractive =
      inputParams.interactive === true ||
      task.configuration?.interactive ||
      task.configuration?.execution_mode === 'interactive' ||
      this.isInteractiveCommand(String(command))

    // Check if we should open in a new terminal window
    const openInNewTerminal =
      inputParams.openInNewTerminal === true ||
      task.configuration?.openInNewTerminal === true ||
      (isInteractive && (inputParams.separateTerminal === true || task.configuration?.separateTerminal === true))

    try {
      let output: string | undefined
      let exitCode: number

      if (openInNewTerminal) {
        console.log(chalk.cyan('  🖥️  Opening in new terminal window...'))

        // Extract auto-responses if configured
        const autoResponses = this.extractAutoResponses(task, inputParams)

        // Check if we should use companion mode (two terminals)
        const useCompanion = inputParams.useCompanion === true || task.configuration?.useCompanion === true

        if (useCompanion && autoResponses && autoResponses.length > 0) {
          // Open two terminals: one for execution, one for monitoring
          console.log(chalk.cyan('  📊 Opening companion monitor terminal...'))
          const { mainPid, companionPid } = await this.terminalSpawner.spawnWithCompanion({
            command: String(command),
            cwd: process.cwd(),
            title: task.name,
            keepOpen: inputParams.keepTerminalOpen !== false,
            terminalApp: String(inputParams.terminalApp || task.configuration?.terminalApp || ''),
            autoResponses,
          })

          output = `Task executing in separate terminals (Main PID: ${mainPid}, Monitor PID: ${companionPid})`
          exitCode = 0
        } else {
          // Open single terminal
          const result = await this.terminalSpawner.spawnInNewTerminal({
            command: String(command),
            cwd: process.cwd(),
            title: task.name,
            keepOpen: inputParams.keepTerminalOpen !== false,
            terminalApp: String(inputParams.terminalApp || task.configuration?.terminalApp || ''),
            autoResponses,
          })

          output = `Task executed in separate terminal (PID: ${result.pid})`
          exitCode = result.exitCode
        }
      } else if (isInteractive) {
        console.log(chalk.yellow('  🎮 Task requires interactive execution'))

        // Check for auto-responses in configuration
        const autoResponses = this.extractAutoResponses(task, inputParams)

        // Execute in interactive mode with optional auto-responses
        const result = await this.executeInteractiveCommand(String(command), autoResponses)
        exitCode = result.exitCode
        output = result.output // May have output if auto-response mode was used
      } else {
        // Execute command with real-time stdio streaming
        const result = await this.executeCommandWithStdio(String(command))
        output = result.output
        exitCode = result.exitCode
      }

      // Handle tool execution if specified
      if (task.tools && task.tools.length > 0) {
        console.log(chalk.gray(`\n  Using additional tools: ${task.tools.join(', ')}`))
        await this.executeToolCommands(task.tools)
      }

      return {
        status: exitCode === 0 ? 'success' : 'failed',
        message: openInNewTerminal
          ? `Single task "${task.name}" spawned in ${inputParams.terminalApp || task.configuration?.terminalApp || 'terminal'}`
          : `Single task "${task.name}" completed`,
        command,
        output: output || 'Interactive session - output not captured',
        exitCode,
        interactive: isInteractive,
        spawnedInTerminal: openInNewTerminal,
        terminalApp: openInNewTerminal
          ? inputParams.terminalApp || task.configuration?.terminalApp || 'default'
          : undefined,
        timestamp: new Date().toISOString(),
        input: inputParams,
      }
    } catch (error) {
      console.error(chalk.red('  Command execution failed:'), error)
      throw error
    }
  }

  /**
   * Execute a workflow
   */
  private async executeWorkflow(task: Task, inputParams: Record<string, unknown>): Promise<Record<string, unknown>> {
    console.log(chalk.gray('  Executing workflow...'))

    // Check if workflow is provided in input params, otherwise use task's workflow
    let steps = task.workflow || []

    // If workflow is provided in input params, use it instead
    if (inputParams.workflow && Array.isArray(inputParams.workflow)) {
      console.log(chalk.cyan('  Using workflow from input parameters'))
      steps = inputParams.workflow as any[]
    }

    const results: unknown[] = []

    // If no steps defined, check for single command in input params
    if (steps.length === 0) {
      // Check if there's a command in input params
      if (inputParams.command) {
        console.log(chalk.cyan('  No workflow steps defined, running command from input params'))
        const command = String(inputParams.command)
        const isInteractive = this.isInteractiveCommand(command)

        if (isInteractive) {
          console.log(chalk.yellow('  🎮 Command requires interactive execution'))
          const autoResponses = this.extractAutoResponses(task, inputParams)
          const result = await this.executeInteractiveCommand(command, autoResponses)
          return {
            status: result.exitCode === 0 ? 'success' : 'failed',
            message: `Workflow "${task.name}" completed`,
            command,
            output: result.output || 'Interactive session - output not captured',
            exitCode: result.exitCode,
            interactive: true,
            timestamp: new Date().toISOString(),
          }
        } else {
          const { output, exitCode } = await this.executeCommandWithStdio(command)
          return {
            status: exitCode === 0 ? 'success' : 'failed',
            message: `Workflow "${task.name}" completed`,
            command,
            output,
            exitCode,
            timestamp: new Date().toISOString(),
          }
        }
      }

      console.log(chalk.cyan('  No workflow steps defined, running default command'))
      const { output, exitCode } = await this.executeCommandWithStdio('echo "Hello World!"')
      return {
        status: exitCode === 0 ? 'success' : 'failed',
        message: `Workflow "${task.name}" completed`,
        output,
        exitCode,
        timestamp: new Date().toISOString(),
      }
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      console.log(chalk.blue(`\n  📌 Step ${i + 1}/${steps.length}: ${step.name || 'Unnamed step'}`))

      // Get command from step (check both 'command' and 'params.command' properties)
      const command =
        step.command || step.params?.command || inputParams[`step${i + 1}_command`] || 'echo "Hello World!"'
      const isInteractive =
        step.interactive ||
        step.params?.interactive ||
        step.execution_mode === 'interactive' ||
        this.isInteractiveCommand(String(command))

      try {
        let output: string | undefined
        let exitCode: number

        if (isInteractive) {
          console.log(chalk.yellow('    🎮 Step requires interactive execution'))
          const result = await this.executeInteractiveCommand(String(command))
          exitCode = result.exitCode
          output = undefined
        } else {
          const result = await this.executeCommandWithStdio(String(command))
          output = result.output
          exitCode = result.exitCode
        }

        results.push({
          step: i + 1,
          name: step.name,
          command,
          output: output || 'Interactive session - output not captured',
          exitCode,
          interactive: isInteractive,
          status: exitCode === 0 ? 'completed' : 'failed',
        })

        if (exitCode !== 0) {
          console.error(chalk.red(`  Step ${i + 1} failed with exit code ${exitCode}`))
          throw new Error(`Step ${i + 1} failed`)
        }
      } catch (error) {
        console.error(chalk.red(`  Step ${i + 1} error:`), error)
        results.push({
          step: i + 1,
          name: step.name,
          command,
          error: String(error),
          status: 'failed',
        })
        throw error
      }
    }

    return {
      status: 'success',
      message: `Workflow "${task.name}" completed`,
      steps_completed: steps.length,
      results,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Execute a batch task
   */
  private async executeBatchTask(task: Task, inputParams: Record<string, unknown>): Promise<Record<string, unknown>> {
    console.log(chalk.gray('  Executing batch task...'))

    const batchSize = inputParams.batch_size || 3
    const batchCommand =
      task.configuration?.batch_command || inputParams.batch_command || 'echo "Hello World! Item {{index}}"'

    console.log(chalk.gray(`  Processing batch of ${batchSize} items...`))

    const results = []
    for (let i = 1; i <= Number(batchSize); i++) {
      console.log(chalk.blue(`\n  🔢 Item ${i}/${batchSize}`))
      const command = String(batchCommand).replace('{{index}}', String(i))

      try {
        const { output, exitCode } = await this.executeCommandWithStdio(String(command))
        results.push({ item: i, output, exitCode, status: exitCode === 0 ? 'success' : 'failed' })
      } catch (error) {
        console.error(chalk.red(`  Item ${i} failed`), error)
        results.push({ item: i, error: String(error), status: 'failed' })
      }
    }

    return {
      status: 'success',
      message: `Batch task "${task.name}" completed`,
      items_processed: batchSize,
      results,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Execute a report task
   */
  private async executeReportTask(task: Task, inputParams: Record<string, unknown>): Promise<Record<string, unknown>> {
    console.log(chalk.gray('  Generating report...'))

    const reportCommand =
      task.configuration?.report_command ||
      inputParams.report_command ||
      'echo "Hello World! - Report Generated at $(date)"'

    try {
      const { output, exitCode } = await this.executeCommandWithStdio(String(reportCommand))

      return {
        status: exitCode === 0 ? 'success' : 'failed',
        message: `Report "${task.name}" generated`,
        report_type: inputParams.report_type || 'summary',
        command: reportCommand,
        output,
        exitCode,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      console.error(chalk.red('  Report generation failed:'), error)
      throw error
    }
  }

  /**
   * Execute a monitoring task
   */
  private async executeMonitoringTask(
    task: Task,
    inputParams: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    console.log(chalk.gray('  Running monitoring checks...'))

    const monitorCommand =
      task.configuration?.monitor_command || inputParams.monitor_command || 'echo "Hello World! - System Status: OK"'

    try {
      const { output, exitCode } = await this.executeCommandWithStdio(String(monitorCommand))

      // Simple alert detection based on output
      const alerts =
        output?.toLowerCase().includes('error') || output?.toLowerCase().includes('fail') || exitCode !== 0 ? 1 : 0

      if (alerts > 0) {
        console.log(chalk.red('\n  ⚠️  ALERTS DETECTED!'))
      } else {
        console.log(chalk.green('\n  ✅ All checks passed'))
      }

      return {
        status: exitCode === 0 ? 'success' : 'failed',
        message: `Monitoring task "${task.name}" completed`,
        command: monitorCommand,
        output,
        exitCode,
        checks_performed: 1,
        alerts_triggered: alerts,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      console.error(chalk.red('  Monitor failed:'), error)
      throw error
    }
  }

  /**
   * Execute a custom task
   */
  private async executeCustomTask(task: Task, inputParams: Record<string, unknown>): Promise<Record<string, unknown>> {
    console.log(chalk.gray('  Executing custom task...'))

    const customCommand =
      task.configuration?.custom_command || task.configuration?.command || inputParams.command || 'echo "Hello World!"'
    const isInteractive =
      task.configuration?.interactive ||
      task.configuration?.execution_mode === 'interactive' ||
      this.isInteractiveCommand(String(customCommand))

    // Check if we should open in a new terminal window
    const openInNewTerminal =
      inputParams.openInNewTerminal === true ||
      task.configuration?.openInNewTerminal === true ||
      (isInteractive && (inputParams.separateTerminal === true || task.configuration?.separateTerminal === true))

    try {
      let output: string | undefined
      let exitCode: number

      if (openInNewTerminal) {
        console.log(chalk.cyan('  🖥️  Opening custom task in new terminal window...'))
        const autoResponses = this.extractAutoResponses(task, inputParams)

        const result = await this.terminalSpawner.spawnInNewTerminal({
          command: String(customCommand),
          cwd: process.cwd(),
          title: task.name,
          keepOpen: inputParams.keepTerminalOpen !== false,
          terminalApp: String(inputParams.terminalApp || task.configuration?.terminalApp || ''),
          autoResponses,
        })

        output = `Custom task executed in separate terminal (PID: ${result.pid})`
        exitCode = result.exitCode
      } else if (isInteractive) {
        console.log(chalk.yellow('  🎮 Custom task requires interactive execution'))
        const autoResponses = this.extractAutoResponses(task, inputParams)
        const result = await this.executeInteractiveCommand(String(customCommand), autoResponses)
        exitCode = result.exitCode
        output = result.output
      } else {
        const result = await this.executeCommandWithStdio(String(customCommand))
        output = result.output
        exitCode = result.exitCode
      }

      return {
        status: exitCode === 0 ? 'success' : 'failed',
        message: openInNewTerminal
          ? `Custom task "${task.name}" spawned in ${inputParams.terminalApp || task.configuration?.terminalApp || 'terminal'}`
          : `Custom task "${task.name}" completed`,
        command: customCommand,
        output: output || 'Interactive session - output not captured',
        exitCode,
        interactive: isInteractive,
        spawnedInTerminal: openInNewTerminal,
        terminalApp: openInNewTerminal
          ? inputParams.terminalApp || task.configuration?.terminalApp || 'default'
          : undefined,
        configuration: task.configuration,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      console.error(chalk.red('  Custom task failed:'), error)
      throw error
    }
  }

  /**
   * Execute tool commands
   */
  private async executeToolCommands(tools: string[]): Promise<any[]> {
    const results = []

    for (const tool of tools) {
      console.log(chalk.blue(`\n  🔧 Executing tool: ${tool}`))

      // Map tool names to actual commands
      const toolCommand = this.mapToolToCommand(tool)

      try {
        const { output, exitCode } = await this.executeCommandWithStdio(String(toolCommand))

        results.push({
          tool,
          command: toolCommand,
          output,
          exitCode,
          status: exitCode === 0 ? 'success' : 'failed',
        })
      } catch (error) {
        console.error(chalk.red(`  Tool ${tool} failed:`), error)
        results.push({
          tool,
          command: toolCommand,
          error: String(error),
          status: 'failed',
        })
      }
    }

    return results
  }

  /**
   * Map tool name to command
   */
  private mapToolToCommand(tool: string): string {
    // Map common tools to commands
    const toolMap: Record<string, string> = {
      echo: 'echo "Hello World!"',
      date: 'date',
      pwd: 'pwd',
      ls: 'ls -la',
      env: 'env | head -5',
      ping: 'ping -c 1 google.com',
      curl: 'curl -s https://api.github.com/zen',
      node: 'node -e "console.log(\'Hello from Node.js!\')"',
      python: 'python3 -c "print(\'Hello from Python!\')"',
    }

    return toolMap[tool.toLowerCase()] || `echo "Tool ${tool} executed"`
  }

  /**
   * Extract auto-response configuration from task and input params
   */
  private extractAutoResponses(task: Task, inputParams: Record<string, unknown>): AutoResponse[] | undefined {
    // Check input params first
    if (inputParams.autoResponses && Array.isArray(inputParams.autoResponses)) {
      console.log(
        chalk.cyan(`  📌 Using auto-responses from input params (${inputParams.autoResponses.length} responses)`),
      )
      return inputParams.autoResponses as AutoResponse[]
    }

    // Check task configuration
    if (task.configuration?.autoResponses && Array.isArray(task.configuration.autoResponses)) {
      console.log(
        chalk.cyan(`  📌 Using auto-responses from task config (${task.configuration.autoResponses.length} responses)`),
      )
      return task.configuration.autoResponses as AutoResponse[]
    }

    // Check for simple continue-after-delay pattern (common for Claude)
    if (inputParams.autoContinue || task.configuration?.autoContinue) {
      const delay = Number(inputParams.autoContinueDelay || task.configuration?.autoContinueDelay || 15000)
      const input = String(inputParams.autoContinueInput || task.configuration?.autoContinueInput || 'continue\n')

      console.log(chalk.cyan(`  ⏱️  Auto-continue enabled: will send "${input.trim()}" after ${delay}ms`))

      return [
        {
          delay,
          input,
          immediate: false,
          trigger: undefined, // No trigger - send after delay regardless
        },
      ]
    }

    // Check for Claude-specific auto-response
    const command = String(inputParams.command || task.configuration?.command || '')
    if (
      command.toLowerCase().startsWith('claude') &&
      (inputParams.autoClaudeResponses || task.configuration?.autoClaudeResponses)
    ) {
      // Default Claude auto-responses for common scenarios
      return [
        {
          trigger: 'Would you like to|Do you want to|Shall I',
          input: 'yes\n',
          delay: 2000,
        },
        {
          trigger: 'Press enter to continue|Continue\\?',
          input: '\n',
          delay: 1000,
        },
        {
          // After 15 seconds without a match, send 'continue'
          delay: 15000,
          input: 'continue\n',
          immediate: false,
        },
      ]
    }

    return undefined
  }

  /**
   * Check if a command requires interactive execution
   */
  private isInteractiveCommand(command: string): boolean {
    const interactivePatterns = [
      /^claude\b/i, // Claude CLI
      /^ssh\b/i, // SSH sessions
      /docker\s+exec\s+-it/i, // Interactive Docker
      /docker\s+run\s+.*-it/i, // Interactive Docker run
      /^vim?\b/i, // Vim/Vi editors
      /^nano\b/i, // Nano editor
      /^emacs\b/i, // Emacs editor
      /^python\s*$/i, // Python REPL
      /^node\s*$/i, // Node.js REPL
      /^irb\b/i, // Ruby REPL
      /^mysql\b/i, // MySQL client
      /^psql\b/i, // PostgreSQL client
      /^redis-cli\b/i, // Redis CLI
      /^mongo\b/i, // MongoDB shell
      /npm\s+init\b/i, // NPM interactive init
      /yarn\s+init\b/i, // Yarn interactive init
      /git\s+rebase\s+-i/i, // Interactive git rebase
    ]

    return interactivePatterns.some(pattern => pattern.test(command))
  }

  /**
   * Execute command with full interactive support
   */
  private async executeInteractiveCommand(
    command: string,
    autoResponses?: AutoResponse[],
  ): Promise<{ exitCode: number; output?: string }> {
    // Check if we should use auto-response mode
    const useAutoResponse = autoResponses && autoResponses.length > 0

    if (!useAutoResponse) {
      // Traditional interactive mode - pass control to terminal
      return this.executeInteractiveCommandTraditional(command)
    } else {
      // Auto-response mode - programmatically interact with the command
      return this.executeInteractiveCommandWithAutoResponse(command, autoResponses)
    }
  }

  /**
   * Traditional interactive command execution (pass control to terminal)
   */
  private async executeInteractiveCommandTraditional(command: string): Promise<{ exitCode: number }> {
    return new Promise((resolve, reject) => {
      console.log(chalk.cyan(`  🖥️  Starting interactive session: ${command}`))
      console.log(chalk.gray('  ─'.repeat(50)))
      console.log(chalk.yellow('  ⚡ Interactive mode - connecting to terminal...'))
      console.log(chalk.gray('  ─'.repeat(50)))

      // Use shell to execute the command with full stdio inheritance
      const child = spawn(command, [], {
        shell: true,
        stdio: 'inherit', // Full inheritance for interactive sessions
      })

      // Handle process exit
      child.on('close', code => {
        console.log(chalk.gray('  ─'.repeat(50)))
        if (code === 0) {
          console.log(chalk.green(`  ✓ Interactive session ended successfully (exit code: ${code})`))
        } else {
          console.log(chalk.red(`  ✗ Interactive session ended with error (exit code: ${code})`))
        }
        resolve({ exitCode: code || 0 })
      })

      // Handle errors
      child.on('error', error => {
        console.log(chalk.gray('  ─'.repeat(50)))
        console.error(chalk.red(`  ✗ Interactive session error: ${error.message}`))
        reject(error)
      })
    })
  }

  /**
   * Execute interactive command with auto-response capability
   */
  private async executeInteractiveCommandWithAutoResponse(
    command: string,
    autoResponses: AutoResponse[],
  ): Promise<{ exitCode: number; output?: string }> {
    return new Promise((resolve, reject) => {
      console.log(chalk.cyan(`  🤖 Starting auto-interactive session: ${command}`))
      console.log(chalk.gray('  ─'.repeat(50)))
      console.log(chalk.yellow(`  ⚡ Auto-response mode - ${autoResponses.length} response(s) configured`))

      // Debug: Log the auto-responses configuration
      if (autoResponses.length > 0) {
        console.log(chalk.gray('  📋 Auto-responses configured:'))
        autoResponses.forEach((r, i) => {
          console.log(
            chalk.gray(
              `    ${i + 1}. ${r.immediate ? '[IMMEDIATE] ' : ''}${r.trigger ? `Trigger: "${r.trigger}" → ` : ''}Send: "${(r.input || '\\n').replace(/\n/g, '\\n')}" (delay: ${r.delay || 0}ms)${r.closeAfter ? ' [CLOSE]' : ''}`,
            ),
          )
        })
      }
      console.log(chalk.gray('  ─'.repeat(50)))

      let output = ''
      let currentResponseIndex = 0
      const responseTimeouts: ReturnType<typeof setTimeout>[] = []
      let hasReceivedOutput = false

      // Use shell to execute the command with pipe for stdin
      const child = spawn(command, [], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'], // pipe stdin, stdout, stderr
      })

      console.log(chalk.gray(`  ℹ️  Process started with PID: ${child.pid}`))

      // Set up a timeout to send first response if no output is received
      const initialTimeout = setTimeout(() => {
        if (!hasReceivedOutput && currentResponseIndex < autoResponses.length) {
          const response = autoResponses[currentResponseIndex]
          if (response && !response.trigger) {
            console.log(chalk.magenta(`\n  ⏰ No output received, sending first response without trigger`))
            const input = response.input || '\n'
            console.log(chalk.magenta(`  ➡️  Sending auto-response: "${input.replace(/\n/g, '\\n')}"`))
            child.stdin?.write(input)
            currentResponseIndex++

            if (response.closeAfter) {
              console.log(chalk.yellow(`  ⏹️  Closing session after response...`))
              setTimeout(() => {
                child.kill('SIGINT')
              }, 1000)
            }
          }
        }
      }, 2000) // Wait 2 seconds for initial output

      responseTimeouts.push(initialTimeout)

      // Handle stdout
      child.stdout?.on('data', data => {
        const text = data.toString()
        output += text
        hasReceivedOutput = true
        process.stdout.write(chalk.green('  │ ') + text)

        // Check if we should send an auto-response
        if (currentResponseIndex < autoResponses.length) {
          const response = autoResponses[currentResponseIndex]

          // Check if output matches trigger pattern (if specified)
          if (response && (!response.trigger || text.match(new RegExp(response.trigger)))) {
            console.log(chalk.magenta(`\n  🔄 Detected trigger: "${response.trigger || 'any output'}"`))

            // Schedule the response after the specified delay
            const timeout = setTimeout(() => {
              const input = response.input || '\n' // Default to Enter key
              console.log(chalk.magenta(`  ➡️  Sending auto-response: "${input.replace(/\n/g, '\\n')}"`))
              child.stdin?.write(input)

              if (response.closeAfter) {
                console.log(chalk.yellow(`  ⏹️  Closing session after response...`))
                setTimeout(() => {
                  child.kill('SIGINT')
                }, 1000)
              }
            }, response.delay || 0)

            responseTimeouts.push(timeout)
            currentResponseIndex++
          }
        }
      })

      // Handle stderr
      child.stderr?.on('data', data => {
        const text = data.toString()
        output += text
        hasReceivedOutput = true
        process.stderr.write(chalk.yellow('  ⚠ ') + text)

        // Also check stderr for triggers (some programs output to stderr)
        if (currentResponseIndex < autoResponses.length) {
          const response = autoResponses[currentResponseIndex]

          if (response && (!response.trigger || text.match(new RegExp(response.trigger)))) {
            console.log(chalk.magenta(`\n  🔄 Detected trigger in stderr: "${response.trigger || 'any output'}"`))

            const timeout = setTimeout(() => {
              const input = response.input || '\n'
              console.log(chalk.magenta(`  ➡️  Sending auto-response: "${input.replace(/\n/g, '\\n')}"`))
              child.stdin?.write(input)

              if (response.closeAfter) {
                console.log(chalk.yellow(`  ⏹️  Closing session after response...`))
                setTimeout(() => {
                  child.kill('SIGINT')
                }, 1000)
              }
            }, response.delay || 0)

            responseTimeouts.push(timeout)
            currentResponseIndex++
          }
        }
      })

      // Handle process exit
      child.on('close', code => {
        // Clear any pending timeouts
        for (const timeout of responseTimeouts) {
          clearTimeout(timeout)
        }

        console.log(chalk.gray('  ─'.repeat(50)))
        if (code === 0) {
          console.log(chalk.green(`  ✓ Auto-interactive session ended successfully (exit code: ${code})`))
        } else {
          console.log(chalk.red(`  ✗ Auto-interactive session ended with error (exit code: ${code})`))
        }
        resolve({ exitCode: code || 0, output: output.trim() })
      })

      // Handle errors
      child.on('error', error => {
        // Clear any pending timeouts
        for (const timeout of responseTimeouts) {
          clearTimeout(timeout)
        }

        console.log(chalk.gray('  ─'.repeat(50)))
        console.error(chalk.red(`  ✗ Auto-interactive session error: ${error.message}`))
        reject(error)
      })

      // Process auto-responses
      const processNextResponse = () => {
        if (currentResponseIndex >= autoResponses.length) return

        const response = autoResponses[currentResponseIndex]
        if (!response) return

        // Handle immediate responses
        if (response.immediate) {
          const timeout = setTimeout(() => {
            const input = response.input || '\n'
            console.log(chalk.magenta(`  ➡️  Sending immediate auto-response: "${input.replace(/\n/g, '\\n')}"`))
            child.stdin?.write(input)
            currentResponseIndex++
            processNextResponse() // Process next response

            if (response.closeAfter) {
              console.log(chalk.yellow(`  ⏹️  Closing session after response...`))
              setTimeout(() => {
                child.kill('SIGINT')
              }, 1000)
            }
          }, response.delay || 100)
          responseTimeouts.push(timeout)
        }
        // Handle delay-only responses (no trigger required)
        else if (!response.trigger && response.delay) {
          const timeout = setTimeout(() => {
            const input = response.input || '\n'
            console.log(
              chalk.magenta(`  ⏱️  Sending delayed auto-response (no trigger): "${input.replace(/\n/g, '\\n')}"`),
            )
            child.stdin?.write(input)
            currentResponseIndex++
            processNextResponse() // Process next response

            if (response.closeAfter) {
              console.log(chalk.yellow(`  ⏹️  Closing session after response...`))
              setTimeout(() => {
                child.kill('SIGINT')
              }, 1000)
            }
          }, response.delay)
          responseTimeouts.push(timeout)
        }
      }

      // Start processing responses
      processNextResponse()
    })
  }

  /**
   * Execute command with real-time stdio streaming
   */
  private async executeCommandWithStdio(command: string): Promise<{ output: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      console.log(chalk.cyan(`  📟 Executing: ${command}`))
      console.log(chalk.gray('  ─'.repeat(30)))

      let output = ''

      // Use shell to execute the command
      const child = spawn(command, [], {
        shell: true,
        stdio: ['inherit', 'pipe', 'pipe'],
      })

      // Stream stdout in real-time
      child.stdout?.on('data', data => {
        const text = data.toString()
        output += text
        // Write directly to process stdout for real-time display
        process.stdout.write(chalk.green('  │ ') + text)
      })

      // Stream stderr in real-time
      child.stderr?.on('data', data => {
        const text = data.toString()
        output += text
        // Write directly to process stderr for real-time display
        process.stderr.write(chalk.yellow('  ⚠ ') + text)
      })

      // Handle process exit
      child.on('close', code => {
        console.log(chalk.gray('  ─'.repeat(30)))
        if (code === 0) {
          console.log(chalk.green(`  ✓ Command completed successfully (exit code: ${code})`))
        } else {
          console.log(chalk.red(`  ✗ Command failed (exit code: ${code})`))
        }
        resolve({ output: output.trim(), exitCode: code || 0 })
      })

      // Handle errors
      child.on('error', error => {
        console.log(chalk.gray('  ─'.repeat(30)))
        console.error(chalk.red(`  ✗ Command error: ${error.message}`))
        reject(error)
      })
    })
  }

  /**
   * Update execution status
   */
  private async updateExecutionStatus(
    executionId: string,
    status: ExecutionStatus,
    updates: Partial<Execution> = {},
  ): Promise<void> {
    const { error } = await this.supabase
      .schema('agents')
      .from('executions')
      .update({
        status,
        ...updates,
      })
      .eq('id', executionId)

    if (error) {
      console.error(chalk.red(`Failed to update execution status: ${error.message}`))
    }
  }

  /**
   * Handle tool calls
   */
  async handleToolCalls(tools: string[]): Promise<any[]> {
    console.log(chalk.gray(`  Handling ${tools.length} tool calls...`))

    if (tools.length === 0) {
      return []
    }

    return this.executeToolCommands(tools)
  }
}
