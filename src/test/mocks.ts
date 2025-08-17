import type { User } from '@supabase/supabase-js'
import { vol } from 'memfs'
import { vi } from 'vitest'

// Mock Supabase client
export const mockSupabaseClient = {
  auth: {
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
  },
}

// Mock user data
export const mockUser: User = {
  id: 'test-user-id',
  email: 'test@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  confirmation_sent_at: new Date().toISOString(),
  confirmed_at: new Date().toISOString(),
  phone: null,
  role: 'authenticated',
}

// Mock session data
export const mockSession = {
  access_token: 'test-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'test-refresh-token',
  user: mockUser,
}

// Mock MCP tools
export const mockTools = [
  {
    name: 'project_list',
    description: 'List all projects',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'project_create',
    description: 'Create a new project',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['name'],
    },
  },
]

// File system helpers
export function setupMockFileSystem() {
  vol.reset()
  return vol
}

export function mockHomeDir(path: string) {
  vi.spyOn(process, 'homedir' as any).mockReturnValue(path)
}

// Mock fetch responses
export function mockFetchResponse(data: any, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Map([['content-type', 'application/json']]),
  } as unknown as Response)
}
