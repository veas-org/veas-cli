#!/usr/bin/env node

// Load environment variables if .env.local exists
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Try to load .env.local from various locations
const envPaths = [
  join(__dirname, '../../../.env.local'),
  join(__dirname, '../../.env.local'), 
  join(__dirname, '../.env.local'),
  join(process.cwd(), '.env.local')
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    break;
  }
}

// Import and run the CLI
import '../dist/index.js';