import { vi } from 'vitest'

// Mock environment variables
process.env.VEAS_API_URL = 'http://localhost:3000'
process.env.NODE_ENV = 'test'

// Mock os module globally
vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/tmp/test-home'),
    hostname: vi.fn(() => 'test-host'),
    platform: vi.fn(() => 'darwin'),
    arch: vi.fn(() => 'x64'),
  },
  homedir: vi.fn(() => '/tmp/test-home'),
  hostname: vi.fn(() => 'test-host'),
  platform: vi.fn(() => 'darwin'),
  arch: vi.fn(() => 'x64'),
}))
