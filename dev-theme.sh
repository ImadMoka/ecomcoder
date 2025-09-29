#!/bin/bash

# Script to start Shopify theme development server
# Usage: ./dev-theme.sh <user_id> <sandbox_id> <store_url> <api_key> [store_password] [port]

set -e  # Exit on any error

# Check if minimum parameters are provided
if [ $# -lt 4 ]; then
    echo "Error: Missing parameters"
    echo "Usage: $0 <user_id> <sandbox_id> <store_url> <api_key> [store_password] [port]"
    exit 1
fi

USER_ID=$1
SANDBOX_ID=$2
STORE_URL=$3
API_KEY=$4
STORE_PASSWORD=${5:-""}  # Optional store password
PORT=${6:-3000}          # Default port 3000

# Validate required parameters are not empty
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
    echo "Please run build.sh and pull-theme.sh first"
    exit 1
fi

# Check if theme directory contains theme files (not just README)
THEME_FILES_COUNT=$(find "$THEME_DIR" -name "*.liquid" -o -name "*.json" -o -name "*.js" -o -name "*.css" | wc -l)
if [ "$THEME_FILES_COUNT" -eq 0 ]; then
    echo "❌ Error: No theme files found in $THEME_DIR"
    echo "Please run pull-theme.sh first to download theme files"
    exit 1
fi

echo "🔍 Theme directory found: $THEME_DIR"
echo "📁 Theme files detected: $THEME_FILES_COUNT files"

# Check if Shopify CLI is installed
if ! command -v shopify &> /dev/null; then
    echo "⚠️  Warning: Shopify CLI not found. Please install it first:"
    echo "   npm install -g @shopify/cli @shopify/theme"
    exit 1
fi

echo "🚀 Starting Shopify theme development server..."
echo "   Store: $STORE_URL"
echo "   Port: $PORT"
echo "   Theme Directory: $THEME_DIR"

# Build the shopify theme dev command
SHOPIFY_CMD="shopify theme dev --store=\"$STORE_URL\" --password=\"$API_KEY\" --path=\"$THEME_DIR\" --host=127.0.0.1 --port=$PORT --error-overlay=silent --open"

# Add store password if provided
if [ -n "$STORE_PASSWORD" ]; then
    SHOPIFY_CMD="$SHOPIFY_CMD --store-password=\"$STORE_PASSWORD\""
    echo "   Store Password: [PROTECTED]"
fi

echo ""
echo "🌟 Development server will be available at:"
echo "   Local:  http://127.0.0.1:$PORT"
echo "   Theme:  $THEME_DIR"
echo ""
echo "📝 Note: The development server will:"
echo "   • Upload your theme as a development theme"
echo "   • Provide hot-reload for CSS and sections"
echo "   • Open the preview in your default browser"
echo "   • Show live changes as you edit files"
echo ""
echo "⏹️  Press Ctrl+C to stop the development server"
echo ""

# Run the shopify theme dev command
if eval "$SHOPIFY_CMD"; then
    echo "✅ Development server started successfully"
else
    echo "❌ Failed to start development server"
    echo "Please check:"
    echo "   • Your store URL and API key are correct"
    echo "   • The theme directory contains valid theme files"
    echo "   • Port $PORT is not already in use"
    echo "   • You have proper permissions for the store"
    exit 1
fi