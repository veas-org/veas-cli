#!/bin/bash

echo "Testing Claude with auto-responses"
echo "==================================="
echo ""

# Use expect to automate Claude
expect << 'EXPECT_END'
set timeout -1

# Spawn Claude
puts "Spawning Claude..."
spawn claude

# Give Claude time to start
sleep 1

# Send messages with delays
puts "\n>>> Sending first message in 2 seconds..."
after 2000
send "Hello Claude, this is an automated test message!\r"

puts "\n>>> Sending second message in 3 seconds..."
after 3000  
send "What is 2+2?\r"

puts "\n>>> Sending third message in 3 seconds..."
after 3000
send "Thanks!\r"

puts "\n>>> Auto-responses complete. You can now interact normally."

# Hand over to user
interact
EXPECT_END