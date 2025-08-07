# Veas CLI

[![npm version](https://img.shields.io/npm/v/veas.svg)](https://www.npmjs.com/package/veas)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/veas.svg)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/veas-org/veas-cli/pulls)

Command-line interface for the Model Context Protocol (MCP), enabling seamless integration between AI models and external tools.

## 🚀 Overview

Veas CLI is an open-source tool that provides a complete implementation of the Model Context Protocol (MCP). It allows developers to create, serve, and manage MCP servers that enable AI assistants like Claude to interact with external tools and services.

### Key Features

- 🛠️ **MCP Server Management** - Create and serve MCP servers with a single command
- 🔐 **Built-in Authentication** - Support for Personal Access Tokens (PAT) and OAuth device flow
- 📚 **Documentation Sync** - Automatically sync and serve documentation as MCP resources
- 🔌 **Extensible Tool System** - Register custom tools and integrate with existing services
- 💾 **Smart Caching** - Built-in cache management for improved performance
- 🔄 **Real-time Updates** - Server-Sent Events (SSE) support for live communication

## 📋 Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- Git (for development)

## 🏁 Getting Started

### Installation

Install Veas CLI globally:

```bash
npm install -g veas
```

Or use it directly with npx:

```bash
npx veas --help
```

### Quick Start

1. **Authenticate with Veas platform:**
```bash
veas auth login
```

2. **Create a Personal Access Token:**
```bash
veas pat create
```

3. **Start an MCP server:**
```bash
veas mcp serve
```

4. **Test your MCP connection:**
```bash
veas mcp test
```

## 📖 CLI Commands

### Authentication Commands

```bash
# Login to Veas platform
veas auth login

# Check authentication status
veas auth status

# Logout
veas auth logout

# Refresh authentication token
veas auth refresh
```

### MCP Server Commands

```bash
# Start MCP server
veas mcp serve [options]
  --port <number>     Server port (default: 3000)
  --cache             Enable caching
  --debug             Enable debug mode

# Test MCP connection
veas mcp test

# List available projects
veas mcp list-projects

# Direct server mode (stdio transport)
veas mcp direct
```

### Personal Access Token (PAT) Commands

```bash
# Create a new PAT
veas pat create [options]
  --name <string>     Token name
  --expires <days>    Expiration in days

# List all PATs
veas pat list

# Revoke a PAT
veas pat revoke <token-id>
```

### Documentation Sync

```bash
# Sync and serve documentation as MCP resources
veas docs sync [options]
  --dir <path>        Documentation directory
  --watch             Watch for changes
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in your project root:

```env
# Veas API Configuration
VEAS_API_URL=https://api.veas.org
VEAS_PAT=your-personal-access-token

# MCP Server Configuration
MCP_SERVER_PORT=3000
MCP_CACHE_ENABLED=true
MCP_CACHE_TTL=300

# OAuth Configuration (optional)
VEAS_CLIENT_ID=your-client-id
VEAS_REDIRECT_URI=http://localhost:3456/callback
```

### Configuration File

You can also use a `veas.config.json` file:

```json
{
  "server": {
    "port": 3000,
    "cache": {
      "enabled": true,
      "ttl": 300
    }
  },
  "auth": {
    "type": "pat",
    "token": "your-token"
  }
}
```

## 🧑‍💻 Development

### Setting Up Development Environment

1. **Clone the repository:**
```bash
git clone https://github.com/veas-org/veas-cli.git
cd veas-cli
```

2. **Install dependencies:**
```bash
npm install
```

3. **Build the project:**
```bash
npm run build
```

4. **Run in development mode:**
```bash
npm run dev
```

### Running Tests

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run end-to-end tests
npm run test:e2e

# Run type checking
npm run typecheck

# Run linting
npm run lint
```

### Project Structure

```
veas-cli/
├── src/
│   ├── commands/      # CLI command implementations
│   ├── mcp/           # MCP server and client logic
│   ├── auth/          # Authentication modules
│   ├── config/        # Configuration parsing
│   └── index.ts       # CLI entry point
├── test/              # Test files
├── docs/              # Documentation
└── bin/               # Executable scripts
```

## 🤝 Contributing

We welcome contributions from the community! Please read our [Contributing Guide](CONTRIBUTING.md) to get started.

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Reporting Issues

- 🐛 [Report bugs](https://github.com/veas-org/veas-cli/issues/new?template=bug_report.md)
- 💡 [Request features](https://github.com/veas-org/veas-cli/issues/new?template=feature_request.md)
- 💬 [Ask questions](https://github.com/veas-org/veas-cli/discussions)

## 🌟 Community

- 💬 [Discord Community](https://discord.gg/veas) - Join our Discord server
- 📧 [Mailing List](https://groups.google.com/g/veas-dev) - Subscribe to updates
- 🐦 [Twitter](https://twitter.com/veas_org) - Follow us for news
- 📚 [Documentation](https://docs.veas.org) - Full documentation

## 🔒 Security

Please report security vulnerabilities to security@veas.org. See our [Security Policy](SECURITY.md) for more details.

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes in each release.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk) - The official MCP SDK
- [Claude](https://claude.ai) - Anthropic's AI assistant
- All our [contributors](https://github.com/veas-org/veas-cli/graphs/contributors)

## 🆘 Support

- 📧 Email: support@veas.org
- 💬 Discord: [Join our community](https://discord.gg/veas)
- 📚 Documentation: [docs.veas.org](https://docs.veas.org)
- 🐛 Issues: [GitHub Issues](https://github.com/veas-org/veas-cli/issues)

---

Made with ❤️ by the Veas Team and contributors