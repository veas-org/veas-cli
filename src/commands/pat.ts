import pc from 'picocolors'
import { logger } from '../utils/logger.js'
import { AuthManager } from '../auth/auth-manager.js'
import { text, select } from '@clack/prompts'

export async function createPAT(): Promise<void> {
  try {
    const authManager = AuthManager.getInstance()
    const isAuthenticated = await authManager.isAuthenticated()

    if (!isAuthenticated) {
      logger.error('Not authenticated. Please run "veas login" first.')
      process.exit(1)
    }

    const token = await authManager.getToken()
    if (!token) {
      logger.error('No authentication token found')
      process.exit(1)
    }

    // Get PAT details from user
    const name = (await text({
      message: 'Personal Access Token name:',
      placeholder: 'My MCP Token',
      validate: (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'Token name is required'
        }
        return undefined
      },
    })) as string

    const scopesInput = (await select({
      message: 'Select token scopes:',
      options: [
        { value: '*', label: 'Full access (all scopes)' },
        { value: 'projects:read,projects:write', label: 'Projects (read & write)' },
        { value: 'issues:read,issues:write', label: 'Issues (read & write)' },
        { value: 'articles:read,articles:write', label: 'Articles (read & write)' },
        { value: 'chat:read,chat:write', label: 'Chat (read & write)' },
        { value: 'custom', label: 'Custom scopes' },
      ],
    })) as string

    let scopes = scopesInput
    if (scopesInput === 'custom') {
      const customScopes = (await text({
        message: 'Enter comma-separated scopes:',
        placeholder: 'projects:read,issues:write',
      })) as string
      scopes = customScopes
    }

    logger.info(pc.cyan('Creating Personal Access Token...'))

    const apiUrl = process.env.VEAS_API_URL || 'https://veas.app'
    const response = await fetch(`${apiUrl}/api/cli/auth/pat/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        scopes: scopes === '*' ? ['*'] : scopes.split(',').map((s) => s.trim()),
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      logger.error(`Failed to create PAT: ${error}`)
      process.exit(1)
    }

    const result = (await response.json()) as { token: string }

    console.log('')
    console.log(pc.green('✓ Personal Access Token created successfully!'))
    console.log('')
    console.log(pc.bold('Token:'))
    console.log(pc.yellow(result.token))
    console.log('')
    console.log(pc.dim("Save this token securely. You won't be able to see it again."))
    console.log('')
    console.log(pc.bold('To use with VEAS CLI:'))
    console.log(pc.cyan(`export VEAS_PAT="${result.token}"`))
    console.log('')
    console.log(pc.bold('To use with Claude MCP:'))
    console.log(
      pc.cyan(`claude mcp add veas -e VEAS_PAT="${result.token}" -- node "${process.cwd()}/bin/veas.js" serve`),
    )
  } catch (error) {
    logger.error('Failed to create Personal Access Token:', error)
    process.exit(1)
  }
}

export async function listPATs(): Promise<void> {
  try {
    const authManager = AuthManager.getInstance()
    const isAuthenticated = await authManager.isAuthenticated()

    if (!isAuthenticated) {
      logger.error('Not authenticated. Please run "veas login" first.')
      process.exit(1)
    }

    const token = await authManager.getToken()
    if (!token) {
      logger.error('No authentication token found')
      process.exit(1)
    }

    const apiUrl = process.env.VEAS_API_URL || 'https://veas.app'
    const response = await fetch(`${apiUrl}/api/cli/auth/pat`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      logger.error(`Failed to list PATs: ${error}`)
      process.exit(1)
    }

    const { tokens } = (await response.json()) as {
      tokens: Array<{ id: string; name: string; created_at: string; last_used_at?: string }>
    }

    if (tokens.length === 0) {
      logger.info('No Personal Access Tokens found.')
      console.log(pc.dim('Run "veas pat create" to create one.'))
      return
    }

    console.log(pc.cyan('Personal Access Tokens:'))
    console.log('')

    tokens.forEach((token, index) => {
      console.log(`${index + 1}. ${pc.bold(token.name)}`)
      console.log(`   Created: ${new Date(token.created_at).toLocaleDateString()}`)
      if (token.last_used_at) {
        console.log(`   Last used: ${new Date(token.last_used_at).toLocaleDateString()}`)
      }
      console.log('')
    })
  } catch (error) {
    logger.error('Failed to list Personal Access Tokens:', error)
    process.exit(1)
  }
}

export async function revokePAT(_tokenId: string): Promise<void> {
  logger.info(pc.yellow('PAT revocation not yet implemented'))
  logger.info(pc.yellow('Feature coming soon'))
}
