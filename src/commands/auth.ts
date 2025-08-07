import { text, password, spinner, select } from '@clack/prompts';
import pc from 'picocolors';
import { AuthManager } from '../auth/auth-manager.js';
import { OAuthDeviceFlow } from '../auth/device-flow.js';
import { logger } from '../utils/logger.js';

export async function login(options?: { method?: 'password' | 'web' | 'token' }) {
  logger.info(pc.cyan('Login to Veas'));

  const authManager = AuthManager.getInstance();
  
  // Determine login method
  let method = options?.method;
  if (!method) {
    const selected = await select({
      message: 'How would you like to authenticate?',
      options: [
        { value: 'web', label: 'Web browser (recommended)', hint: 'Opens browser for secure authentication' },
        { value: 'password', label: 'Email & password', hint: 'Traditional login' },
        { value: 'token', label: 'Personal access token', hint: 'Use existing token' },
      ],
    });

    if (typeof selected === 'symbol') {
      logger.info(pc.red('Login cancelled'));
      process.exit(0);
    }
    
    method = selected as 'password' | 'web' | 'token';
  }

  try {
    switch (method) {
      case 'web':
        await loginWithWeb(authManager);
        break;
      case 'token':
        await loginWithToken(authManager);
        break;
      case 'password':
      default:
        await loginWithPassword(authManager);
        break;
    }
  } catch (error) {
    logger.error((error as Error).message);
    process.exit(1);
  }
}

async function loginWithWeb(authManager: AuthManager) {
  const deviceFlow = new OAuthDeviceFlow();
  
  try {
    logger.debug('[Login] Starting web authentication flow...');
    const tokenResponse = await deviceFlow.authenticate();
    logger.debugSensitive('[Login] Token response received:', {
      has_access_token: !!tokenResponse.access_token,
      has_refresh_token: !!tokenResponse.refresh_token,
      token_type: tokenResponse.token_type
    });
    
    logger.debug('[Login] Calling loginWithDevice...');
    const { user } = await authManager.loginWithDeviceCode();
    
    logger.debug('[Login] Login successful!');
    const extendedUser = user as any;
    const displayName = extendedUser.first_name && extendedUser.last_name
      ? `${extendedUser.first_name} ${extendedUser.last_name}`
      : extendedUser.username || user.email || user.id;
    logger.info(`Logged in as ${pc.green(displayName)}`);
    logger.info(pc.dim('Authentication credentials saved securely'));
    
    // Check if we received a PAT
    const session = await authManager.getSession();
    if ((session as any)?.patToken) {
      logger.info('');
      logger.info(pc.cyan('✨ Personal Access Token created for MCP integration'));
      logger.info(pc.dim('Your CLI can now communicate with MCP-enabled tools'));
    }
  } catch (error) {
    logger.error('[Login] Web authentication error:', error);
    throw new Error(`Web authentication failed: ${(error as Error).message}`);
  }
}

async function loginWithToken(authManager: AuthManager): Promise<void> {
  const token = await text({
    message: 'Personal Access Token:',
    validate: (value) => {
      if (!value || value.length < 10) {
        return 'Please enter a valid token';
      }
      return;
    },
  });

  if (typeof token === 'symbol') {
    logger.info(pc.red('Login cancelled'));
    process.exit(0);
  }

  const s = spinner();
  s.start('Validating token...');

  try {
    const { user } = await authManager.loginWithToken(token);
    const extendedUser = user as any;
    const displayName = extendedUser.first_name && extendedUser.last_name
      ? `${extendedUser.first_name} ${extendedUser.last_name}`
      : extendedUser.username || user.email || user.id;
    s.stop(`Logged in as ${pc.green(displayName)}`);
    logger.info(pc.dim('Authentication credentials saved securely'));
  } catch (error) {
    s.stop(pc.red('Token validation failed'));
    throw error;
  }
}

async function loginWithPassword(authManager: AuthManager): Promise<void> {
  let email: string;
  let pass: string;
  
  // Check for CI mode with environment variables
  if (process.env.CI && process.env.VEAS_EMAIL && process.env.VEAS_PASSWORD) {
    email = process.env.VEAS_EMAIL;
    pass = process.env.VEAS_PASSWORD;
    logger.debug('[Login] Using credentials from environment variables');
  } else {
    // Interactive mode
    const emailInput = await text({
      message: 'Email:',
      validate: (value) => {
        if (!value || !value.includes('@')) {
          return 'Please enter a valid email';
        }
        return;
      },
    });

    if (typeof emailInput === 'symbol') {
      logger.info(pc.red('Login cancelled'));
      process.exit(0);
    }
    email = emailInput;

    const passInput = await password({
      message: 'Password:',
      validate: (value) => {
        if (!value || value.length < 6) {
          return 'Password must be at least 6 characters';
        }
        return;
      },
    });
    
    if (typeof passInput === 'symbol') {
      logger.info(pc.red('Login cancelled'));
      process.exit(0);
    }
    pass = passInput;
  }

  const s = spinner();
  s.start('Logging in...');

  try {
    const { user } = await authManager.login(email, pass);
    const extendedUser = user as any;
    const displayName = extendedUser.first_name && extendedUser.last_name
      ? `${extendedUser.first_name} ${extendedUser.last_name}`
      : extendedUser.username || user.email || 'User';
    s.stop(`Logged in as ${pc.green(displayName)}`);
    logger.info(pc.dim('Authentication credentials saved securely'));
  } catch (error) {
    s.stop(pc.red('Login failed'));
    throw error;
  }
}

export async function logout() {
  const s = spinner();
  s.start('Logging out...');

  try {
    const authManager = AuthManager.getInstance();
    await authManager.logout();
    
    s.stop('Logged out successfully');
  } catch (error) {
    s.stop(pc.red('Logout failed'));
    logger.error((error as Error).message);
    process.exit(1);
  }
}

export async function status() {
  try {
    const authManager = AuthManager.getInstance();
    const session = await authManager.getSession();
    
    if (!session) {
      logger.info(pc.yellow('Not logged in'));
      logger.info(pc.dim('Run "veas login" to authenticate'));
      return;
    }

    logger.info(pc.green('Logged in'));
    
    // Display user information
    const user = session.user;
    const displayName = (user as any)?.first_name && (user as any)?.last_name
      ? `${(user as any).first_name} ${(user as any).last_name}`
      : (user as any)?.username 
      ? (user as any).username
      : 'User';
    
    logger.info(pc.dim(`Name: ${displayName}`));
    logger.info(pc.dim(`Email: ${user?.email || 'N/A'}`));
    
    if ((user as any)?.username) {
      logger.info(pc.dim(`Username: ${(user as any).username}`));
    }
    
    if (user?.id) {
      logger.info(pc.dim(`User ID: ${user.id}`));
    }
    
    logger.info(pc.dim(`Auth type: ${(session as any)?.type || 'standard'}`));
    
    // Show PAT status
    if ((session as any)?.patToken) {
      logger.info(pc.dim(`MCP Token: ${pc.green('✓')} Personal Access Token available`));
    } else {
      logger.info(pc.dim(`MCP Token: ${pc.yellow('✗')} No PAT (run 'veas pat create' to add one)`));
    }
  } catch (error) {
    logger.error('Error checking status:', error);
    process.exit(1);
  }
}