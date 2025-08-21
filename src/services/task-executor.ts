/**
 * Task Executor Service
 * 
 * Handles execution of agent tasks
 */

import { spawn } from 'node:child_process'
import type { SupabaseClient } from '@supabase/supabase-js'
import chalk from 'chalk'
import type { Execution, ExecutionStatus, Task } from '../types/agents.js'

export class TaskExecutor {
  private supabase: SupabaseClient
  private destinationId: string
  // private organizationId: string // May be used for organization-specific logic in future

  constructor(
    supabase: SupabaseClient,
    destinationId: string,
    _organizationId: string
  ) {
    this.supabase = supabase
    this.destinationId = destinationId
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
          error_message: 'Task not found'
        })
        return
      }

      // Claim the execution
      await this.claimExecution(executionId)

      // Update status to running
      await this.updateExecutionStatus(executionId, 'running', {
        started_at: new Date().toISOString()
      })

      console.log(chalk.gray(`  Task: ${task.name}`))
      console.log(chalk.gray(`  Type: ${task.task_type}`))
      console.log(chalk.gray(`  Status: ${task.status}`))

      // Execute based on task type
      const result = await this.runTaskWorkflow(task, execution.input_params || {})

      // Update execution as completed
      await this.updateExecutionStatus(executionId, 'completed', {
        completed_at: new Date().toISOString(),
        output_result: result,
        duration_ms: Date.now() - new Date(execution.started_at || execution.queued_at).getTime()
      })

      console.log(chalk.green(`\n✅ TASK EXECUTION COMPLETED SUCCESSFULLY`))
      console.log(chalk.green(`${'='.repeat(60)}\n`))
    } catch (error) {
      console.error(chalk.red('Task execution failed:'), error)
      await this.updateExecutionStatus(executionId, 'failed', {
        error_message: error instanceof Error ? error.message : 'Unknown error',
        error_details: { error: String(error) },
        completed_at: new Date().toISOString()
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
        claimed_at: new Date().toISOString()
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
  private async runTaskWorkflow(
    task: Task,
    inputParams: Record<string, any>
  ): Promise<Record<string, any>> {
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
  private async executeSingleTask(
    task: Task,
    inputParams: Record<string, any>
  ): Promise<Record<string, any>> {
    console.log(chalk.gray('  Executing single task...'))
    
    // Get command from task configuration or use default
    const command = task.configuration?.command || inputParams.command || 'echo "Hello World!"'
    
    try {
      // Execute command with real-time stdio streaming
      const { output, exitCode } = await this.executeCommandWithStdio(command)
      
      // Handle tool execution if specified
      if (task.tools && task.tools.length > 0) {
        console.log(chalk.gray(`\n  Using additional tools: ${task.tools.join(', ')}`))
        await this.executeToolCommands(task.tools)
      }
      
      return {
        status: exitCode === 0 ? 'success' : 'failed',
        message: `Single task "${task.name}" completed`,
        command,
        output,
        exitCode,
        timestamp: new Date().toISOString(),
        input: inputParams
      }
    } catch (error) {
      console.error(chalk.red('  Command execution failed:'), error)
      throw error
    }
  }

  /**
   * Execute a workflow
   */
  private async executeWorkflow(
    task: Task,
    inputParams: Record<string, any>
  ): Promise<Record<string, any>> {
    console.log(chalk.gray('  Executing workflow...'))
    
    const steps = task.workflow || []
    const results: any[] = []

    // If no steps defined, run default command
    if (steps.length === 0) {
      console.log(chalk.cyan('  No workflow steps defined, running default command'))
      const { output, exitCode } = await this.executeCommandWithStdio('echo "Hello World!"')
      return {
        status: exitCode === 0 ? 'success' : 'failed',
        message: `Workflow "${task.name}" completed`,
        output,
        exitCode,
        timestamp: new Date().toISOString()
      }
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      console.log(chalk.blue(`\n  📌 Step ${i + 1}/${steps.length}: ${step.name || 'Unnamed step'}`))
      
      // Get command from step or use default
      const command = step.command || inputParams[`step${i + 1}_command`] || 'echo "Hello World!"'
      
      try {
        const { output, exitCode } = await this.executeCommandWithStdio(command)
        
        results.push({
          step: i + 1,
          name: step.name,
          command,
          output,
          exitCode,
          status: exitCode === 0 ? 'completed' : 'failed'
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
          status: 'failed'
        })
        throw error
      }
    }

    return {
      status: 'success',
      message: `Workflow "${task.name}" completed`,
      steps_completed: steps.length,
      results,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Execute a batch task
   */
  private async executeBatchTask(
    task: Task,
    inputParams: Record<string, any>
  ): Promise<Record<string, any>> {
    console.log(chalk.gray('  Executing batch task...'))
    
    const batchSize = inputParams.batch_size || 3
    const batchCommand = task.configuration?.batch_command || inputParams.batch_command || 'echo "Hello World! Item {{index}}"'
    
    console.log(chalk.gray(`  Processing batch of ${batchSize} items...`))
    
    const results = []
    for (let i = 1; i <= batchSize; i++) {
      console.log(chalk.blue(`\n  🔢 Item ${i}/${batchSize}`))
      const command = batchCommand.replace('{{index}}', String(i))
      
      try {
        const { output, exitCode } = await this.executeCommandWithStdio(command)
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
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Execute a report task
   */
  private async executeReportTask(
    task: Task,
    inputParams: Record<string, any>
  ): Promise<Record<string, any>> {
    console.log(chalk.gray('  Generating report...'))
    
    const reportCommand = task.configuration?.report_command || inputParams.report_command || 'echo "Hello World! - Report Generated at $(date)"'
    
    try {
      const { output, exitCode } = await this.executeCommandWithStdio(reportCommand)
      
      return {
        status: exitCode === 0 ? 'success' : 'failed',
        message: `Report "${task.name}" generated`,
        report_type: inputParams.report_type || 'summary',
        command: reportCommand,
        output,
        exitCode,
        timestamp: new Date().toISOString()
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
    inputParams: Record<string, any>
  ): Promise<Record<string, any>> {
    console.log(chalk.gray('  Running monitoring checks...'))
    
    const monitorCommand = task.configuration?.monitor_command || inputParams.monitor_command || 'echo "Hello World! - System Status: OK"'
    
    try {
      const { output, exitCode } = await this.executeCommandWithStdio(monitorCommand)
      
      // Simple alert detection based on output
      const alerts = output?.toLowerCase().includes('error') || 
                     output?.toLowerCase().includes('fail') || 
                     exitCode !== 0 ? 1 : 0
      
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
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error(chalk.red('  Monitor failed:'), error)
      throw error
    }
  }

  /**
   * Execute a custom task
   */
  private async executeCustomTask(
    task: Task,
    inputParams: Record<string, any>
  ): Promise<Record<string, any>> {
    console.log(chalk.gray('  Executing custom task...'))
    
    const customCommand = task.configuration?.custom_command || 
                         task.configuration?.command || 
                         inputParams.command || 
                         'echo "Hello World!"'
    
    try {
      const { output, exitCode } = await this.executeCommandWithStdio(customCommand)
      
      return {
        status: exitCode === 0 ? 'success' : 'failed',
        message: `Custom task "${task.name}" completed`,
        command: customCommand,
        output,
        exitCode,
        configuration: task.configuration,
        timestamp: new Date().toISOString()
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
        const { output, exitCode } = await this.executeCommandWithStdio(toolCommand)
        
        results.push({
          tool,
          command: toolCommand,
          output,
          exitCode,
          status: exitCode === 0 ? 'success' : 'failed'
        })
      } catch (error) {
        console.error(chalk.red(`  Tool ${tool} failed:`), error)
        results.push({
          tool,
          command: toolCommand,
          error: String(error),
          status: 'failed'
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
      'echo': 'echo "Hello World!"',
      'date': 'date',
      'pwd': 'pwd',
      'ls': 'ls -la',
      'env': 'env | head -5',
      'ping': 'ping -c 1 google.com',
      'curl': 'curl -s https://api.github.com/zen',
      'node': 'node -e "console.log(\'Hello from Node.js!\')"',
      'python': 'python3 -c "print(\'Hello from Python!\')"',
    }
    
    return toolMap[tool.toLowerCase()] || `echo "Tool ${tool} executed"`
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
        stdio: ['inherit', 'pipe', 'pipe']
      })

      // Stream stdout in real-time
      child.stdout?.on('data', (data) => {
        const text = data.toString()
        output += text
        // Write directly to process stdout for real-time display
        process.stdout.write(chalk.green('  │ ') + text)
      })

      // Stream stderr in real-time
      child.stderr?.on('data', (data) => {
        const text = data.toString()
        output += text
        // Write directly to process stderr for real-time display
        process.stderr.write(chalk.yellow('  ⚠ ') + text)
      })

      // Handle process exit
      child.on('close', (code) => {
        console.log(chalk.gray('  ─'.repeat(30)))
        if (code === 0) {
          console.log(chalk.green(`  ✓ Command completed successfully (exit code: ${code})`))
        } else {
          console.log(chalk.red(`  ✗ Command failed (exit code: ${code})`))
        }
        resolve({ output: output.trim(), exitCode: code || 0 })
      })

      // Handle errors
      child.on('error', (error) => {
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
    updates: Partial<Execution> = {}
  ): Promise<void> {
    const { error } = await this.supabase
      .schema('agents')
      .from('executions')
      .update({
        status,
        ...updates
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