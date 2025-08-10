import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';

// Mock modules before importing AuthManager
vi.mock('axios');
vi.mock('fs/promises');

// Mock os module only for this test file
vi.mock('os', () => ({
  homedir: vi.fn(() => '/tmp/test-home'),
  hostname: vi.fn(() => 'test-host'),
  platform: vi.fn(() => 'darwin'),
  arch: vi.fn(() => 'x64'),
}));

// Import after mocking
import { AuthManager } from './auth-manager';

describe('AuthManager', () => {
  let authManager: AuthManager;
  const mockHomeDir = '/tmp/test-home';
  const expectedConfigDir = path.join(mockHomeDir, '.veas');
  const expectedAuthFile = path.join(expectedConfigDir, 'auth.json');

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com'
  };

  const mockSession = {
    user: mockUser,
    token: 'test-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 86400000 // 1 day from now
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authManager = new AuthManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });


  describe('login', () => {
    it('should successfully login and store encrypted credentials', async () => {
      const email = 'test@example.com';
      const password = 'password123';

      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          user: mockUser,
          token: 'test-token',
          refreshToken: 'refresh-token'
        }
      });

      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined);
      vi.mocked(fs.chmod).mockResolvedValueOnce(undefined);

      const result = await authManager.login(email, password);

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/cli/auth/login'),
        { email, password },
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );

      expect(fs.mkdir).toHaveBeenCalledWith(expectedConfigDir, { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedAuthFile,
        expect.any(String),
        'utf-8'
      );

      expect(result).toEqual({
        user: mockUser,
        token: 'test-token',
      });
    });

    it('should throw error on authentication failure', async () => {
      const email = 'test@example.com';
      const password = 'wrong-password';

      vi.mocked(axios.post).mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          data: { message: 'Invalid credentials' }
        }
      });
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      await expect(authManager.login(email, password)).rejects.toThrow(
        'Authentication failed: Invalid credentials'
      );
    });

    it('should throw error when no user or session returned', async () => {
      const email = 'test@example.com';
      const password = 'password123';

      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {}
      });

      await expect(authManager.login(email, password)).rejects.toThrow(
        'Invalid response from authentication server'
      );
    });
  });

  describe('logout', () => {
    it('should remove auth file and clear credentials', async () => {
      vi.mocked(fs.unlink).mockResolvedValueOnce(undefined);

      await authManager.logout();

      expect(fs.unlink).toHaveBeenCalledWith(expectedAuthFile);
    });

    it('should not throw error if auth file does not exist', async () => {
      vi.mocked(fs.unlink).mockRejectedValueOnce(new Error('File not found'));

      await expect(authManager.logout()).resolves.not.toThrow();
    });
  });

  describe('getSession', () => {
    it('should return stored session from file', async () => {
      const session = {
        user: mockUser,
        token: 'test-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 86400000
      };

      // Mock reading encrypted file
      const encryptedData = 'mock-iv:mock-encrypted-data';
      vi.mocked(fs.readFile).mockResolvedValueOnce(encryptedData);

      // Mock decryption
      const authManagerAny = authManager as any;
      vi.spyOn(authManagerAny, 'decrypt').mockReturnValueOnce(JSON.stringify(session));

      const result = await authManager.getSession();

      expect(fs.readFile).toHaveBeenCalledWith(expectedAuthFile, 'utf-8');
      expect(result).toEqual(session);
    });

    it('should return null if file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('File not found'));

      const result = await authManager.getSession();

      expect(result).toBeNull();
    });

    it('should return null if session is expired', async () => {
      const expiredSession = {
        user: mockUser,
        token: 'test-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() - 1000 // Expired
      };

      // Mock reading encrypted file
      const encryptedData = 'mock-iv:mock-encrypted-data';
      vi.mocked(fs.readFile).mockResolvedValueOnce(encryptedData);
      vi.mocked(fs.unlink).mockResolvedValueOnce(undefined);

      // Mock decryption
      const authManagerAny = authManager as any;
      vi.spyOn(authManagerAny, 'decrypt').mockReturnValueOnce(JSON.stringify(expiredSession));

      const result = await authManager.getSession();

      expect(result).toBeNull();
      expect(fs.unlink).toHaveBeenCalledWith(expectedAuthFile);
    });
  });


  describe('getToken', () => {
    it('should return token from session', async () => {
      const token = 'test-token';
      vi.spyOn(authManager, 'getSession').mockResolvedValueOnce({
        user: mockUser,
        token,
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 86400000
      });

      const result = await authManager.getToken();

      expect(result).toBe(token);
    });

    it('should return null when no session', async () => {
      vi.spyOn(authManager, 'getSession').mockResolvedValueOnce(null);

      const result = await authManager.getToken();

      expect(result).toBeNull();
    });
  });


  describe('encryption/decryption', () => {
    it('should encrypt and decrypt data correctly', () => {
      const authManagerAny = authManager as any;
      const originalData = 'test data to encrypt';

      const encrypted = authManagerAny.encrypt(originalData);
      expect(encrypted).toMatch(/^[a-f0-9]+:[a-f0-9]+$/);

      const decrypted = authManagerAny.decrypt(encrypted);
      expect(decrypted).toBe(originalData);
    });

    it('should throw error for invalid encrypted format', () => {
      const authManagerAny = authManager as any;

      expect(() => authManagerAny.decrypt('invalid-format')).toThrow(
        'Invalid encrypted data format'
      );
    });
  });
});