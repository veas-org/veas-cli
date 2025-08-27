/**
 * TypeScript Example: Claude Workflow with Auto-Responses
 * 
 * This example demonstrates how to create and execute Claude workflows
 * with proper TypeScript typing and auto-response configurations
 */

import type { Task, TaskType, TaskStatus, Execution } from '../src/types/agents'

/**
 * Auto-Response Configuration
 */
interface AutoResponse {
  /** Pattern to match in output before sending response */
  trigger?: string
  /** The input to send (defaults to '\n' - Enter key) */
  input?: string
  /** Delay in milliseconds before sending the response */
  delay?: number
  /** Send immediately without waiting for output */
  immediate?: boolean
  /** Close the session after sending this response */
  closeAfter?: boolean
}

/**
 * Task Configuration with Auto-Response Support
 */
interface TaskConfiguration {
  command?: string
  interactive?: boolean
  execution_mode?: 'interactive' | 'batch' | 'streaming'
  
  // Auto-response options
  autoResponses?: AutoResponse[]
  autoContinue?: boolean
  autoContinueDelay?: number
  autoContinueInput?: string
  autoClaudeResponses?: boolean
  
  // Workflow specific
  workflow?: WorkflowStep[]
}

interface WorkflowStep {
  name: string
  command: string
  autoResponses?: AutoResponse[]
  timeout?: number
}

/**
 * Example 1: Simple Claude Task with Auto-Continue
 */
const createSimpleClaudeTask = (): Partial<Task> => ({
  name: 'Claude Assistant with Auto-Continue',
  description: 'A Claude session that automatically continues if it pauses',
  task_type: 'single' as TaskType,
  status: 'active' as TaskStatus,
  configuration: {
    command: 'claude',
    interactive: true,
    autoContinue: true,
    autoContinueDelay: 15000, // 15 seconds
    autoContinueInput: 'continue\n'
  } as TaskConfiguration,
  max_retries: 1,
  timeout_seconds: 300, // 5 minutes
  tags: ['claude', 'ai', 'interactive', 'auto-continue']
})

/**
 * Example 2: Code Review Workflow
 */
const createCodeReviewWorkflow = (codeToReview: string): Partial<Task> => ({
  name: 'Automated Code Review',
  description: 'Automated code review with Claude',
  task_type: 'single' as TaskType,
  status: 'active' as TaskStatus,
  configuration: {
    command: 'claude',
    interactive: true,
    autoResponses: [
      {
        trigger: 'How can I help|What would you like',
        input: `Please review this code for best practices, performance, and potential bugs:\n\n${codeToReview}\n`,
        delay: 1000
      },
      {
        trigger: 'Would you like me to|Should I also',
        input: 'yes, please provide a refactored version\n',
        delay: 2000
      },
      {
        trigger: 'Is there anything else|Would you like to',
        input: 'Can you also suggest unit tests for this code?\n',
        delay: 3000
      },
      {
        // Continue if Claude pauses mid-response
        delay: 20000,
        input: 'continue\n'
      },
      {
        trigger: 'complete|finished|Is there anything else',
        input: 'That\'s perfect, thank you! exit\n',
        delay: 3000,
        closeAfter: true
      }
    ] as AutoResponse[]
  } as TaskConfiguration,
  max_retries: 1,
  timeout_seconds: 600,
  tags: ['code-review', 'claude', 'automated']
})

/**
 * Example 3: Full Development Workflow
 */
