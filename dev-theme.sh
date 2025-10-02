#!/bin/bash

# ========================================================================
# SHOPIFY THEME DEVELOPMENT SERVER WITH X-FRAME-OPTIONS REMOVAL
# ========================================================================
#
# This script sets up a complete development environment for Shopify themes
# with iframe embedding capabilities by removing X-Frame-Options headers.
#
# ARCHITECTURE:
# Client → Proxy Server (port 4000+) → Shopify Dev Server (port 3000+)
#
# WHAT IT DOES:
# 1. Validates input parameters and environment
# 2. Allocates available ports for both servers
# 3. Starts Shopify theme development server
# 4. Starts proxy server to remove X-Frame-Options headers
# 5. Monitors both servers and handles cleanup
#
# USAGE: ./dev-theme.sh <user_id> <sandbox_id> <store_url> <api_key> <theme_id> <dev_port> <proxy_port> [store_password]
#
# EXAMPLES:
# ./dev-theme.sh user123 sandbox456 store.myshopify.com shptka_abc123 108267175958 5100 6100 password
# ./dev-theme.sh user123 sandbox456 store.myshopify.com shptka_abc123 108267175958 5101 6101 ""
#
# ========================================================================

set -e  # Exit on any error

# ========================================================================
# STEP 1: PARAMETER VALIDATION AND SETUP
# ========================================================================

