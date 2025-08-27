#!/bin/bash

# Demo script to show auto-response functionality
echo "🎮 Interactive Command Demo with Auto-Responses"
echo "================================================"
echo ""
echo "This demo shows how the TaskExecutor handles interactive commands"
echo "with automatic responses configured via input parameters."
echo ""
echo "Example configuration for Claude CLI:"
echo ""
cat <<'EOF'
{
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
EOF

echo ""
echo "Features demonstrated:"
echo "✅ Pattern-based triggers (e.g., 'Would you like to')"
echo "✅ Delay-only responses (send after timeout)"
echo "✅ Immediate responses (send right away)"
echo "✅ Close-after flag (terminate session after response)"
echo "✅ Support for both stdout and stderr triggers"
echo ""
echo "The implementation in task-executor.ts:"
echo "- Detects interactive commands (claude, ssh, vim, etc.)"
echo "- Switches to pipe stdio for auto-response mode"
echo "- Monitors output and sends responses based on configuration"
echo "- Falls back to inherit stdio for manual interaction"
echo ""
echo "Test it by creating a task with the configuration above!"