#!/bin/bash

# Script to create theme directory structure for a user sandbox
# Usage: ./build.sh <user_id> <sandbox_id>

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

# Create the directory path
THEME_DIR="themes/user_${USER_ID}/theme_${SANDBOX_ID}"

echo "Creating theme directory structure: $THEME_DIR"

# Create the directory with parents if they don't exist
mkdir -p "$THEME_DIR"

# Check if directory was created successfully
if [ -d "$THEME_DIR" ]; then
    echo "✅ Successfully created directory: $THEME_DIR"

    # Create a basic index file to indicate the theme was created
    echo "# Theme $SANDBOX_ID for User $USER_ID" > "$THEME_DIR/README.md"
    echo "Sandbox ID: $SANDBOX_ID" >> "$THEME_DIR/README.md"
    echo "Created: $(date)" >> "$THEME_DIR/README.md"

    echo "✅ Theme initialization complete"
else
    echo "❌ Failed to create directory: $THEME_DIR"
    exit 1
fi