# Check if minimum parameters are provided
if [ $# -lt 7 ]; then
    echo "❌ Error: Missing parameters"
    echo "Usage: $0 <user_id> <sandbox_id> <store_url> <api_key> <theme_id> <dev_port> <proxy_port> [store_password]"
    echo ""
    echo "📋 Parameter Description:"
    echo "  user_id:        Unique identifier for the user"
    echo "  sandbox_id:     Unique identifier for the theme sandbox"
    echo "  store_url:      Shopify store URL (e.g., store.myshopify.com)"
    echo "  api_key:        Shopify theme access token (shptka_...)"
    echo "  theme_id:       Shopify theme ID (numeric) - REQUIRED for unpublished development theme"
    echo "  dev_port:       Shopify dev server port (range: 5100-5400)"
    echo "  proxy_port:     Proxy server port (range: 6100-6400)"
    echo "  store_password: Optional password for password-protected stores"
    exit 1
fi

# Extract and assign parameters
USER_ID=$1
SANDBOX_ID=$2
STORE_URL=$3
API_KEY=$4
THEME_ID=$5                     # REQUIRED theme ID
SHOPIFY_PORT=$6                 # Dev server port (allocated by database)
PROXY_PORT=$7                   # Proxy server port (allocated by database)
STORE_PASSWORD=${8:-""}         # Optional store password

echo "🔧 Configuration:"
echo "   User ID:      $USER_ID"
echo "   Sandbox ID:   $SANDBOX_ID"
echo "   Store URL:    $STORE_URL"
echo "   Theme ID:     $THEME_ID"
echo "   Dev Port:     $SHOPIFY_PORT"
echo "   Proxy Port:   $PROXY_PORT"
echo ""

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

if [ -z "$THEME_ID" ]; then
    echo "❌ Error: Theme ID cannot be empty"
    echo "Theme ID is required to start the development server with the unpublished theme"
    exit 1
fi

# Validate theme ID is numeric
if ! [[ "$THEME_ID" =~ ^[0-9]+$ ]]; then
    echo "❌ Error: Theme ID must be a numeric value"
    echo "Received: $THEME_ID"
    exit 1
fi

# ========================================================================
# STEP 2: ENVIRONMENT VALIDATION
# ========================================================================

# Get the absolute path to the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define the theme directory path (absolute)
THEME_DIR="${SCRIPT_DIR}/themes/user_${USER_ID}/theme_${SANDBOX_ID}"

echo "📁 Validating theme directory..."
echo "   Theme Path: $THEME_DIR"

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

# ========================================================================
# STEP 3: PORT VALIDATION
# ========================================================================

# Ports are pre-allocated by the database-driven port allocation service
# No dynamic scanning needed - just validate they are numeric

echo "🔌 Using pre-allocated ports from database..."
echo "   Architecture: Client → Proxy Server (port $PROXY_PORT) → Shopify Server (port $SHOPIFY_PORT)"
echo ""

# Validate ports are numeric
if ! [[ "$SHOPIFY_PORT" =~ ^[0-9]+$ ]]; then
    echo "❌ Error: Dev port must be numeric"
    echo "Received: $SHOPIFY_PORT"
    exit 1
fi

if ! [[ "$PROXY_PORT" =~ ^[0-9]+$ ]]; then
    echo "❌ Error: Proxy port must be numeric"
    echo "Received: $PROXY_PORT"
    exit 1
fi

# Check if ports are in expected range
if [ $SHOPIFY_PORT -lt 5100 ] || [ $SHOPIFY_PORT -gt 5400 ]; then
    echo "⚠️  Warning: Dev port $SHOPIFY_PORT is outside expected range (5100-5400)"
fi

if [ $PROXY_PORT -lt 6100 ] || [ $PROXY_PORT -gt 6400 ]; then
    echo "⚠️  Warning: Proxy port $PROXY_PORT is outside expected range (6100-6400)"
fi

echo "✅ Port validation passed"
echo "   Shopify Dev Port: $SHOPIFY_PORT"
echo "   Proxy Port:       $PROXY_PORT"
echo ""

PORT=$PROXY_PORT  # The main port users will connect to

# ========================================================================
# STEP 4: KILL ANY EXISTING PROCESSES ON ALLOCATED PORTS
# ========================================================================
# Critical: Even if database says these ports are free, zombie processes
# from crashed/deleted sandboxes might still be using them.
# Always kill before starting to ensure clean slate.

echo "🧹 Cleaning up any existing processes on allocated ports..."

KILLED_COUNT=0

# Kill any process on dev port
DEV_PORT_PIDS=$(lsof -ti :$SHOPIFY_PORT 2>/dev/null || true)
if [ -n "$DEV_PORT_PIDS" ]; then
    echo "   ⚠️  Found zombie process on dev port $SHOPIFY_PORT (PIDs: $DEV_PORT_PIDS)"
    for PID in $DEV_PORT_PIDS; do
        kill $PID 2>/dev/null && echo "   ✅ Killed process on dev port (PID: $PID)" && KILLED_COUNT=$((KILLED_COUNT + 1))
    done
else
    echo "   ✓ Dev port $SHOPIFY_PORT is free"
fi

# Kill any process on proxy port
PROXY_PORT_PIDS=$(lsof -ti :$PROXY_PORT 2>/dev/null || true)
if [ -n "$PROXY_PORT_PIDS" ]; then
    echo "   ⚠️  Found zombie process on proxy port $PROXY_PORT (PIDs: $PROXY_PORT_PIDS)"
    for PID in $PROXY_PORT_PIDS; do
        kill $PID 2>/dev/null && echo "   ✅ Killed process on proxy port (PID: $PID)" && KILLED_COUNT=$((KILLED_COUNT + 1))
    done
else
    echo "   ✓ Proxy port $PROXY_PORT is free"
fi

if [ $KILLED_COUNT -gt 0 ]; then
    echo "   ✅ Cleaned up $KILLED_COUNT zombie process(es)"
    # Give processes time to fully terminate
    sleep 1
fi

echo ""

# ========================================================================
# STEP 5: DEPENDENCY VALIDATION
# ========================================================================

echo "🔧 Validating required dependencies..."

# Check if Shopify CLI is installed
if ! command -v shopify &> /dev/null; then
    echo "❌ Error: Shopify CLI not found. Please install it first:"
    echo "   npm install -g @shopify/cli @shopify/theme"
    exit 1
fi
echo "   ✅ Shopify CLI found"

# ========================================================================
# STEP 6: PROXY SERVER SETUP
# ========================================================================

echo "🚀 Configuring proxy server for X-Frame-Options removal..."
echo "   Store: $STORE_URL"
echo "   Shopify Port: $SHOPIFY_PORT"
echo "   Proxy Port: $PROXY_PORT (main access point)"
echo "   Theme Directory: $THEME_DIR"
echo ""

# Check if Node.js is available for proxy server
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js not found. Proxy server requires Node.js"
    echo "   Please install Node.js to continue"
    exit 1
fi

echo "   ✅ Node.js found"

# Check if http-proxy module is available
if ! node -e "import('http-proxy')" 2>/dev/null; then
    echo "⚠️  Warning: http-proxy module not found"
    echo "   Installing http-proxy..."
    npm install http-proxy 2>/dev/null || {
        echo "❌ Error: Failed to install http-proxy module"
        echo "   Please run: npm install http-proxy"
        exit 1
    }
fi
echo "   ✅ http-proxy module available"

# Create proxy server script for this session
# Each user/sandbox gets their own proxy script to avoid conflicts
PROXY_SCRIPT_PATH="${THEME_DIR}/proxy-server-${USER_ID}-${SANDBOX_ID}.js"
echo "   📝 Creating proxy script: $PROXY_SCRIPT_PATH"
cp "${SCRIPT_DIR}/proxy-server-template.js" "$PROXY_SCRIPT_PATH"

# ========================================================================
# STEP 7: SHOPIFY DEVELOPMENT SERVER CONFIGURATION
# ========================================================================

echo "⚙️  Configuring Shopify development server..."

# Build the shopify theme dev command with hot reload enabled
# ALWAYS use the theme ID to work with the specific unpublished development theme
SHOPIFY_CMD="shopify theme dev --store=\"$STORE_URL\" --password=\"$API_KEY\" --path=\"$THEME_DIR\" --theme=$THEME_ID --host=127.0.0.1 --port=$SHOPIFY_PORT --live-reload=hot-reload --error-overlay=silent"

echo "   ✅ Theme ID configured: $THEME_ID"

# Add store password if provided
if [ -n "$STORE_PASSWORD" ]; then
    SHOPIFY_CMD="$SHOPIFY_CMD --store-password=\"$STORE_PASSWORD\""
    echo "   ✅ Store password configured"
else
    echo "   ℹ️  No store password provided"
fi

echo "   ✅ Shopify server configuration complete"
echo ""

# ========================================================================
# STEP 8: DISPLAY SERVER INFORMATION
# ========================================================================

echo "🌟 Development servers will be available at:"
echo "   Main URL:    http://127.0.0.1:$PROXY_PORT (X-Frame-Options removed)"
echo "   Direct URL:  http://127.0.0.1:$SHOPIFY_PORT (Shopify direct)"
echo "   Theme:       $THEME_DIR"
echo ""
echo "📝 Server Features:"
echo "   • Upload your theme as a development theme"
echo "   • Provide hot-reload for CSS and sections"
echo "   • Show live changes as you edit files"
echo "   • Remove X-Frame-Options headers for iframe embedding"
echo "   • Support multiple concurrent users"
echo "   • NOT open browser automatically (visit URL manually)"
echo ""
echo "⏹️  Press Ctrl+C to stop both development servers"
echo ""

# Output port information for the calling service (used by themeService.ts)
echo "ASSIGNED_PORT=$PROXY_PORT"
echo "SHOPIFY_PORT=$SHOPIFY_PORT"
echo "PROXY_PORT=$PROXY_PORT"

# ========================================================================
# STEP 9: PROCESS MANAGEMENT AND CLEANUP
# ========================================================================

# Function to cleanup on exit - ensures both servers are properly terminated
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."

    # Kill proxy server
    if [ ! -z "$PROXY_PID" ]; then
        kill $PROXY_PID 2>/dev/null
        echo "   ✅ Proxy server stopped"
    fi

    # Kill Shopify server
    if [ ! -z "$SHOPIFY_PID" ]; then
        kill $SHOPIFY_PID 2>/dev/null
        echo "   ✅ Shopify server stopped"
    fi

    # Cleanup proxy script
    if [ -f "$PROXY_SCRIPT_PATH" ]; then
        rm "$PROXY_SCRIPT_PATH"
        echo "   ✅ Cleanup completed"
    fi

    exit 0
}

