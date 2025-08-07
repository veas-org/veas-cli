import pc from 'picocolors';
import { logger } from '../utils/logger.js';
import { AuthManager } from '../auth/auth-manager.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function configureForClaude(): Promise<void> {
  try {
    const authManager = AuthManager.getInstance();
    const isAuthenticated = await authManager.isAuthenticated();
    
    if (!isAuthenticated) {
      logger.error('Not authenticated. Please run "veas login" first.');
      process.exit(1);
    }

    const cliPath = path.resolve(__dirname, '..', '..', 'bin', 'veas.js');
    
    // Check if veas.js exists
    try {
      await fs.access(cliPath);
    } catch {
      logger.error('veas.js not found. Please build the project first with "pnpm build"');
      process.exit(1);
    }

    logger.info(pc.cyan('Configuration for Claude MCP:'));
    console.log('');
    console.log(pc.bold('To add VEAS as an MCP server in Claude, run:'));
    console.log('');
    console.log(pc.green(`claude mcp add veas -- node "${cliPath}" serve`));
    console.log('');
    console.log(pc.dim('Or with custom options:'));
    console.log(pc.green(`claude mcp add veas -e VEAS_API_URL=https://your-api.com -- node "${cliPath}" serve --port 3333`));
    console.log('');
    console.log(pc.bold('Alternative: Manual configuration'));
    console.log('Add this to your Claude MCP configuration:');
    console.log('');
    console.log(pc.yellow(JSON.stringify({
      veas: {
        command: "node",
        args: [cliPath, "serve"],
        env: {
          VEAS_API_URL: process.env.VEAS_API_URL || "https://veas.app"
        }
      }
    }, null, 2)));
    console.log('');
    logger.info(pc.green('✓ Configuration complete'));
  } catch (error) {
    logger.error('Failed to generate configuration:', error);
    process.exit(1);
  }
}

export async function showConfig(): Promise<void> {
  try {
    const authManager = AuthManager.getInstance();
    const token = await authManager.getToken();
    const apiUrl = process.env.VEAS_API_URL || 'https://veas.app';
    
    logger.info(pc.cyan('Current VEAS CLI Configuration:'));
    console.log('');
    console.log(pc.bold('Authentication:'), token ? pc.green('✓ Authenticated') : pc.red('✗ Not authenticated'));
    console.log(pc.bold('API URL:'), apiUrl);
    console.log(pc.bold('MCP Server:'), 'stdio transport');
    console.log('');
    
    if (!token) {
      console.log(pc.yellow('Run "veas login" to authenticate'));
    }
  } catch (error) {
    logger.error('Failed to show configuration:', error);
    process.exit(1);
  }
}

export async function testMCPConnection(): Promise<void> {
  try {
    const authManager = AuthManager.getInstance();
    const isAuthenticated = await authManager.isAuthenticated();
    
    if (!isAuthenticated) {
      logger.error('Not authenticated. Please run "veas login" first.');
      process.exit(1);
    }

    const token = await authManager.getToken();
    if (!token) {
      logger.error('No authentication token found');
      process.exit(1);
    }
    
    const apiUrl = process.env.VEAS_API_URL || 'https://veas.app';
    
    logger.info(pc.cyan('Testing MCP connection...'));
    
    // Test the MCP endpoint
    const response = await fetch(`${apiUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'X-MCP-Token': token,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: Date.now().toString(),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`MCP test failed: ${error}`);
      process.exit(1);
    }

    // Handle event stream response
    const text = await response.text();
    
    // Parse event stream data
    let result: any;
    if (text.startsWith('event:')) {
      // Extract JSON from event stream
      const lines = text.split('\n');
      const dataLine = lines.find(line => line.startsWith('data: '));
      if (dataLine) {
        result = JSON.parse(dataLine.substring(6));
      }
    } else {
      // Regular JSON response
      result = JSON.parse(text);
    }
    
    if (result?.error) {
      logger.error(`MCP error: ${result.error.message}`);
      process.exit(1);
    }

    const tools = result?.result?.tools || [];
    logger.info(pc.green(`✓ MCP connection successful!`));
    logger.info(`Found ${tools.length} available tools`);
    
    if (tools.length > 0) {
      console.log('');
      console.log(pc.bold('Sample tools:'));
      tools.slice(0, 5).forEach((tool: any) => {
        console.log(`  - ${pc.cyan(tool.name)}: ${tool.description}`);
      });
      if (tools.length > 5) {
        console.log(`  ... and ${tools.length - 5} more`);
      }
    }
  } catch (error) {
    logger.error('MCP connection test failed:', error);
    process.exit(1);
  }
}

export const test = testMCPConnection;

export async function listProjects(): Promise<void> {
  try {
    const authManager = AuthManager.getInstance();
    const isAuthenticated = await authManager.isAuthenticated();
    
    if (!isAuthenticated) {
      logger.error('Not authenticated. Please run "veas login" first.');
      process.exit(1);
    }

    logger.info(pc.cyan('Available projects:'));
    logger.info(pc.yellow('Project listing not yet implemented'));
  } catch (error) {
    logger.error('Error listing projects:', error);
    process.exit(1);
  }
}