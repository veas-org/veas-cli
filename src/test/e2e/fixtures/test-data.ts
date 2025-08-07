/**
 * Common test data fixtures for E2E tests
 */

export const TEST_PROJECTS = {
  webPlatform: {
    id: 'test-proj-web',
    name: 'Web Platform',
    key: 'WEB',
    description: 'Main web application platform',
  },
  mobileApp: {
    id: 'test-proj-mobile',
    name: 'Mobile App',
    key: 'MOB',
    description: 'Mobile application for iOS and Android',
  },
  apiServices: {
    id: 'test-proj-api',
    name: 'API Services',
    key: 'API',
    description: 'Backend API services',
  },
};

export const TEST_ISSUES = {
  sampleTask: {
    summary: 'E2E Test Task',
    description: 'This is a test task created by E2E tests',
    issue_type: 'task',
    priority: 'medium',
    status: 'todo',
  },
  sampleBug: {
    summary: 'E2E Test Bug',
    description: 'This is a test bug report',
    issue_type: 'bug',
    priority: 'high',
    status: 'todo',
  },
  sampleStory: {
    summary: 'E2E Test User Story',
    description: 'As a user, I want to test E2E functionality',
    issue_type: 'story',
    priority: 'medium',
    status: 'todo',
  },
};

export const TEST_USERS = {
  testUser: {
    id: 'test-user-001',
    email: 'e2e-test@example.com',
    username: 'e2e-tester',
    first_name: 'E2E',
    last_name: 'Tester',
  },
  adminUser: {
    id: 'test-admin-001',
    email: 'e2e-admin@example.com',
    username: 'e2e-admin',
    first_name: 'Admin',
    last_name: 'Tester',
  },
};

export const TEST_ARTICLES = {
  sampleArticle: {
    title: 'E2E Test Article',
    content: '# Test Article\n\nThis is a test article created by E2E tests.',
    tags: ['test', 'e2e', 'automation'],
    folder_id: null,
  },
};

export const TEST_ERROR_SCENARIOS = {
  networkErrors: [
    {
      name: 'Connection Timeout',
      apiUrl: 'http://10.255.255.1', // Non-routable IP
      expectedError: /timeout/i,
    },
    {
      name: 'DNS Failure',
      apiUrl: 'http://non-existent-domain-xyz123.local',
      expectedError: /ENOTFOUND|dns/i,
    },
    {
      name: 'Connection Refused',
      apiUrl: 'http://localhost:54321',
      expectedError: /ECONNREFUSED|connection/i,
    },
  ],
  authErrors: [
    {
      name: 'Invalid Token Format',
      token: 'invalid_token_format',
      expectedError: /invalid|auth/i,
    },
    {
      name: 'Expired Token',
      token: 'mcp_exp_1234567890abcdef1234567890abcdef',
      expectedError: /expired|invalid/i,
    },
    {
      name: 'Missing Token',
      token: null,
      expectedError: /required|missing|auth/i,
    },
  ],
};

export const PERFORMANCE_THRESHOLDS = {
  connectionTimeout: 5000, // 5 seconds
  toolListTimeout: 2000, // 2 seconds
  toolExecutionTimeout: 10000, // 10 seconds
  avgResponseTime: 1000, // 1 second average
  maxResponseTime: 5000, // 5 seconds max
};

/**
 * Generate test data with timestamps
 */
export function generateTestData(prefix: string = 'e2e') {
  const timestamp = Date.now();
  
  return {
    project: {
      name: `${prefix}-project-${timestamp}`,
      description: `Test project created at ${new Date().toISOString()}`,
      key: `${prefix.toUpperCase()}${timestamp.toString().slice(-4)}`,
    },
    issue: {
      summary: `${prefix} Test Issue ${timestamp}`,
      description: `Test issue created at ${new Date().toISOString()}`,
      issue_type: 'task',
      priority: 'medium',
    },
    article: {
      title: `${prefix} Test Article ${timestamp}`,
      content: `# Test Article\n\nCreated at ${new Date().toISOString()}`,
      tags: [prefix, 'test', 'automated'],
    },
  };
}

/**
 * Clean up test data markers
 */
export function isTestData(item: any): boolean {
  const testPrefixes = ['e2e', 'test', 'E2E Test'];
  const testPatterns = [
    /e2e[-_]test/i,
    /test[-_]\d+/i,
    /E2E Test/i,
  ];
  
  const checkString = (str: string) => {
    return testPrefixes.some(prefix => str.includes(prefix)) ||
           testPatterns.some(pattern => pattern.test(str));
  };
  
  return (
    (item.name && checkString(item.name)) ||
    (item.title && checkString(item.title)) ||
    (item.summary && checkString(item.summary))
  );
}