const createFullStackWorkflow = (projectSpecs: string): Partial<Task> => ({
  name: 'Full Stack Development Assistant',
  description: 'Complete development workflow with Claude',
  task_type: 'workflow' as TaskType,
  status: 'active' as TaskStatus,
  configuration: {
    workflow: [
      {
        name: 'Design Database Schema',
        command: 'claude',
        autoResponses: [
          {
            immediate: true,
            input: `Design a PostgreSQL database schema for: ${projectSpecs}\n`,
            delay: 500
          },
          {
            delay: 20000,
            input: 'continue\n'
          },
          {
            trigger: 'Is this|Would you like',
            input: 'yes, now create the SQL migration files\n',
            delay: 3000
          },
          {
            delay: 20000,
            input: 'continue\n'
          },
          {
            trigger: 'complete|Is there anything',
            input: 'perfect, exit\n',
            delay: 2000,
            closeAfter: true
          }
        ]
      },
      {
        name: 'Generate Backend API',
        command: 'claude',
        autoResponses: [
          {
            immediate: true,
            input: `Create a Node.js/Express REST API with TypeScript based on the database schema you just designed\n`,
            delay: 500
          },
          {
            delay: 25000,
            input: 'continue\n'
          },
          {
            trigger: 'Would you like|Should I include',
            input: 'yes, include authentication middleware\n',
            delay: 3000
          },
          {
            delay: 20000,
            input: 'continue\n'
          },
          {
            trigger: 'complete|finished',
            input: 'excellent, exit\n',
            delay: 2000,
            closeAfter: true
          }
        ]
      },
      {
        name: 'Generate Frontend',
        command: 'claude',
        autoResponses: [
          {
            immediate: true,
            input: 'Create React components with TypeScript that consume the API you just created. Use React Query for data fetching and Tailwind for styling\n',
            delay: 500
          },
          {
            delay: 30000,
            input: 'continue\n'
          },
          {
            trigger: 'Would you like.*forms|Should I add',
            input: 'yes, add form validation with react-hook-form\n',
            delay: 3000
          },
          {
            delay: 25000,
            input: 'continue\n'
          },
          {
            trigger: 'Is there|complete',
            input: 'great work, exit\n',
            delay: 2000,
            closeAfter: true
          }
        ]
      },
      {
        name: 'Generate Tests',
        command: 'claude',
        autoResponses: [
          {
            immediate: true,
            input: 'Generate comprehensive tests for both the backend API and React components. Use Jest and React Testing Library\n',
            delay: 500
          },
          {
            delay: 30000,
            input: 'continue\n'
          },
          {
            trigger: 'complete|Would you like',
            input: 'perfect, thank you! exit\n',
            delay: 3000,
            closeAfter: true
          }
        ]
      },
      {
        name: 'Generate Documentation',
        command: 'claude',
        autoResponses: [
          {
            immediate: true,
            input: 'Create README.md documentation for the entire project including setup instructions, API documentation, and deployment guide\n',
            delay: 500
          },
          {
            delay: 25000,
            input: 'continue\n'
          },
          {
            trigger: 'Is this|Would you',
            input: 'yes, also add a CONTRIBUTING.md file\n',
            delay: 3000
          },
          {
            delay: 20000,
            input: 'continue\n'
          },
          {
            trigger: 'complete|Is there',
            input: 'excellent documentation, exit\n',
            delay: 2000,
            closeAfter: true
          }
        ]
      }
    ] as WorkflowStep[]
  } as TaskConfiguration,
  max_retries: 1,
  timeout_seconds: 1800, // 30 minutes for entire workflow
  tags: ['full-stack', 'development', 'claude', 'automated']
})

/**
 * Example 4: Debugging Assistant
 */
const createDebuggingAssistant = (errorDescription: string, stackTrace?: string): Partial<Task> => ({
  name: 'Claude Debugging Assistant',
  description: 'Interactive debugging session with Claude',
  task_type: 'single' as TaskType,
  status: 'active' as TaskStatus,
  configuration: {
    command: 'claude',
    interactive: true,
    autoResponses: [
      {
        trigger: 'How can I help|What.*assist',
        input: `I need help debugging this error:\n\n${errorDescription}\n\n${stackTrace ? `Stack trace:\n${stackTrace}\n` : ''}\nWhat could be causing this and how can I fix it?\n`,
        delay: 1000
      },
      {
        trigger: 'Can you.*code|Would you.*show.*code',
        input: 'yes, here is the relevant code:\n```javascript\n// Paste code here in real usage\nfunction example() { return null; }\n```\n',
        delay: 3000
      },
      {
        trigger: 'try|suggest|Would you like me to',
        input: 'yes, show me the corrected version\n',
        delay: 2000
      },
      {
        delay: 20000,
        input: 'continue\n'
      },
      {
        trigger: 'Is this helpful|Does this solve|Is there anything else',
        input: 'That helps a lot, thank you! exit\n',
        delay: 3000,
        closeAfter: true
      }
    ] as AutoResponse[]
  } as TaskConfiguration,
  max_retries: 1,
  timeout_seconds: 600,
  tags: ['debugging', 'claude', 'interactive']
})

/**
 * Example 5: Learning Session with Q&A
 */
