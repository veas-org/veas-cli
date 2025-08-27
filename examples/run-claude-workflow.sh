#!/bin/bash

# Example script to demonstrate Claude workflow execution with veas-cli
# This script shows different ways to run Claude with auto-responses

echo "Claude Workflow Examples for veas-cli"
echo "====================================="
echo ""

# Configuration
DESTINATION_ID=${1:-"your-destination-id"}
ORGANIZATION_ID=${2:-"your-org-id"}
TASK_ID=""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to create a task via direct database insert (for testing)
create_task_direct() {
    local TASK_NAME=$1
    local COMMAND=$2
    local CONFIG=$3
    
    echo -e "${BLUE}Creating task: ${TASK_NAME}${NC}"
    
    # This would normally be done via API, but for testing you can use psql
    TASK_ID=$(psql -t -c "
        INSERT INTO agents.tasks (
            organization_id,
            created_by,
            name,
            task_type,
            status,
            configuration,
            require_auth,
            max_retries,
            timeout_seconds,
            version,
            is_public,
            execution_count,
            success_count,
            failure_count
        ) VALUES (
            '${ORGANIZATION_ID}',
            (SELECT id FROM auth.users LIMIT 1),
            '${TASK_NAME}',
            'single',
            'active',
            '${CONFIG}'::jsonb,
            false,
            3,
            300,
            1,
            false,
            0,
            0,
            0
        ) RETURNING id;
    " 2>/dev/null | xargs)
    
    echo -e "${GREEN}Created task with ID: ${TASK_ID}${NC}"
}

# Function to create an execution
create_execution() {
    local TASK_ID=$1
    local INPUT_PARAMS=$2
    
    echo -e "${BLUE}Creating execution for task: ${TASK_ID}${NC}"
    
    EXECUTION_ID=$(psql -t -c "
        INSERT INTO agents.executions (
            task_id,
            status,
            trigger,
            trigger_source,
            input_params,
            queued_at,
            retry_count
        ) VALUES (
            '${TASK_ID}',
            'pending',
            'manual',
            'run-claude-workflow.sh',
            '${INPUT_PARAMS}'::jsonb,
            NOW(),
            0
        ) RETURNING id;
    " 2>/dev/null | xargs)
    
    echo -e "${GREEN}Created execution with ID: ${EXECUTION_ID}${NC}"
    echo -e "${YELLOW}The destination watcher will pick this up automatically${NC}"
}

# Example 1: Simple auto-continue mode
example_auto_continue() {
    echo ""
    echo "Example 1: Simple Auto-Continue Mode"
    echo "-------------------------------------"
    echo "This will send 'continue' every 15 seconds if Claude pauses"
    echo ""
    
    CONFIG='{
        "command": "claude",
        "interactive": true,
        "autoContinue": true,
        "autoContinueDelay": 15000,
        "autoContinueInput": "continue\\n"
    }'
    
    create_task_direct "Claude with Auto-Continue" "claude" "$CONFIG"
    
    INPUT_PARAMS='{}'
    create_execution "$TASK_ID" "$INPUT_PARAMS"
}

# Example 2: Code review workflow
example_code_review() {
    echo ""
    echo "Example 2: Automated Code Review"
    echo "---------------------------------"
    echo "This will automatically ask Claude to review code"
    echo ""
    
    CONFIG='{
        "command": "claude",
        "interactive": true,
        "autoResponses": [
            {
                "trigger": "How can I help",
                "input": "Review this code for best practices:\\n\\nfunction getData(users) {\\n  let data = [];\\n  for(var i=0; i<users.length; i++) {\\n    if(users[i].active == true) {\\n      data.push(users[i]);\\n    }\\n  }\\n  return data;\\n}\\n",
                "delay": 1000
            },
            {
                "trigger": "Would you like",
                "input": "yes, provide a refactored version\\n",
                "delay": 2000
            },
            {
                "trigger": "Is there anything else",
                "input": "no, exit\\n",
                "delay": 2000,
                "closeAfter": true
            },
            {
                "delay": 20000,
                "input": "continue\\n"
            }
        ]
    }'
    
    create_task_direct "Automated Code Review" "claude" "$CONFIG"
    create_execution "$TASK_ID" "{}"
}

