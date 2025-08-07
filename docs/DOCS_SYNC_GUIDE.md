# Veas Docs Sync Guide

The `veas docs-sync` command allows you to automatically sync your local documentation files to the Veas knowledge base.

## Quick Start

1. **Initialize configuration**:
   ```bash
   veas docs-init
   ```
   This creates a `.veas-config.yaml` file in your current directory.

2. **Configure your settings**:
   Edit `.veas-config.yaml` to match your documentation structure:
   ```yaml
   version: 1
   publication:
     name: "My Project Docs"
     description: "Documentation for my project"
   sync:
     root: "./docs"
     include:
       - "**/*.md"
   ```

3. **Run sync**:
   ```bash
   veas docs-sync
   ```

## Configuration

### Publication Settings

```yaml
publication:
  name: "My Project Documentation"       # Required
  description: "Official documentation"   # Optional
  subdomain: "my-project-docs"           # Optional, auto-generated from name
  organization_id: "org-uuid"            # Optional, uses default org
```

### Sync Settings

The sync configuration supports multiple root directories:

```yaml
sync:
  # Multiple root directories (relative to config file)
  roots:
    - path: "./docs"
      include:
        - "**/*.md"
        - "**/*.mdx"
      exclude:
        - "**/node_modules/**"
        - "**/draft-*"
      folders:
        - local: "getting-started"
          remote: "Getting Started"
          description: "Quick start guides"
    
    - path: "./packages"
      include:
        - "*/README.md"
        - "*/docs/**/*.md"
      folders:
        - local: "."
          remote: "Package Documentation"
```

You can also use a simplified single-root configuration:

```yaml
sync:
  root: "./docs"  # Legacy single root (converted to roots internally)
  include:
    - "**/*.md"
  folders:
    - local: "api"
      remote: "API Reference"
```

### Metadata

Control how metadata is extracted from files:

```yaml
sync:
  metadata:
    frontmatter: true                    # Extract YAML front matter
    defaults:
      status: "published"                # Default status
      tags: ["documentation"]            # Default tags
```

### Sync Behavior

Configure how sync handles conflicts:

```yaml
sync:
  behavior:
    missing_remote: "create"             # What to do with new local files
    missing_local: "archive"             # What to do with deleted local files
    update_strategy: "modified"          # When to update existing articles
    preserve_remote:                     # Remote fields to preserve
      - "views_count"
      - "rating"
```

## Commands

### Basic Sync

```bash
# Sync all documents
veas docs-sync

# Dry run (preview changes)
veas docs-sync --dry-run

# Force update all files
veas docs-sync --force

# Sync specific folder
veas docs-sync --folder api
```

### Watch Mode

Automatically sync when files change:

```bash
veas docs-sync --watch
```

### Custom Config

Use a different configuration file:

```bash
veas docs-sync --config ./custom-config.yaml
```

## Front Matter Support

The sync command supports YAML front matter in your markdown files:

```markdown
---
title: Getting Started Guide
status: published
tags:
  - tutorial
  - beginner
---

# Getting Started

Your content here...
```

## Sync Strategies

### Update Strategy

- `always`: Always update remote articles
- `modified`: Only update if content changed (default)
- `never`: Never update existing articles

### Missing Remote

What to do when a local file has no corresponding remote article:

- `create`: Create new article (default)
- `skip`: Skip the file
- `warn`: Show warning and skip

### Missing Local

What to do when a remote article has no corresponding local file:

- `archive`: Archive the article (default)
- `delete`: Delete the article (use with caution)
- `skip`: Leave unchanged
- `warn`: Show warning and leave unchanged

## Example Workflow

1. **Set up your documentation structure**:
   ```
   docs/
   ├── getting-started/
   │   ├── installation.md
   │   └── quick-start.md
   ├── guides/
   │   ├── advanced-usage.md
   │   └── troubleshooting.md
   └── api/
       ├── rest-api.md
       └── graphql.md
   ```

2. **Create configuration**:
   ```bash
   veas docs-init
   ```

3. **Edit `.veas-config.yaml`** to map your folders

4. **Initial sync**:
   ```bash
   veas docs-sync --dry-run  # Preview
   veas docs-sync            # Execute
   ```

5. **Set up watch mode** for development:
   ```bash
   veas docs-sync --watch
   ```

## CI/CD Integration

You can integrate docs sync into your CI/CD pipeline:

```yaml
# GitHub Actions example
- name: Sync Documentation
  env:
    VEAS_PAT: ${{ secrets.VEAS_PAT }}
  run: |
    npm install -g @m9sh/veas-cli
    veas docs-sync --force
```

## Troubleshooting

### Authentication Issues

Make sure you're logged in:
```bash
veas login
veas pat create  # Create a PAT for CI/CD
```

### File Not Found

Check your `sync.root` path is relative to the config file location.

### Sync Conflicts

Use `--dry-run` to preview changes before syncing:
```bash
veas docs-sync --dry-run
```

### Debug Mode

Enable verbose logging:
```bash
veas -v docs-sync
```