const createLearningSession = (topic: string, questions: string[]): Partial<Task> => {
  const autoResponses: AutoResponse[] = [
    {
      trigger: 'How can I help|What would you like to',
      input: `I want to learn about ${topic}. Can you explain the key concepts?\n`,
      delay: 1000
    }
  ]

  // Add questions as follow-ups
  questions.forEach((question, index) => {
    autoResponses.push({
      delay: 20000, // Continue if Claude pauses
      input: 'continue\n'
    })
    autoResponses.push({
      trigger: 'Is there.*specific|Would you like.*know|Is there anything else',
      input: `${question}\n`,
      delay: 3000
    })
  })

  // Add exit response
  autoResponses.push({
    delay: 20000,
    input: 'continue\n'
  })
  autoResponses.push({
    trigger: 'Is there anything else|Would you like to',
    input: 'That was very helpful, thank you! exit\n',
    delay: 3000,
    closeAfter: true
  })

  return {
    name: `Learning Session: ${topic}`,
    description: `Interactive learning session about ${topic}`,
    task_type: 'single' as TaskType,
    status: 'active' as TaskStatus,
    configuration: {
      command: 'claude',
      interactive: true,
      autoResponses
    } as TaskConfiguration,
    max_retries: 1,
    timeout_seconds: 900, // 15 minutes
    tags: ['learning', 'claude', 'interactive', 'educational']
  }
}

/**
 * Function to create an execution with custom auto-responses
 */
const createExecutionWithAutoResponses = (
  taskId: string,
  customResponses?: AutoResponse[]
): Partial<Execution> => ({
  task_id: taskId,
  status: 'pending',
  trigger: 'manual',
  trigger_source: 'claude-workflow-example',
  input_params: customResponses ? {
    autoResponses: customResponses
  } : {},
  retry_count: 0
})

/**
 * Utility function to create a simple continue-only configuration
 */
const createContinueOnlyConfig = (intervalSeconds: number = 15): TaskConfiguration => ({
  command: 'claude',
  interactive: true,
  autoContinue: true,
  autoContinueDelay: intervalSeconds * 1000,
  autoContinueInput: 'continue\n'
})

/**
 * Utility function to create Claude-optimized responses
 */
const createClaudeOptimizedConfig = (): TaskConfiguration => ({
  command: 'claude',
  interactive: true,
  autoClaudeResponses: true, // Enables smart Claude-specific responses
  autoResponses: [
    {
      trigger: 'Would you like|Do you want|Should I',
      input: 'yes\n',
      delay: 2000
    },
    {
      trigger: 'Press enter to continue|Continue\\?',
      input: '\n',
      delay: 500
    },
    {
      delay: 15000,
      input: 'continue\n'
    },
    {
      delay: 300000, // 5 minute safety timeout
      input: 'Thank you, goodbye!\nexit\n',
      closeAfter: true
    }
  ]
})

// Export examples for use in other modules
export {
  createSimpleClaudeTask,
  createCodeReviewWorkflow,
  createFullStackWorkflow,
  createDebuggingAssistant,
  createLearningSession,
  createExecutionWithAutoResponses,
  createContinueOnlyConfig,
  createClaudeOptimizedConfig
}

// Example usage
async function main() {
  // Example: Create a code review task
  const codeReviewTask = createCodeReviewWorkflow(`
    function processData(data) {
      let result = []
      for (var i = 0; i < data.length; i++) {
        if (data[i].active == true) {
          result.push(data[i])
        }
      }
      return result
    }
  `)
  
  console.log('Code Review Task:', JSON.stringify(codeReviewTask, null, 2))
  
  // Example: Create a learning session
  const learningTask = createLearningSession(
    'TypeScript Generics',
    [
      'Can you show me an example with constraints?',
      'How do mapped types work with generics?',
      'What are conditional types?'
    ]
  )
  
  console.log('Learning Task:', JSON.stringify(learningTask, null, 2))
  
  // Example: Create execution with override responses
  const execution = createExecutionWithAutoResponses('task-123', [
    {
      immediate: true,
      input: 'Explain async/await in JavaScript\n',
      delay: 500
    },
    {
      trigger: 'Would you like.*example',
      input: 'yes, show me error handling examples\n',
      delay: 2000
    },
    {
      delay: 20000,
      input: 'continue\n'
    },
    {
      trigger: 'Is there',
      input: 'no, that\'s all. exit\n',
      delay: 2000,
      closeAfter: true
    }
  ])
  
  console.log('Custom Execution:', JSON.stringify(execution, null, 2))
}

// Run examples if this is the main module
if (require.main === module) {
  main().catch(console.error)
}