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
# USAGE: ./dev-theme.sh <user_id> <sandbox_id> <store_url> <api_key> [store_password] [port|auto]
#
# EXAMPLES:
# ./dev-theme.sh user123 sandbox456 store.myshopify.com shptka_abc123 password auto
# ./dev-theme.sh user123 sandbox456 store.myshopify.com shptka_abc123 "" 4001
#
# ========================================================================

set -e  # Exit on any error

# ========================================================================
# STEP 1: PARAMETER VALIDATION AND SETUP
# ========================================================================

# Check if minimum parameters are provided
if [ $# -lt 4 ]; then
    echo "❌ Error: Missing parameters"
    echo "Usage: $0 <user_id> <sandbox_id> <store_url> <api_key> [store_password] [port|auto]"
    echo ""
    echo "📋 Parameter Description:"
    echo "  user_id:        Unique identifier for the user"
    echo "  sandbox_id:     Unique identifier for the theme sandbox"
    echo "  store_url:      Shopify store URL (e.g., store.myshopify.com)"
    echo "  api_key:        Shopify theme access token (shptka_...)"
    echo "  store_password: Optional password for password-protected stores"
    echo "  port:           Target port number or 'auto' for automatic assignment"
    exit 1
fi

# Extract and assign parameters
USER_ID=$1
SANDBOX_ID=$2
STORE_URL=$3
API_KEY=$4
STORE_PASSWORD=${5:-""}         # Optional store password
REQUESTED_PORT=${6:-"auto"}     # Default is auto-assign

echo "🔧 Configuration:"
echo "   User ID:      $USER_ID"
echo "   Sandbox ID:   $SANDBOX_ID"
echo "   Store URL:    $STORE_URL"
echo "   Port Mode:    $REQUESTED_PORT"
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
# STEP 3: DYNAMIC PORT ALLOCATION
# ========================================================================

# Function to find available port in a given range
# This ensures multiple users can run development servers simultaneously
find_available_port() {
    local start_port=${1:-3000}
    local end_port=${2:-3100}

    echo "🔍 Scanning ports $start_port-$end_port for availability..." >&2

    for port in $(seq $start_port $end_port); do
        if ! lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            echo $port
            return 0
        fi
    done

    echo "Error: No available ports in range $start_port-$end_port" >&2
    return 1
}

echo "🚀 Allocating ports for dual-server setup..."
echo "   Architecture: Client → Proxy Server → Shopify Server"
echo ""

# Assign ports for both Shopify and proxy servers
# Strategy: Shopify uses 3000-3100 range, Proxy uses corresponding 4000-4100 range
if [ "$REQUESTED_PORT" = "auto" ]; then
    echo "🔍 Finding available ports..."
    SHOPIFY_PORT=$(find_available_port 3000 3100)
    if [ $? -ne 0 ]; then
        echo "❌ Error: $SHOPIFY_PORT"
        exit 1
    fi
    # Find next available port for proxy (always +1000 from Shopify port)
    PROXY_PORT=$((SHOPIFY_PORT + 1000))
    if lsof -Pi :$PROXY_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        PROXY_PORT=$(find_available_port $((PROXY_PORT + 1)) $((SHOPIFY_PORT + 1100)))
        if [ $? -ne 0 ]; then
            echo "❌ Error: $PROXY_PORT"
            exit 1
        fi
    fi
    echo "✅ Auto-assigned Shopify port: $SHOPIFY_PORT"
    echo "✅ Auto-assigned Proxy port: $PROXY_PORT"
    PORT=$PROXY_PORT  # The main port users will connect to
else
    PROXY_PORT=$REQUESTED_PORT
    SHOPIFY_PORT=$((PROXY_PORT - 1000))

    # Ensure Shopify port is in valid range
    if [ $SHOPIFY_PORT -lt 3000 ]; then
        SHOPIFY_PORT=$(find_available_port 3000 3100)
        if [ $? -ne 0 ]; then
            echo "❌ Error: $SHOPIFY_PORT"
            exit 1
        fi
    fi

    # Check if requested proxy port is available
    if lsof -Pi :$PROXY_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "⚠️  Warning: Port $PROXY_PORT is already in use!"
        echo "🔍 Finding alternative ports..."
        PROXY_PORT=$(find_available_port $((PROXY_PORT + 1)) $((PROXY_PORT + 100)))
        if [ $? -ne 0 ]; then
            echo "❌ Error: $PROXY_PORT"
            exit 1
        fi
        SHOPIFY_PORT=$(find_available_port 3000 3100)
        if [ $? -ne 0 ]; then
            echo "❌ Error: $SHOPIFY_PORT"
            exit 1
        fi
    fi

    # Check if Shopify port is available
    if lsof -Pi :$SHOPIFY_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        SHOPIFY_PORT=$(find_available_port 3000 3100)
        if [ $? -ne 0 ]; then
            echo "❌ Error: $SHOPIFY_PORT"
            exit 1
        fi
    fi

    echo "✅ Using Shopify port: $SHOPIFY_PORT"
    echo "✅ Using Proxy port: $PROXY_PORT"
    PORT=$PROXY_PORT  # The main port users will connect to
fi

# ========================================================================
# STEP 4: DEPENDENCY VALIDATION
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
# STEP 5: PROXY SERVER SETUP
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
# STEP 6: SHOPIFY DEVELOPMENT SERVER CONFIGURATION
# ========================================================================

echo "⚙️  Configuring Shopify development server..."

# Build the shopify theme dev command
SHOPIFY_CMD="shopify theme dev --store=\"$STORE_URL\" --password=\"$API_KEY\" --path=\"$THEME_DIR\" --host=127.0.0.1 --port=$SHOPIFY_PORT --error-overlay=silent"

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
# STEP 7: DISPLAY SERVER INFORMATION
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
# STEP 8: PROCESS MANAGEMENT AND CLEANUP
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
# STEP 9: START SHOPIFY DEVELOPMENT SERVER
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
# STEP 10: START X-FRAME-OPTIONS REMOVAL PROXY SERVER
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
# STEP 11: FINAL SETUP COMPLETE
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