# Example 3: Test generation
example_test_generation() {
    echo ""
    echo "Example 3: Automated Test Generation"
    echo "-------------------------------------"
    echo "This will ask Claude to generate unit tests"
    echo ""
    
    CONFIG='{
        "command": "claude",
        "interactive": true
    }'
    
    create_task_direct "Test Generator" "claude" "$CONFIG"
    
    # Pass auto-responses via input params
    INPUT_PARAMS='{
        "autoResponses": [
            {
                "immediate": true,
                "input": "Generate Jest unit tests for a function that validates email addresses. Include edge cases.\\n",
                "delay": 500
            },
            {
                "trigger": "Would you like|Should I",
                "input": "yes\\n",
                "delay": 2000
            },
            {
                "delay": 15000,
                "input": "continue\\n"
            },
            {
                "trigger": "Is there anything|complete",
                "input": "exit\\n",
                "delay": 2000,
                "closeAfter": true
            }
        ]
    }'
    
    create_execution "$TASK_ID" "$INPUT_PARAMS"
}

# Example 4: Multi-step workflow
example_multi_step() {
    echo ""
    echo "Example 4: Multi-Step Development Workflow"
    echo "------------------------------------------"
    echo "This creates a workflow with multiple Claude interactions"
    echo ""
    
    CONFIG='{
        "workflow": [
            {
                "name": "Design API",
                "command": "claude",
                "autoResponses": [
                    {
                        "immediate": true,
                        "input": "Design a REST API for a blog system with posts, comments, and users\\n",
                        "delay": 500
                    },
                    {
                        "delay": 20000,
                        "input": "continue\\n"
                    },
                    {
                        "trigger": "Is this helpful|complete",
                        "input": "yes, now show me the OpenAPI spec\\n",
                        "delay": 3000
                    },
                    {
                        "delay": 20000,
                        "input": "continue\\n"
                    },
                    {
                        "trigger": "Is there|Would you",
                        "input": "exit\\n",
                        "delay": 2000,
                        "closeAfter": true
                    }
                ]
            },
            {
                "name": "Generate Implementation",
                "command": "claude",
                "autoResponses": [
                    {
                        "immediate": true,
                        "input": "Implement the blog API endpoints in Node.js with Express\\n",
                        "delay": 500
                    },
                    {
                        "delay": 25000,
                        "input": "continue\\n"
                    },
                    {
                        "trigger": "complete|Would you like",
                        "input": "exit\\n",
                        "delay": 3000,
                        "closeAfter": true
                    }
                ]
            }
        ]
    }'
    
    create_task_direct "Multi-Step Blog API Development" "claude" "$CONFIG"
    create_execution "$TASK_ID" "{}"
}

# Example 5: Interactive with timer
example_timed_session() {
    echo ""
    echo "Example 5: Timed Claude Session"
    echo "--------------------------------"
    echo "This runs Claude with a 2-minute time limit"
    echo ""
    
    CONFIG='{
        "command": "claude",
        "interactive": true,
        "autoResponses": [
            {
                "immediate": true,
                "input": "Hello Claude, I need help with Python programming\\n",
                "delay": 500
            },
            {
                "delay": 15000,
                "input": "continue\\n"
            },
            {
                "delay": 120000,
                "input": "Thank you for your help, goodbye!\\nexit\\n",
                "closeAfter": true
            }
        ]
    }'
    
    create_task_direct "Timed Claude Session (2 min)" "claude" "$CONFIG"
    create_execution "$TASK_ID" "{}"
}

# Function to run destination watcher
run_destination_watcher() {
    echo ""
    echo -e "${YELLOW}Starting destination watcher...${NC}"
    echo -e "${BLUE}This will pick up and execute the tasks created above${NC}"
    echo ""
    
    npx veas dest watch "$DESTINATION_ID" --verbose
}

# Main menu
show_menu() {
    echo ""
    echo "Select an example to run:"
    echo "1) Simple Auto-Continue (sends 'continue' after 15s)"
    echo "2) Automated Code Review"
    echo "3) Test Generation"
    echo "4) Multi-Step Workflow"
    echo "5) Timed Session (2 minutes)"
    echo "6) Run All Examples"
    echo "7) Start Destination Watcher"
    echo "0) Exit"
    echo ""
    read -p "Enter choice [0-7]: " choice
    
    case $choice in
        1) example_auto_continue ;;
        2) example_code_review ;;
        3) example_test_generation ;;
        4) example_multi_step ;;
        5) example_timed_session ;;
        6) 
            example_auto_continue
            example_code_review
            example_test_generation
            example_multi_step
            example_timed_session
            ;;
        7) run_destination_watcher ;;
        0) exit 0 ;;
        *) echo "Invalid choice" ;;
    esac
}

# Check if destination ID is provided
if [ "$DESTINATION_ID" = "your-destination-id" ]; then
    echo -e "${YELLOW}Warning: Using default destination ID${NC}"
    echo "Usage: $0 <destination-id> <organization-id>"
    echo ""
    read -p "Enter your destination ID: " DESTINATION_ID
    read -p "Enter your organization ID: " ORGANIZATION_ID
fi

# Main loop
while true; do
    show_menu
done