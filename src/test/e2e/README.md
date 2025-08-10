# VEAS CLI E2E Testing Framework

This directory contains end-to-end tests for the VEAS CLI MCP (Model Context Protocol) connections.

## Overview

The E2E testing framework validates real-world connectivity between the VEAS CLI and MCP servers, including:
- Connection health and stability
- Authentication flows (CLI tokens, PATs)
- Tool discovery and execution
- Error handling and recovery
- Performance benchmarks

## Test Structure

```
src/test/e2e/
├── setup.ts                    # Global E2E test setup
├── helpers/                    # Test utilities
│   ├── mcp-client.ts          # MCP client wrapper
│   ├── auth-helper.ts         # Authentication utilities
│   └── assertions.ts          # Custom assertions
├── fixtures/                   # Test data (if needed)
├── mcp-connection.e2e.test.ts # Connection health tests
├── auth.e2e.test.ts           # Authentication tests
├── tool-execution.e2e.test.ts # Tool execution tests
└── error-handling.e2e.test.ts # Error scenario tests
```

## Running Tests

### Prerequisites

1. Ensure the VEAS web server is running:
   ```bash
   pnpm dev:web
   ```

2. Build the CLI:
   ```bash
   pnpm build --filter @veas/veas-cli
   ```

### Test Commands

```bash
# Run all E2E tests
pnpm test:e2e

# Watch mode for development
pnpm test:e2e:watch

# Debug mode with verbose logging
pnpm test:e2e:debug

# UI mode for interactive testing
pnpm test:e2e:ui

# CI mode with reports
pnpm test:e2e:ci
```

## Environment Variables

Configure test behavior with environment variables:

```bash
# API endpoint (default: http://localhost:3000)
VEAS_API_URL=http://localhost:3000

# Enable verbose logging
E2E_VERBOSE=true

# Test tokens (for CI/CD)
E2E_PAT_TOKEN=mcp_test_xxxxx
E2E_CLI_TOKEN=cli_test_xxxxx
```

## Writing New Tests

### 1. Create Test File

```typescript
import { describe, it, expect } from 'vitest';
import { createMCPClient } from './helpers/mcp-client.js';
import { authHelper } from './helpers/auth-helper.js';

describe('New Feature E2E Tests', () => {
  // Test implementation
});
```

### 2. Use Test Helpers

```typescript
// Create MCP client
const client = createMCPClient({
  transport: 'http',
  timeout: 10000,
});

// Set authentication
await authHelper.setTestToken(token);

// Make MCP calls
const tools = await client.listTools();
const result = await client.callTool('tool_name', { param: 'value' });
```

### 3. Use Custom Assertions

```typescript
import { expectMCPSuccess, expectToolExists } from './helpers/assertions.js';

// Assert MCP response format
expectMCPSuccess(response);

// Assert tool availability
expectToolExists(tools, 'mcp-project-manager_create_issue');
```

## Test Categories

### Connection Tests
- Server availability
- Transport types (http, sse, stdio)
- Connection timeouts
- Network error recovery

### Authentication Tests
- CLI token validation
- PAT token validation
- Token expiration handling
- Permission scopes

### Tool Execution Tests
- Tool discovery
- Parameter validation
- Response formats
- Concurrent execution

### Error Handling Tests
- Network errors
- Protocol errors
- Authentication failures
- Rate limiting

## CI/CD Integration

The E2E tests are designed for CI/CD pipelines:

1. **Isolated Environment**: Tests create their own auth state
2. **Parallel Safety**: Tests can run in parallel (with care)
3. **Reporting**: JSON and JUnit reports for CI systems
4. **Cleanup**: Automatic cleanup after test runs

## Debugging Tips

1. **Enable Verbose Logging**:
   ```bash
   E2E_VERBOSE=true pnpm test:e2e
   ```

2. **Run Single Test**:
   ```bash
   pnpm test:e2e -- --grep "should connect to MCP server"
   ```

3. **Check Server Logs**:
   Monitor the web server console for MCP requests

4. **Use Test UI**:
   ```bash
   pnpm test:e2e:ui
   ```

## Common Issues

### Server Not Available
- Ensure `pnpm dev:web` is running
- Check `VEAS_API_URL` environment variable
- Verify server is accessible at configured URL

### Authentication Failures
- Check if CLI is authenticated: `veas status`
- Verify test tokens are valid
- Ensure auth state is properly saved/restored

### Timeout Errors
- Increase test timeout in `vitest.config.e2e.ts`
- Check network connectivity
- Verify server performance

## Future Enhancements

- [ ] Performance benchmarking suite
- [ ] Load testing scenarios
- [ ] Multi-tenant testing
- [ ] WebSocket transport tests
- [ ] Integration with monitoring tools
- [ ] Automated test data generation
