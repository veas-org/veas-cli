# Veas CLI

[![npm version](https://img.shields.io/npm/v/veas.svg)](https://www.npmjs.com/package/veas)
[![npm downloads](https://img.shields.io/npm/dm/veas.svg)](https://www.npmjs.com/package/veas)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/veas.svg)](https://nodejs.org)
[![Protocol Version](https://img.shields.io/badge/protocol-v0.1.6-blue)](https://www.npmjs.com/package/@veas/protocol)

**Universal CLI for Knowledge Management Systems with AI Integration**

A powerful command-line interface that implements the [Veas Protocol](https://github.com/veas-org/veas-protocol) to provide seamless integration between knowledge bases, project management tools, and AI assistants through the Model Context Protocol (MCP).

## 🎯 Why Veas CLI?

Modern developers need seamless integration between their knowledge base and AI assistants. Veas CLI provides this through the standardized Veas Protocol, enabling:

- **Universal Access**: One CLI to interact with all protocol-compatible tools
- **AI-Native Integration**: Built-in MCP server for Claude, GPT, and other AI assistants
- **Protocol-Based**: Implements the open Veas Protocol standard for maximum compatibility
- **Extensible**: Add new tools and providers without changing core functionality
- **Developer-Friendly**: Simple commands, great documentation, and TypeScript support

## 🏗️ Architecture

```
                    Your Terminal / IDE
                           │
                           ▼
                    ┌──────────────┐
                    │   Veas CLI   │
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Auth &     │  │     MCP      │  │    Docs      │
│   PAT Mgmt   │  │    Server    │  │     Sync     │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
                    Uses Protocol
                          │
                          ▼
            ┌──────────────────────────┐
            │   @veas/protocol         │
            │  Universal Protocol      │
            │  Implementation          │
            └──────────┬───────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│   Knowledge  │ │  Project  │ │   Content    │
│     Base     │ │   Mgmt    │ │   Storage    │
└──────────────┘ └───────────┘ └──────────────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
                Connects to
                       │
                       │
                       ▼
                ┌──────────────┐
                │  Veas Cloud  │
                │     API      │
                └──────────────┘
                       
         Future: Notion, GitHub, Jira, etc.
```

## 🚀 Quick Start

### Installation

```bash
# Install globally with npm
npm install -g veas

# Or with pnpm
pnpm add -g veas

# Or use directly with npx
npx veas --help
```

### Basic Usage

1. **Authenticate with your platform:**
```bash
veas auth login
```

2. **Create a Personal Access Token for API access:**
```bash
veas pat create --name "My Development Token"
```

3. **Start the MCP server for AI assistants:**
```bash
veas mcp serve
```

4. **Configure Claude Desktop to use your MCP server:**
```bash
veas mcp configure
```

## 📖 Complete Command Reference

### 🔐 Authentication Commands

Manage authentication with Veas platform and other providers.

```bash
# Interactive OAuth login
veas auth login
# Opens browser for secure authentication
# Stores tokens securely in system keychain

# Check current authentication status
veas auth status
# Shows: ✓ Authenticated as user@example.com
#        Token expires: 2024-12-31 23:59:59

# Refresh authentication token
veas auth refresh
# Automatically refreshes before expiration

# Logout and clear credentials
veas auth logout
# Removes all stored tokens
```

### 🔑 Personal Access Token (PAT) Management

Create and manage long-lived tokens for CI/CD and automation.

```bash
# Create a new PAT with custom permissions
veas pat create [options]
  --name <string>         Token name (required)
  --expires <days>        Days until expiration (default: 30)
  --scopes <scopes>       Comma-separated permissions
  
# Example: Create full-access token for CI
veas pat create --name "GitHub Actions" --expires 90 --scopes "*"

# List all active PATs
veas pat list
# Shows table with: ID, Name, Scopes, Created, Expires

# Revoke a specific token
veas pat revoke <token-id>
# Immediately invalidates the token
```

### 🤖 MCP Server Commands

Serve your knowledge base and tools to AI assistants via Model Context Protocol.

```bash
# Start MCP server with HTTP/SSE transport
veas mcp serve [options]
  --port <number>         Server port (default: 3000)
  --cache                 Enable response caching
  --cache-ttl <seconds>   Cache duration (default: 300)
  --debug                 Enable debug logging
  
# Example: Production server with caching
veas mcp serve --port 8080 --cache --cache-ttl 600

# Start MCP server with stdio transport (for Claude Desktop)
veas mcp direct
# Runs in quiet mode for stdio communication

# Test MCP connection and list available tools
veas mcp test
# Shows: ✓ Connected to MCP server
#        Available tools: 23
#        Available resources: 147

# List all available projects
veas mcp list-projects
# Shows projects from Veas Cloud

# Show Claude Desktop configuration
veas mcp configure
# Outputs JSON config to add to claude_desktop_config.json
```

### 📚 Documentation Sync

Sync local documentation to your knowledge base.

```bash
# Sync documentation to platform
veas docs sync [options]
  --watch                 Watch for file changes
  --dry-run              Preview without syncing
  --force                Force sync all files
  --folder <path>        Specific folder to sync
  --config <path>        Config file path (default: veas.yaml)
  
# Example: Watch mode for live documentation updates
veas docs sync --watch --folder ./docs

# Example: Preview what would be synced
veas docs sync --dry-run
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in your project root:

```env
# Veas Platform Configuration
VEAS_API_URL=https://api.veas.org
VEAS_PAT=veas_pat_xxxxxxxxxxxxx

# MCP Server Configuration
MCP_SERVER_PORT=3000
MCP_CACHE_ENABLED=true
MCP_CACHE_TTL=300
MCP_DEBUG=false

# OAuth Configuration (for auth login)
VEAS_CLIENT_ID=your-oauth-client-id
VEAS_REDIRECT_URI=http://localhost:3456/callback
```

### Configuration File (veas.yaml)

For documentation sync and advanced configuration:

```yaml
# veas.yaml
version: 1
platform:
  api_url: https://api.veas.org
  auth:
    type: pat  # or 'oauth'
    token: ${VEAS_PAT}  # Supports env variables

docs:
  source: ./docs
  target: /knowledge-base
  ignore:
    - "*.tmp"
    - ".git/**"
    - "node_modules/**"
  folders:
    - name: "API Documentation"
      path: ./docs/api
      slug: api-docs
    - name: "User Guide"
      path: ./docs/guide
      slug: user-guide

mcp:
  server:
    port: 3000
    transport: http  # or 'stdio', 'websocket'
    cache:
      enabled: true
      ttl: 300
      max_size: 100MB
  tools:
    - search_articles
    - create_article
    - update_article
    - list_projects
    - create_issue
```

### Claude Desktop Configuration

After running `veas mcp configure`, add the output to your Claude Desktop config:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "veas": {
      "command": "npx",
      "args": ["veas", "mcp", "direct"],
      "env": {
        "VEAS_PAT": "veas_pat_xxxxxxxxxxxxx"
      }
    }
  }
}
```

## 🔌 Protocol Integration

Veas CLI is built on top of the [@veas/protocol](https://www.npmjs.com/package/@veas/protocol) package, implementing the universal protocol for knowledge management systems.

### How It Works

1. **Protocol Provider**: The CLI connects to Veas Cloud through the protocol provider
2. **Unified Interface**: Standardized protocol interface for consistent behavior
3. **MCP Adapter**: The protocol is exposed to AI assistants via MCP
4. **Tool Generation**: Protocol methods are automatically converted to MCP tools
5. **Future Extensibility**: The protocol design allows for future integration with other platforms like Notion, GitHub, Jira, etc.

### Supported Protocol Domains

- **Knowledge Base Protocol**
  - Articles: Create, read, update, delete, publish
  - Folders: Hierarchical organization
  - Tags: Flexible categorization
  - Search: Full-text and metadata search

- **Project Management Protocol**
  - Projects: Multi-tenant project spaces
  - Issues: Tasks, bugs, features with full lifecycle
  - Sprints: Time-boxed iterations
  - Teams: User and permission management

### Future Provider Support

The Veas Protocol is designed to support multiple providers. While currently only Veas Cloud is supported, the architecture allows for future integration with:

- **Notion** - For teams using Notion as their knowledge base
- **Confluence** - For enterprise documentation
- **GitHub** - For code-centric documentation
- **Obsidian** - For local markdown-based knowledge management
- **Custom Providers** - Any platform that implements the protocol

This extensible design ensures that as your needs grow, the CLI can adapt to support new platforms without breaking existing integrations.

## 🧑‍💻 Development

### Setting Up Development Environment

```bash
# Clone the repository
git clone https://github.com/veas-org/veas-cli.git
cd veas-cli

# Install dependencies with pnpm
pnpm install

# Build the project
pnpm build

# Run in development mode
pnpm dev
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run end-to-end tests
pnpm test:e2e

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Test coverage
pnpm test -- --coverage
```

### Project Structure

```
veas-cli/
├── src/
│   ├── commands/          # CLI command implementations
│   │   ├── auth.ts       # Authentication commands
│   │   ├── pat.ts        # PAT management
│   │   ├── mcp.ts        # MCP server commands
│   │   ├── serve.ts      # Server implementation
│   │   └── docs-sync.ts  # Documentation sync
│   ├── lib/              # Core libraries
│   │   ├── api.ts        # API client
│   │   ├── cache.ts      # Caching logic
│   │   └── config.ts     # Configuration parser
│   ├── providers/        # Protocol providers
│   │   └── veas.ts       # Veas Cloud provider
│   └── cli.ts           # CLI entry point
├── tests/               # Test files
├── bin/                 # Executable scripts
└── docs/               # Documentation
```

## 🚀 CI/CD & Releases

### Automated Releases

The CLI uses GitHub Actions for automated releases:

1. **Automatic Version Detection**: Commits to `main` trigger automatic versioning
   - `feat:` commits trigger minor version bumps
   - `fix:` commits trigger patch version bumps
   - `feat!:` or `BREAKING CHANGE:` trigger major version bumps

2. **Manual Releases**: Trigger via GitHub Actions workflow dispatch
   - Choose version type: patch, minor, or major
   - Automatically creates git tag and GitHub release
   - Publishes to npm and GitHub Packages

3. **Release Process**:
   - Runs full test suite
   - Builds the package
   - Updates version in package.json
   - Generates changelog
   - Creates git tag
   - Publishes to npm
   - Creates GitHub release

### Release Workflow

```yaml
# Triggered automatically on push to main
# Or manually via workflow_dispatch
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      release_type:
        description: 'Release type'
        required: true
        type: choice
        options: [patch, minor, major]
```

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `pnpm test`
5. Commit with conventional commits: `git commit -m 'feat: add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `test:` Test additions/changes
- `chore:` Maintenance tasks

## 🌟 Use Cases

### For Developers

- **AI-Powered Development**: Connect Claude to your entire knowledge base
- **Cross-Platform Sync**: Keep documentation synchronized across tools
- **Automated Workflows**: Use PATs for CI/CD integration
- **Team Collaboration**: Share knowledge through unified protocol

### For Organizations

- **Unified Knowledge Base**: One source of truth across all tools
- **Tool Migration**: Switch platforms without losing integrations
- **Compliance & Security**: Centralized authentication and access control
- **API Standardization**: Consistent interface for all tools

### For AI Integration

- **Claude Desktop**: Native MCP server support
- **Custom AI Tools**: Build specialized tools using the protocol
- **Context Management**: Provide relevant context to AI assistants
- **Automation**: AI-driven documentation and task management

## 📚 Documentation

- **[Protocol Specification](https://github.com/veas-org/veas-protocol/blob/main/SPECIFICATION.md)** - Complete protocol definition
- **[API Reference](https://docs.veas.org/cli/api)** - Detailed API documentation
- **[MCP Integration Guide](https://github.com/veas-org/veas-protocol/blob/main/MCP_INTEGRATION.md)** - AI assistant setup
- **[Examples](https://github.com/veas-org/veas-cli/tree/main/examples)** - Sample configurations and scripts

## 🔒 Security

- **Token Security**: PATs are stored securely in system keychain
- **OAuth 2.0**: Secure authentication with PKCE flow
- **Environment Isolation**: Separate configs for dev/staging/production
- **Audit Logging**: All API calls are logged for security auditing

Report security vulnerabilities to: security@veas.org

## 📄 License

MIT © Veas Team

---

<div align="center">

**[Documentation](https://docs.veas.org)** • **[Discord](https://discord.gg/veas)** • **[GitHub](https://github.com/veas-org/veas-cli)**

Built with ❤️ on the [Veas Protocol](https://github.com/veas-org/veas-protocol)

</div>