#!/bin/bash

echo "Testing expect with read command..."

expect << 'EOF'
set timeout 10
spawn bash -c "read -p 'Enter your name: ' name && echo Hello, \$name!"

# Wait for the prompt
expect "Enter your name:"

# Send the response after 2 seconds
after 2000
send "Automated User\r"

expect eof
EOF

echo "Test completed!"