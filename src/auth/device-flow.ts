import { spinner } from '@clack/prompts';
import pc from 'picocolors';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
}

export class OAuthDeviceFlow {
  private apiUrl: string;

  constructor(apiUrl: string = process.env.VEAS_API_URL || 'https://veas.app') {
    this.apiUrl = apiUrl;
  }

  async initiateDeviceFlow(): Promise<DeviceCodeResponse> {
    const response = await fetch(`${this.apiUrl}/api/cli/auth/device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: 'veas-cli',
        scope: 'full_access', // Request full access for CLI
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to initiate device flow: ${error}`);
    }

    return response.json() as Promise<DeviceCodeResponse>;
  }

  async pollForToken(deviceCode: string, interval: number): Promise<TokenResponse> {
    const pollInterval = Math.max(interval * 1000, 5000); // Minimum 5 seconds
    
    logger.debug('[Device Flow] Starting to poll for token...');
    logger.debugSensitive('[Device Flow] Device code:', deviceCode);
    logger.debug('[Device Flow] Poll interval:', pollInterval, 'ms');
    
    while (true) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      try {
        logger.debug('[Device Flow] Polling for token...');
        const response = await fetch(`${this.apiUrl}/api/cli/auth/device/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: deviceCode,
            client_id: 'veas-cli',
          }),
        });

        logger.debug('[Device Flow] Poll response status:', response.status);

        if (response.ok) {
          const tokenData = await response.json() as TokenResponse;
          logger.debugSensitive('[Device Flow] Token received:', {
            has_access_token: !!tokenData.access_token,
            has_refresh_token: !!tokenData.refresh_token,
            token_type: tokenData.token_type,
            scope: tokenData.scope,
            has_user: !!(tokenData as any).user,
            user: (tokenData as any).user,
            access_token_prefix: tokenData.access_token ? tokenData.access_token.substring(0, 10) + '...' : 'none'
          });
          
          // Ensure user is passed through
          if ((tokenData as any).user) {
            (tokenData as any).user = (tokenData as any).user;
          }
          
          return tokenData;
        }

        const error = await response.json() as any;
        logger.debug('[Device Flow] Poll error:', error);
        
        if (error.error === 'authorization_pending') {
          // Continue polling
          logger.debug('[Device Flow] Authorization pending, continuing to poll...');
          continue;
        } else if (error.error === 'slow_down') {
          // Increase polling interval
          logger.debug('[Device Flow] Slowing down poll rate...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          logger.error('[Device Flow] Poll failed with error:', error);
          throw new Error(error.error_description || error.error);
        }
      } catch (error) {
        logger.error('[Device Flow] Poll exception:', error);
        if (error instanceof Error && error.message.includes('authorization_pending')) {
          continue;
        }
        throw error;
      }
    }
  }

  async openBrowser(url: string): Promise<void> {
    const platform = process.platform;
    let command: string;

    if (platform === 'darwin') {
      command = `open "${url}"`;
    } else if (platform === 'win32') {
      command = `start "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    try {
      await execAsync(command);
    } catch (error) {
      // If opening browser fails, just show the URL
      logger.warn('Could not open browser automatically.');
      logger.info(pc.cyan('Please visit this URL to authenticate:'));
      logger.info(pc.underline(url));
    }
  }

  async authenticate(): Promise<TokenResponse> {
    const s = spinner();
    
    try {
      // Step 1: Get device code
      s.start('Initiating authentication...');
      const deviceResponse = await this.initiateDeviceFlow();
      s.stop();

      // Step 2: Show user code and open browser
      logger.debug('Original verification_uri:', deviceResponse.verification_uri);
      logger.debug('Original verification_uri_complete:', deviceResponse.verification_uri_complete);
      
      // For local development, replace veas.app with localhost:3000 in the verification URLs
      let verificationUri = deviceResponse.verification_uri;
      let verificationUriComplete = deviceResponse.verification_uri_complete;
      
      if (this.apiUrl.includes('localhost')) {
        verificationUri = verificationUri.replace('https://veas.app', 'http://localhost:3000');
        if (verificationUriComplete) {
          verificationUriComplete = verificationUriComplete.replace('https://veas.app', 'http://localhost:3000');
        }
      }
      
      logger.debug('Replaced verification_uri:', verificationUri);
      logger.debug('Replaced verification_uri_complete:', verificationUriComplete);
      
      logger.info(pc.cyan('\nTo authenticate, visit:'));
      logger.info(pc.bold(pc.underline(verificationUri)));
      logger.info(pc.cyan('\nAnd enter this code:'));
      logger.info(pc.bold(pc.green(deviceResponse.user_code)));
      logger.info('');

      // Try to open browser
      if (verificationUriComplete) {
        await this.openBrowser(verificationUriComplete);
      } else {
        await this.openBrowser(verificationUri);
      }

      // Step 3: Poll for completion
      s.start('Waiting for authentication...');
      const tokenResponse = await this.pollForToken(
        deviceResponse.device_code,
        deviceResponse.interval
      );
      s.stop(pc.green('Authentication successful!'));

      return tokenResponse;
    } catch (error) {
      s.stop(pc.red('Authentication failed'));
      throw error;
    }
  }
}