#!/bin/bash

# Setup script for local development
# This creates a veas-dev command that points to the local build

echo "Setting up local development environment..."

# Build the project
npm run build:force

# Make the dev script executable
chmod +x bin/veas-dev.js

# Create a symlink for veas-dev
npm link

# Create an additional symlink for veas-dev if it doesn't exist
if command -v veas &> /dev/null; then
    VEAS_PATH=$(which veas)
    VEAS_DIR=$(dirname "$VEAS_PATH")
    
    # Create veas-dev symlink pointing to the same target as veas
    if [ -L "$VEAS_PATH" ]; then
        TARGET=$(readlink "$VEAS_PATH")
        ln -sf "$TARGET" "$VEAS_DIR/veas-dev"
        echo "Created veas-dev symlink in $VEAS_DIR"
    fi
fi

echo "Setup complete! You can now use 'veas-dev' for local development."
echo "Production deployments will still use 'veas' command."