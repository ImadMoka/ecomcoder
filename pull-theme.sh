#!/bin/bash

# Script to pull Shopify theme into an existing theme directory
# Usage: ./pull-theme.sh <user_id> <sandbox_id> <store_url> <api_key>

set -e  # Exit on any error

# Check if all parameters are provided
if [ $# -lt 4 ]; then
    echo "Error: Missing parameters"
    echo "Usage: $0 <user_id> <sandbox_id> <store_url> <api_key>"
    exit 1
fi

USER_ID=$1
SANDBOX_ID=$2
STORE_URL=$3
API_KEY=$4

# Validate parameters are not empty
if [ -z "$USER_ID" ]; then
    echo "Error: User ID cannot be empty"
    exit 1
fi

if [ -z "$SANDBOX_ID" ]; then
    echo "Error: Sandbox ID cannot be empty"
    exit 1
fi

if [ -z "$STORE_URL" ]; then
    echo "Error: Store URL cannot be empty"
    exit 1
fi

if [ -z "$API_KEY" ]; then
    echo "Error: API Key cannot be empty"
    exit 1
fi

# Get the absolute path to the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define the theme directory path (absolute)
THEME_DIR="${SCRIPT_DIR}/themes/user_${USER_ID}/theme_${SANDBOX_ID}"

# Check if theme directory exists
if [ ! -d "$THEME_DIR" ]; then
    echo "❌ Error: Theme directory does not exist: $THEME_DIR"
    echo "Please create the theme folder first"
    exit 1
fi

echo "🔍 Theme directory found: $THEME_DIR"

# Check if Shopify CLI is installed
if ! command -v shopify &> /dev/null; then
    echo "⚠️  Warning: Shopify CLI not found. Please install it first:"
    echo "   npm install -g @shopify/cli @shopify/theme"
    exit 1
fi

echo "🔄 Pulling live theme from Shopify store: $STORE_URL"
echo "Target directory: $THEME_DIR"

# Run shopify theme pull with explicit path
if shopify theme pull --live --store "$STORE_URL" --password "$API_KEY" --verbose --force --path "$THEME_DIR"; then
    echo "✅ Successfully pulled theme from $STORE_URL"

    # Update README with pull information
    echo "" >> "$THEME_DIR/README.md"
    echo "Theme pulled: $(date)" >> "$THEME_DIR/README.md"
    echo "Store: $STORE_URL" >> "$THEME_DIR/README.md"

    echo "✅ Theme pull complete"
else
    echo "❌ Failed to pull theme from Shopify store"
    echo "Please check your store URL and API key"
    exit 1
fi