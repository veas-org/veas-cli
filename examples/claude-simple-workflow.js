/**
 * Example: Simple Claude Workflow for veas-cli
 * 
 * This example shows how to create and execute a Claude workflow
 * with auto-responses through the veas-cli task system
 */

// Example 1: Quick Code Review Workflow
const codeReviewWorkflow = {
  name: "Quick Code Review",
  task_type: "single",
  configuration: {
    command: "claude",
    interactive: true,
    // Simple auto-continue mode - sends "continue" after 15 seconds
    autoContinue: true,
    autoContinueDelay: 15000,
    autoContinueInput: "continue\n"
  }
};

// Example 2: Automated Development Assistant
const devAssistantWorkflow = {
  name: "Dev Assistant - Generate Tests and Docs",
  task_type: "workflow",
  configuration: {
    workflow: [
      {
        name: "Generate Tests",
        command: "claude",
        autoResponses: [
          {
            immediate: true,
            input: "Generate Jest unit tests for a user authentication function that validates email and password\n",
            delay: 500
          },
          {
            trigger: "Would you like",
            input: "yes\n",
            delay: 2000
          },
          {
            trigger: "Is there anything else",
            input: "no, exit\n",
            delay: 2000,
            closeAfter: true
          }
        ]
      },
      {
        name: "Generate Documentation",
        command: "claude",
        autoResponses: [
          {
            immediate: true,
            input: "Write JSDoc documentation for the authentication functions\n",
            delay: 500
          },
          {
            delay: 15000,
            input: "continue\n"
          },
          {
            trigger: "complete|finished",
            input: "exit\n",
            delay: 2000,
            closeAfter: true
          }
        ]
      }
    ]
  }
};

// Example 3: Interactive Debugging Session
const debuggingWorkflow = {
  name: "Claude Debugging Helper",
  task_type: "single",
  configuration: {
    command: "claude",
    interactive: true,
    autoResponses: [
      {
        trigger: "How can I help",
        input: "I have a memory leak in my Node.js application. Here's the symptoms: Memory usage grows from 200MB to 2GB over 24 hours. It's a REST API with PostgreSQL. What debugging steps should I take?\n",
        delay: 1000
      },
      {
        trigger: "Would you like.*specific",
        input: "yes, show me code examples for memory profiling\n",
        delay: 3000
      },
      {
        trigger: "Should I.*explain",
        input: "yes please\n",
        delay: 2000
      },
      {
        // Fallback - continue if Claude pauses
        delay: 20000,
        input: "continue\n"
      },
      {
        trigger: "Is there anything else",
        input: "that's very helpful, thank you! exit\n",
        delay: 3000,
        closeAfter: true
      }
    ]
  }
};

// Example 4: Multi-Step Code Generation
const codeGenerationWorkflow = {
  name: "Full Stack Feature Generation",
  task_type: "workflow",
  configuration: {
    workflow: [
      {
        name: "Generate Backend API",
        command: "claude",
        autoResponses: [
          {
            immediate: true,
            input: "Generate a Node.js Express REST API for a todo list with CRUD operations, using TypeScript and PostgreSQL\n",
            delay: 500
          },
          {
            delay: 15000,
            input: "continue\n"
          },
          {
            trigger: "Is this what you.*looking for|Would you like",
            input: "yes, now generate the database schema\n",
            delay: 3000
          },
          {
            delay: 15000,
            input: "continue\n"
          },
          {
            trigger: "complete|finished|Is there anything",
            input: "perfect, exit\n",
            delay: 2000,
            closeAfter: true
          }
        ]
      },
      {
        name: "Generate Frontend Components",
        command: "claude",
        autoResponses: [
          {
            immediate: true,
            input: "Generate React components with TypeScript for a todo list UI that connects to the REST API you just created. Include hooks for data fetching\n",
            delay: 500
          },
          {
            delay: 20000,
            input: "continue\n"
          },
          {
            trigger: "Would you like.*styling|Should I add",
            input: "yes, add Tailwind CSS styling\n",
            delay: 3000
          },
          {
            delay: 20000,
            input: "continue\n"
          },
          {
            trigger: "Is there anything else|complete",
            input: "great work, exit\n",
            delay: 2000,
            closeAfter: true
          }
        ]
      },
      {
        name: "Generate Tests",
        command: "claude",
        autoResponses: [
          {
            immediate: true,
            input: "Generate comprehensive tests for both the backend API and React components you just created\n",
            delay: 500
          },
          {
            delay: 25000,
            input: "continue\n"
          },
          {
            trigger: "complete|Would you like|Is there",
            input: "excellent, thank you! exit\n",
            delay: 3000,
            closeAfter: true
          }
        ]
      }
    ]
  }
};

