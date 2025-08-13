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

// Wrapper for tests to use spinner interface
export async function testConnection(): Promise<void> {
  const { spinner } = await import('@clack/prompts');
  const s = spinner();
  s.start('Testing MCP connection...');
  
  try {
    const authManager = AuthManager.getInstance();
    const credentials = await authManager.getCredentials();
    const token = (credentials as any)?.accessToken || credentials?.token || await authManager.getToken();
    
    if (!token) {
      s.stop(pc.red('Authentication failed'));
      logger.error('No authentication token found');
      process.exit(1);
    }
    
    const apiUrl = process.env.VEAS_API_URL || 'https://veas.app';
    
    // Test the MCP endpoint
    const response = await fetch(`${apiUrl}/api/mcp-manual`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'veas-cli',
            version: '1.0.0',
          },
        },
        id: 'init',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      s.stop(pc.red('Connection failed'));
      logger.error(`MCP test failed: ${error}`);
      process.exit(1);
    }

    const result = await response.json();
    
    if (result?.error) {
      s.stop(pc.red('Connection failed'));
      logger.error(`MCP error: ${result.error.message}`);
      process.exit(1);
    }

    s.stop(pc.green('✓ MCP connection successful! Server is connected'));
    
    const serverInfo = result?.result?.serverInfo;
    if (serverInfo) {
      logger.info(`Server: ${serverInfo.name} v${serverInfo.version}`);
    }
  } catch (error) {
    s.stop(pc.red('Connection failed'));
    logger.error(`Connection test failed: ${error}`);
    process.exit(1);
  }
}

export async function listProjects(options?: { limit?: number; offset?: number }): Promise<void> {
  const { spinner } = await import('@clack/prompts');
  const s = spinner();
  s.start('Fetching projects...');
  
  try {
    const authManager = AuthManager.getInstance();
    await authManager.ensureAuthenticated();
    const credentials = await authManager.getCredentials();
    const token = (credentials as any)?.accessToken || credentials?.token || await authManager.getToken();
    
    const apiUrl = process.env.VEAS_API_URL || 'https://veas.app';
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    
    const response = await fetch(`${apiUrl}/api/projects?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      s.stop(pc.red('Failed to fetch projects'));
      logger.error(`API error: ${response.statusText}`);
      process.exit(1);
    }

    const data = await response.json();
    const projects = data?.projects || [];
    
    s.stop(pc.green(`Found ${projects.length} projects`));
    
    if (projects.length === 0) {
      logger.info(pc.yellow('No projects found'));
    } else {
      projects.forEach((project: any) => {
        logger.info(`- ${pc.cyan(project.name)}: ${project.description || 'No description'}`);
      });
    }
  } catch (error) {
    s.stop(pc.red('Failed'));
    logger.error('Error listing projects:', error);
    process.exit(1);
  }
}

export async function createIssue(data?: { projectId?: string; title?: string; description?: string }): Promise<void> {
  const { text, spinner } = await import('@clack/prompts');
  const s = spinner();
  
  try {
    const authManager = AuthManager.getInstance();
    await authManager.ensureAuthenticated();
    const credentials = await authManager.getCredentials();
    const token = (credentials as any)?.accessToken || credentials?.token || await authManager.getToken();
    
    // Get input if not provided
    let projectId = data?.projectId;
    let title = data?.title;
    let description = data?.description;
    
    if (!projectId) {
      const input = await text({
        message: 'Project ID:',
        validate: (value) => {
          if (!value) return 'Project ID is required';
        },
      });
      if (typeof input === 'symbol') {
        logger.info(pc.red('Cancelled'));
        process.exit(0);
      }
      projectId = input;
    }
    
    if (!title) {
      const input = await text({
        message: 'Issue title:',
        validate: (value) => {
          if (!value) return 'Title is required';
        },
      });
      if (typeof input === 'symbol') {
        logger.info(pc.red('Cancelled'));
        process.exit(0);
      }
      title = input;
    }
    
    s.start('Creating issue...');
    
    const apiUrl = process.env.VEAS_API_URL || 'https://veas.app';
    const response = await fetch(`${apiUrl}/api/issues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ projectId, title, description }),
    });

    if (!response.ok) {
      const error = await response.text();
      s.stop(pc.red('Failed to create issue'));
      logger.error(`API error: ${error}`);
      process.exit(1);
    }

    const issue = await response.json();
    s.stop(pc.green(`✓ Issue created: ${issue.key}`));
  } catch (error) {
    s.stop(pc.red('Failed'));
    logger.error('Error creating issue:', error);
    process.exit(1);
  }
}

export async function testDirectMCP(): Promise<void> {
  const { spinner } = await import('@clack/prompts');
  const s = spinner();
  s.start('Initializing direct MCP server...');
  
  try {
    const authManager = AuthManager.getInstance();
    await authManager.ensureAuthenticated();
    
    const { MCPClient } = await import('../mcp/mcp-client.js');
    const client = new MCPClient();
    
    await client.initialize();
    s.message('Fetching available tools...');
    
    const tools = await client.listTools();
    
    if (!tools || tools.length === 0) {
      s.stop(pc.yellow('No tools available'));
      process.exit(1);
    }
    
    s.stop(pc.green(`✓ Direct MCP test successful! Found ${tools.length} tools`));
    
    logger.info(pc.cyan('Available tools:'));
    tools.slice(0, 5).forEach((tool: any) => {
      logger.info(`  - ${tool.name}: ${tool.description}`);
    });
    if (tools.length > 5) {
      logger.info(`  ... and ${tools.length - 5} more`);
    }
  } catch (error) {
    s.stop(pc.red('Direct MCP test failed'));
    logger.error('Error testing direct MCP:', error);
    process.exit(1);
  }
}