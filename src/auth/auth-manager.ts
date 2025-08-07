import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import axios from 'axios';
import { logger } from '../utils/logger.js';

export interface User {
  id: string;
  email: string;
  [key: string]: any;
}

export interface Session {
  user: User;
  token: string;
  refreshToken?: string;
  expiresAt?: number;
  patToken?: string;
  email?: string;
  type?: string;
}

export class AuthManager {
  private static instance: AuthManager;
  private configDir: string;
  private authFile: string;
  private encryptionKey: Buffer;
  private apiUrl: string;

  private constructor() {
    this.configDir = path.join(os.homedir(), '.veas');
    this.authFile = path.join(this.configDir, 'auth.json');
    // Use machine ID as encryption key source
    const machineId = os.hostname() + os.platform() + os.arch();
    this.encryptionKey = crypto.scryptSync(machineId, 'veas-cli-salt', 32);
    this.apiUrl = process.env.VEAS_API_URL || 'https://veas.app';
  }

  private async ensureConfigDir() {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const parts = text.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }
    const iv = Buffer.from(parts[0]!, 'hex');
    const encryptedText = parts[1]!;
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    try {
      // Call Veas API directly for authentication
      const response = await axios.post(
        `${this.apiUrl}/api/cli/auth/login`,
        { email, password },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'veas-cli/0.1.0'
          }
        }
      );

      const { user, token, refreshToken } = response.data;

      if (!user || !token) {
        throw new Error('Invalid response from authentication server');
      }

      await this.saveSession({
        user,
        token,
        refreshToken,
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
      });

      logger.debug('Login successful', { userId: user.id });
      return { user, token };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        throw new Error(`Authentication failed: ${message}`);
      }
      throw error;
    }
  }

  async loginWithToken(pat: string): Promise<{ user: User; token: string }> {
    try {
      // Validate PAT with API
      const response = await axios.post(
        `${this.apiUrl}/api/cli/auth/validate-pat`,
        { token: pat },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'veas-cli/0.1.0'
          }
        }
      );

      const { user } = response.data;

      if (!user) {
        throw new Error('Invalid personal access token');
      }

      await this.saveSession({
        user,
        token: pat,
        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days for PAT
      });

      logger.debug('PAT login successful', { userId: user.id });
      return { user, token: pat };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        throw new Error(`Token validation failed: ${message}`);
      }
      throw error;
    }
  }

  async loginWithDeviceCode(): Promise<{ user: User; token: string }> {
    try {
      // Initialize device code flow
      const initResponse = await axios.post(
        `${this.apiUrl}/api/cli/auth/device/init`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'veas-cli/0.1.0'
          }
        }
      );

      const { device_code, user_code, verification_url, expires_in, interval } = initResponse.data;

      // Show user the verification URL and code
      console.log('\n🔐 Please visit: ' + verification_url);
      console.log('📝 Enter code: ' + user_code);
      console.log('\nWaiting for authorization...\n');

      // Poll for authorization
      const startTime = Date.now();
      const expiryTime = startTime + (expires_in * 1000);

      while (Date.now() < expiryTime) {
        await new Promise(resolve => setTimeout(resolve, interval * 1000));

        try {
          const pollResponse = await axios.post(
            `${this.apiUrl}/api/cli/auth/device/poll`,
            { device_code },
            {
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'veas-cli/0.1.0'
              }
            }
          );

          if (pollResponse.data.status === 'authorized') {
            const { user, token, refreshToken } = pollResponse.data;

            await this.saveSession({
              user,
              token,
              refreshToken,
              expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000)
            });

            logger.debug('Device flow login successful', { userId: user.id });
            return { user, token };
          }
        } catch (error: any) {
          // Continue polling if it's a pending status
          if (error.response?.status === 428) {
            continue;
          }
          throw error;
        }
      }

      throw new Error('Device authorization timeout');
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        throw new Error(`Device flow failed: ${message}`);
      }
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await fs.unlink(this.authFile);
      logger.debug('Logged out successfully');
    } catch (error) {
      // File might not exist
    }
  }

  async getSession(): Promise<Session | null> {
    try {
      const data = await fs.readFile(this.authFile, 'utf-8');
      const decrypted = this.decrypt(data);
      const session = JSON.parse(decrypted) as Session;

      // Check if session is expired
      if (session.expiresAt && session.expiresAt < Date.now()) {
        await this.logout();
        return null;
      }

      return session;
    } catch (error) {
      return null;
    }
  }

  async getToken(): Promise<string | null> {
    const session = await this.getSession();
    return session?.token || null;
  }

  private async saveSession(session: Session): Promise<void> {
    await this.ensureConfigDir();
    const encrypted = this.encrypt(JSON.stringify(session));
    await fs.writeFile(this.authFile, encrypted, 'utf-8');
    // Set restrictive permissions
    await fs.chmod(this.authFile, 0o600);
  }

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  // Backward compatibility methods
  async getCredentials(): Promise<Session | null> {
    return this.getSession();
  }

  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    return session !== null && !!session.token;
  }

  async refreshToken(): Promise<void> {
    const session = await this.getSession();
    if (!session) {
      throw new Error('No stored session found');
    }
    // For now, just log out to force re-login
    await this.logout();
  }

  async createPAT(name: string, scopes: string[] = ['read', 'write']): Promise<string> {
    const session = await this.getSession();
    if (!session) {
      throw new Error('Not authenticated. Please login first.');
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/api/cli/pat/create`,
        { name, scopes },
        {
          headers: {
            'Authorization': `Bearer ${session.token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'veas-cli/0.1.0'
          }
        }
      );

      return response.data.token;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        throw new Error(`Failed to create PAT: ${message}`);
      }
      throw error;
    }
  }

  async listPATs(): Promise<any[]> {
    const session = await this.getSession();
    if (!session) {
      throw new Error('Not authenticated. Please login first.');
    }

    try {
      const response = await axios.get(
        `${this.apiUrl}/api/cli/pat/list`,
        {
          headers: {
            'Authorization': `Bearer ${session.token}`,
            'User-Agent': 'veas-cli/0.1.0'
          }
        }
      );

      return response.data.tokens || [];
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        throw new Error(`Failed to list PATs: ${message}`);
      }
      throw error;
    }
  }
}