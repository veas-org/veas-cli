#!/bin/bash

echo "Testing expect with Claude..."

expect << 'EOF'
set timeout -1
spawn claude

# Wait a bit for Claude to start
sleep 2

# Send first message after 3 seconds
after 3000
send "Hello from expect! This is an automated message.\r"

# Send second message after another 5 seconds  
after 5000
send "This is the second automated message.\r"

# Hand control to user
interact
EOF