# Set up signal handlers for graceful shutdown
trap cleanup SIGINT SIGTERM

# ========================================================================
# STEP 10: START SHOPIFY DEVELOPMENT SERVER
# ========================================================================

echo "🚀 Starting Shopify theme development server..."
echo "   Command: $SHOPIFY_CMD"
echo ""

# Start Shopify server in background with proper detachment
nohup bash -c "eval \"$SHOPIFY_CMD\"" > /tmp/shopify-${USER_ID}-${SANDBOX_ID}.log 2>&1 &
SHOPIFY_PID=$!

# Wait for Shopify server to start
echo "⏳ Waiting for Shopify server to start..."
sleep 10

# Check if Shopify server is running
if ! kill -0 $SHOPIFY_PID 2>/dev/null; then
    echo "❌ Failed to start Shopify development server"
    echo "Please check:"
    echo "   • Your store URL and API key are correct"
    echo "   • The theme directory contains valid theme files"
    echo "   • Port $SHOPIFY_PORT is not already in use"
    echo "   • You have proper permissions for the store"
    exit 1
fi

echo "✅ Shopify server started successfully on port $SHOPIFY_PORT"
echo ""

# ========================================================================
# STEP 11: START X-FRAME-OPTIONS REMOVAL PROXY SERVER
# ========================================================================

