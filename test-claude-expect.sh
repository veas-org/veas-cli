#!/usr/bin/expect -f

# Test Claude with expect directly
set timeout -1

puts "Starting Claude with expect..."
puts "Will send messages after delays..."
puts "================================"

spawn claude

# Wait for Claude to fully start (it might show a welcome message)
sleep 1

# Send first message after 2 seconds
puts "\n[Waiting 2 seconds before first message...]"
after 2000
send "Hello Claude! This is the first automated message.\r"

# Send second message after 3 more seconds
puts "\n[Waiting 3 seconds before second message...]"
after 3000
send "Can you tell me what 2+2 equals?\r"

# Send third message after 3 more seconds
puts "\n[Waiting 3 seconds before third message...]"
after 3000
send "Thank you!\r"

puts "\n[Auto-responses complete. Handing over control...]"

# Hand over control to the user
interact