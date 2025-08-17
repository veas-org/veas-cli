#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
// Load environment variables if .env.local exists
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Try to load .env.local from various locations
const envPaths = [
  join(__dirname, '../../../.env.local'),
  join(__dirname, '../../.env.local'),
  join(__dirname, '../.env.local'),
  join(process.cwd(), '.env.local'),
]

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath })
    break
  }
}

// Import and run the CLI
import '../dist/cli.js'