echo "🚀 Starting X-Frame-Options removal proxy server..."
echo "   Script: $PROXY_SCRIPT_PATH"
echo "   Target: Shopify server on port $SHOPIFY_PORT"
echo "   Proxy:  Listening on port $PROXY_PORT"
echo ""

# Start proxy server in background with proper detachment
nohup node "$PROXY_SCRIPT_PATH" $SHOPIFY_PORT $PROXY_PORT > /tmp/proxy-${USER_ID}-${SANDBOX_ID}.log 2>&1 &
PROXY_PID=$!

# Wait for proxy server to start
echo "⏳ Waiting for proxy server to start..."
sleep 5

# Check if proxy server is running
if ! kill -0 $PROXY_PID 2>/dev/null; then
    echo "❌ Failed to start proxy server"
    echo "Cleaning up Shopify server..."
    kill $SHOPIFY_PID 2>/dev/null
    exit 1
fi

echo "✅ Proxy server started successfully on port $PROXY_PORT"
echo ""

# ========================================================================
# STEP 12: FINAL SETUP COMPLETE
# ========================================================================

echo "🎉 Both servers are running successfully!"
echo ""
echo "📱 ACCESS INFORMATION:"
echo "   Main URL (iframe-friendly): http://127.0.0.1:$PROXY_PORT"
echo "   Direct URL (Shopify):       http://127.0.0.1:$SHOPIFY_PORT"
echo "   Theme Directory:            $THEME_DIR"
echo ""
echo "🔧 FEATURES ENABLED:"
echo "   ✅ X-Frame-Options headers automatically removed"
echo "   ✅ Content-Security-Policy frame restrictions removed"
echo "   ✅ Hot-reload for CSS and sections"
echo "   ✅ Live theme synchronization"
echo "   ✅ Multi-user support with dynamic port allocation"
echo ""
echo "📋 STATUS:"
echo "   Shopify Server PID: $SHOPIFY_PID (port $SHOPIFY_PORT)"
echo "   Proxy Server PID:   $PROXY_PID (port $PROXY_PORT)"
echo ""
echo "⏹️  Press Ctrl+C to stop both development servers"
echo ""

# Keep the script running and wait for both processes
# This ensures the script doesn't exit while servers are running
wait