// Example 5: Code Analysis and Refactoring
const refactoringWorkflow = {
  name: "Code Analysis and Refactoring Assistant",
  task_type: "single",
  configuration: {
    command: "claude",
    interactive: true,
    autoResponses: [
      {
        trigger: "How can I",
        input: `Analyze this code for performance issues and suggest refactoring:

\`\`\`javascript
async function processOrders(orders) {
  const results = [];
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const user = await getUserById(order.userId);
    const products = [];
    for (let j = 0; j < order.items.length; j++) {
      const item = order.items[j];
      const product = await getProductById(item.productId);
      products.push(product);
    }
    const total = products.reduce((sum, p, idx) => {
      return sum + (p.price * order.items[idx].quantity);
    }, 0);
    results.push({
      orderId: order.id,
      userName: user.name,
      products: products,
      total: total
    });
  }
  return results;
}
\`\`\`

Please identify issues and provide a refactored version\n`,
        delay: 1000
      },
      {
        trigger: "Would you like.*explanation|Should I explain",
        input: "yes, explain the performance improvements\n",
        delay: 3000
      },
      {
        delay: 20000,
        input: "continue\n"
      },
      {
        trigger: "Is there anything|Would you like me to",
        input: "Could you also show how to add caching?\n",
        delay: 3000
      },
      {
        delay: 15000,
        input: "continue\n"
      },
      {
        trigger: "Is there anything else|implementation",
        input: "Perfect, that's very helpful. exit\n",
        delay: 3000,
        closeAfter: true
      }
    ]
  }
};

// Example 6: Simple Q&A Session with Auto-Continue
const simpleQAWorkflow = {
  name: "Claude Q&A with Auto-Continue",
  task_type: "single",
  configuration: {
    command: "claude",
    interactive: true,
    // This configuration will:
    // 1. Let you manually start the conversation
    // 2. Automatically send "continue" if Claude pauses for more than 15 seconds
    // 3. Exit after 5 minutes of total runtime
    autoResponses: [
      {
        // Auto-continue after 15 seconds of no activity
        delay: 15000,
        input: "continue\n",
        trigger: ".*"  // Match any output
      },
      {
        // Safety exit after 5 minutes
        delay: 300000,
        input: "Thank you, goodbye!\nexit\n",
        closeAfter: true
      }
    ]
  }
};

// How to use these workflows with veas-cli:

// 1. Save the workflow configuration to a file
const fs = require('fs');
fs.writeFileSync('claude-workflow.json', JSON.stringify(codeGenerationWorkflow, null, 2));

// 2. Create a task in the database using the configuration
// Via API:
/*
POST /api/agents/tasks
{
  "name": "Claude Code Generation",
  "organization_id": "your-org-id",
  "task_type": "workflow",
  "configuration": { ...codeGenerationWorkflow.configuration }
}
*/

// 3. Execute the task
// Via CLI: npx veas dest watch <destination-id>
// The task will be picked up and executed with auto-responses

// Example: Creating a task with inline auto-responses
const createTaskWithAutoResponse = async () => {
  const response = await fetch('http://localhost:3000/api/agents/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Claude Auto Task',
      organization_id: 'your-org-id',
      task_type: 'single',
      configuration: {
        command: 'claude',
        interactive: true,
        autoContinue: true,
        autoContinueDelay: 15000
      }
    })
  });
  
  const task = await response.json();
  console.log('Created task:', task.id);
  
  // Create an execution
  const execResponse = await fetch('http://localhost:3000/api/agents/executions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_id: task.id,
      trigger: 'manual',
      input_params: {
        // Override with custom auto-responses for this execution
        autoResponses: [
          {
            immediate: true,
            input: "Write a Python function to calculate fibonacci numbers\n",
            delay: 500
          },
          {
            trigger: "Would you like",
            input: "yes, make it recursive\n",
            delay: 2000
          },
          {
            trigger: "Is there",
            input: "no, that's perfect. exit\n",
            delay: 2000,
            closeAfter: true
          }
        ]
      }
    })
  });
  
  const execution = await execResponse.json();
  console.log('Created execution:', execution.id);
};

module.exports = {
  codeReviewWorkflow,
  devAssistantWorkflow,
  debuggingWorkflow,
  codeGenerationWorkflow,
  refactoringWorkflow,
  simpleQAWorkflow,
  createTaskWithAutoResponse
};