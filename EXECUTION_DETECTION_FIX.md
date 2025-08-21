# Improved Task Execution Detection

## Problem
Some task executions were not being picked up by the CLI destination watcher.

## Root Cause
The original implementation only subscribed to executions that already had a `destination_id` set. However, executions might be created without a destination assignment and need to be claimed by available destinations.

## Solution Implemented

### 1. **Dual Subscription Strategy**
The CLI now subscribes to two types of executions:

- **Assigned Executions**: Executions specifically assigned to this destination
- **Unassigned Executions**: All executions in the organization that don't have a destination yet

### 2. **Startup Check**
When the monitor starts, it immediately checks for:
- Pending executions already assigned to this destination but not claimed
- Unassigned executions for tasks in the organization

### 3. **Periodic Checking**
Every 30 seconds, the monitor:
- Checks for unclaimed executions in the organization
- Checks for due scheduled tasks
- Attempts to claim any available work

### 4. **Execution Claiming Logic**
When an unassigned execution is detected:
1. Verify the task belongs to our organization
2. Attempt to claim it atomically (prevents race conditions)
3. If successful, execute the task immediately
4. If another destination claimed it first, skip it

## Key Features

### Real-time Detection
```
🔍 New unassigned execution detected: exec-123
  Attempting to claim execution exec-123...
  ✓ Successfully claimed execution exec-123

============================================================
📋 NEW EXECUTION REQUEST
   Execution ID: exec-123
   Time: 10:45:32 AM
============================================================
```

### Multiple Detection Methods
- **Realtime Subscriptions**: Instant notification of new executions
- **Periodic Polling**: Catches any missed executions every 30 seconds
- **Startup Scan**: Processes any pending work immediately on start

### Visual Feedback
The monitor now shows what it's watching for:
```
✅ Schedule monitor started
   Watching for:
   • Executions assigned to this destination
   • Unassigned executions for organization tasks
   • Scheduled tasks that are due
   • Manual task triggers
```

## Database Considerations

The execution table structure supports:
- `destination_id`: Which destination owns the execution
- `assigned_at`: When it was assigned to a destination
- `claimed_at`: When the destination claimed and started processing

The claiming process uses atomic updates with conditions to prevent multiple destinations from claiming the same execution.

## Usage

Start the destination watcher as usual:
```bash
npx veas dest watch <destination-id>
```

The CLI will now:
1. Check for any existing pending work
2. Subscribe to all relevant execution events
3. Continuously monitor for new work
4. Execute tasks with "echo Hello World!" or configured commands

## Benefits

- **No Missed Executions**: Multiple detection methods ensure nothing is lost
- **Load Balancing**: Multiple destinations can compete for unclaimed work
- **Fault Tolerance**: If a destination goes offline, another can pick up its work
- **Immediate Response**: Realtime subscriptions provide instant execution
- **Catch-up Capability**: Periodic checks handle any edge cases

## Testing

To test the improved detection:

1. Create an execution without a destination:
   ```sql
   INSERT INTO agents.executions (task_id, status, trigger)
   VALUES ('your-task-id', 'pending', 'manual');
   ```

2. The CLI should detect and claim it within seconds:
   ```
   🔍 New unassigned execution detected: exec-xxx
   ✓ Successfully claimed execution exec-xxx
   ```

3. The task will execute with "echo Hello World!" output