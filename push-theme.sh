#!/bin/bash

# ========================================================================
# SHOPIFY THEME PUSH AS UNPUBLISHED
# ========================================================================
#
# Pushes the pulled theme as a new unpublished development theme
# and returns the theme ID for database storage.
#
# USAGE: ./push-theme.sh <user_id> <sandbox_id> <store_url> <api_key>
#
# OUTPUT: JSON with theme information including theme ID
# ========================================================================

set -e  # Exit on any error

# ========================================================================
# STEP 1: PARAMETER VALIDATION
# ========================================================================

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

# ========================================================================
# STEP 2: ENVIRONMENT VALIDATION
# ========================================================================

# Get the absolute path to the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define the theme directory path (absolute)
THEME_DIR="${SCRIPT_DIR}/themes/user_${USER_ID}/theme_${SANDBOX_ID}"

# Check if theme directory exists
if [ ! -d "$THEME_DIR" ]; then
    echo "❌ Error: Theme directory does not exist: $THEME_DIR"
    echo "Please run pull-theme.sh first to download theme files"
    exit 1
fi

echo "🔍 Theme directory found: $THEME_DIR"

# Check if theme directory contains theme files
THEME_FILES_COUNT=$(find "$THEME_DIR" -name "*.liquid" -o -name "*.json" -o -name "*.js" -o -name "*.css" | wc -l)
if [ "$THEME_FILES_COUNT" -eq 0 ]; then
    echo "❌ Error: No theme files found in $THEME_DIR"
    echo "Please run pull-theme.sh first to download theme files"
    exit 1
fi

echo "📁 Theme files detected: $THEME_FILES_COUNT files"

# ========================================================================
# STEP 3: DEPENDENCY VALIDATION
# ========================================================================

# Check if Shopify CLI is installed
if ! command -v shopify &> /dev/null; then
    echo "❌ Error: Shopify CLI not found. Please install it first:"
    echo "   npm install -g @shopify/cli @shopify/theme"
    exit 1
fi

echo "✅ Shopify CLI found"

# ========================================================================
# STEP 4: PUSH THEME AS UNPUBLISHED
# ========================================================================

# Set theme name
THEME_NAME="ecomCoder-theme"

echo "🚀 Pushing theme to Shopify as unpublished development theme..."
echo "   Store:      $STORE_URL"
echo "   Theme Name: $THEME_NAME"
echo "   Path:       $THEME_DIR"
echo ""

# Create temporary file for JSON output
TEMP_OUTPUT=$(mktemp)

# Run shopify theme push with --json flag to get structured output
# --no-color suppresses ANSI escape codes for cleaner JSON parsing
# Redirect stderr to /dev/null to suppress progress bars, keep only JSON output
if shopify theme push \
    --store "$STORE_URL" \
    --password "$API_KEY" \
    --theme "$THEME_NAME" \
    --path "$THEME_DIR" \
    --unpublished \
    --json \
    --no-color > "$TEMP_OUTPUT" 2>/dev/null; then

    echo "✅ Successfully pushed theme to Shopify"

    # Read the JSON output
    JSON_OUTPUT=$(cat "$TEMP_OUTPUT")

    # Clean up any remaining escape sequences and progress bars
    # Remove ANSI escape codes and control characters
    JSON_CLEAN=$(echo "$JSON_OUTPUT" | sed 's/\x1B\[[0-9;]*[a-zA-Z]//g' | tr -d '\r')

    # Extract only the JSON part (starts with { and ends with })
    JSON_ONLY=$(echo "$JSON_CLEAN" | grep -o '{.*}' | head -1)

    # Display the cleaned JSON for debugging
    echo ""
    echo "📋 Shopify Response (cleaned):"
    echo "$JSON_ONLY"
    echo ""

    # Extract theme ID using multiple methods for reliability
    # Method 1: Use jq if available
    if command -v jq &> /dev/null; then
        THEME_ID=$(echo "$JSON_ONLY" | jq -r '.theme.id // empty' 2>/dev/null)
    fi

    # Method 2: Fallback to grep/sed if jq not available or failed
    if [ -z "$THEME_ID" ]; then
        THEME_ID=$(echo "$JSON_ONLY" | grep -o '"id"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | grep -o '[0-9]*')
    fi

    # Validate we got a theme ID
    if [ -n "$THEME_ID" ] && [ "$THEME_ID" -gt 0 ] 2>/dev/null; then
        echo "✅ Theme ID extracted: $THEME_ID"

        # Output machine-readable format for Node.js service to parse
        echo ""
        echo "THEME_ID=$THEME_ID"
        echo "THEME_NAME=$THEME_NAME"
        echo "THEME_ROLE=unpublished"
        echo ""

        # Also output the full JSON for comprehensive parsing
        echo "THEME_JSON_START"
        echo "$JSON_OUTPUT"
        echo "THEME_JSON_END"

        # Clean up
        rm -f "$TEMP_OUTPUT"

        echo "✅ Theme push complete"
        exit 0
    else
        echo "❌ Error: Failed to extract theme ID from response"
        echo "Response was: $JSON_OUTPUT"
        rm -f "$TEMP_OUTPUT"
        exit 1
    fi
else
    echo "❌ Failed to push theme to Shopify"
    echo "Error output:"
    cat "$TEMP_OUTPUT"
    rm -f "$TEMP_OUTPUT"
    exit 1
fi
