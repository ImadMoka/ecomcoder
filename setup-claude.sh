#!/bin/bash

# Script to set up Claude integration files in a theme directory
# Usage: ./setup-claude.sh <user_id> <sandbox_id>

set -e  # Exit on any error

# Check if both parameters are provided
if [ $# -lt 2 ]; then
    echo "Error: Missing parameters"
    echo "Usage: $0 <user_id> <sandbox_id>"
    exit 1
fi

USER_ID=$1
SANDBOX_ID=$2

# Validate parameters are not empty
if [ -z "$USER_ID" ]; then
    echo "Error: User ID cannot be empty"
    exit 1
fi

if [ -z "$SANDBOX_ID" ]; then
    echo "Error: Sandbox ID cannot be empty"
    exit 1
fi

# Get the absolute path to the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define paths
THEME_DIR="${SCRIPT_DIR}/themes/user_${USER_ID}/theme_${SANDBOX_ID}"
TEMPLATE_FILE="${SCRIPT_DIR}/claude-assistant-template.ts"
TARGET_FILE="${THEME_DIR}/claude-assistant.ts"
CLAUDE_MD_FILE="${THEME_DIR}/CLAUDE.md"

echo "🤖 Setting up Claude integration for theme: ${THEME_DIR}"

# Check if theme directory exists
if [ ! -d "$THEME_DIR" ]; then
    echo "❌ Error: Theme directory does not exist: $THEME_DIR"
    echo "Please ensure theme has been created and pulled first"
    exit 1
fi

# Check if template file exists
if [ ! -f "$TEMPLATE_FILE" ]; then
    echo "❌ Error: Claude assistant template not found: $TEMPLATE_FILE"
    exit 1
fi

# Copy claude-assistant-template.ts to theme directory
echo "📋 Copying Claude assistant template..."
if cp "$TEMPLATE_FILE" "$TARGET_FILE"; then
    echo "✅ Successfully copied claude-assistant.ts to theme directory"
else
    echo "❌ Failed to copy Claude assistant template"
    exit 1
fi

# Create basic CLAUDE.md file if it doesn't exist
if [ ! -f "$CLAUDE_MD_FILE" ]; then
    echo "📝 Creating CLAUDE.md analysis file..."
    cat > "$CLAUDE_MD_FILE" << 'EOF'

This is the CLAUDE.md file for the theme.

Its empty for now.

EOF
    echo "✅ Successfully created CLAUDE.md analysis file"
else
    echo "ℹ️  CLAUDE.md already exists, skipping creation"
fi

# Verify files were created
if [ -f "$TARGET_FILE" ]; then
    echo "✅ Claude integration setup complete!"
    echo "   📄 claude-assistant.ts: $(ls -lh "$TARGET_FILE" | awk '{print $5}')"
    if [ -f "$CLAUDE_MD_FILE" ]; then
        echo "   📄 CLAUDE.md: $(ls -lh "$CLAUDE_MD_FILE" | awk '{print $5}')"
    fi
else
    echo "❌ Claude integration setup failed"
    exit 1
fi