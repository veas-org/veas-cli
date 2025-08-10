# VEAS CLI MCP Configuration for Claude

This guide explains how to configure the VEAS CLI as an MCP (Model Context Protocol) server for Claude.

## Prerequisites

1. VEAS CLI installed and built
2. Authenticated with VEAS services
3. Claude Desktop with MCP support

## Quick Setup

1. **Build the CLI** (if not already built):
   ```bash
   cd apps/veas-cli
   pnpm build
   ```

2. **Authenticate** with VEAS:
   ```bash
   veas login
   ```

3. **Configure for Claude**:
   ```bash
   veas mcp configure
   ```

   This will show you the exact command to run in Claude.

4. **Add to Claude**:
   ```bash
   claude mcp add veas -- node /path/to/veas-cli/bin/veas.js serve
   ```

## Manual Configuration

If you prefer manual configuration, add this to your Claude MCP configuration:

```json
{
  "veas": {
    "command": "node",
    "args": ["/absolute/path/to/veas-cli/bin/veas.js", "serve"],
    "env": {
      "VEAS_API_URL": "https://veas.app"
    }
  }
}
```

## Available Commands

- `veas mcp configure` - Show configuration instructions
- `veas mcp test` - Test MCP connection
- `veas mcp config` - Show current configuration
- `veas serve` - Start the MCP server (used by Claude)

## Server Options

When starting the server, you can customize:

```bash
veas serve --port 3333 --cache-ttl 300 --no-cache
```

- `--port` - Server port (default: 3333)
- `--cache-ttl` - Cache TTL in seconds (default: 300)
- `--no-cache` - Disable caching

## Troubleshooting

1. **Authentication errors**: Run `veas login` again
2. **Build errors**: Ensure you've run `pnpm build`
3. **Connection issues**: Check `VEAS_API_URL` environment variable
4. **Test connection**: Run `veas mcp test`

## Environment Variables

- `VEAS_API_URL` - API endpoint (default: http://localhost:3000)
- `NODE_ENV` - Environment (default: development)

## Security

The MCP server uses:
- Personal Access Token authentication
- Secure token storage in system keychain
- Automatic token refresh
- Request caching to minimize API calls