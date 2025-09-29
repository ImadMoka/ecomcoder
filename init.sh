#!/bin/bash

# VM Initialization Script
# This script sets up all dependencies needed for the theme creation system
# Usage: ./init.sh

set -e  # Exit on any error

echo "🚀 Initializing VM environment for theme creation system..."

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Update system packages (Ubuntu/Debian)
if command_exists apt-get; then
    log "📦 Updating system packages..."
    sudo apt-get update -y
    sudo apt-get upgrade -y
fi

# Install Node.js if not present
if ! command_exists node; then
    log "📦 Installing Node.js..."
    # Install Node.js LTS via NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    log "✅ Node.js already installed: $(node --version)"
fi

# Install npm if not present
if ! command_exists npm; then
    log "📦 Installing npm..."
    sudo apt-get install -y npm
else
    log "✅ npm already installed: $(npm --version)"
fi

# Verify Node.js version (should be >= 18)
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    log "⚠️  Warning: Node.js version $NODE_VERSION detected. Recommended: >= 18"
fi

# Install global npm packages
log "📦 Installing global npm packages..."
sudo npm install -g @shopify/cli @shopify/theme

# Verify Shopify CLI installation
if command_exists shopify; then
    log "✅ Shopify CLI installed: $(shopify version)"
else
    log "❌ Failed to install Shopify CLI"
    exit 1
fi

# Install project dependencies if package.json exists
if [ -f "package.json" ]; then
    log "📦 Installing project dependencies..."
    npm install
else
    log "⚠️  No package.json found. Skipping project dependencies."
fi

# Create necessary directories
log "📁 Creating necessary directories..."
mkdir -p themes
mkdir -p logs

# Set proper permissions for scripts
log "🔧 Setting script permissions..."
chmod +x build.sh
chmod +x pull-theme.sh

# Install additional system dependencies that might be needed
log "📦 Installing additional system dependencies..."
sudo apt-get install -y \
    curl \
    wget \
    git \
    unzip \
    build-essential

# Install Docker if not present (for potential containerization)
if ! command_exists docker; then
    log "📦 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
else
    log "✅ Docker already installed: $(docker --version)"
fi

# Set up environment file template if it doesn't exist
if [ ! -f ".env.local" ]; then
    log "📝 Creating environment file template..."
    cat > .env.local << EOF
# Supabase Configuration
# Replace these with your actual Supabase project details
# Get these from: https://app.supabase.com/project/your-project/settings/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key
EOF
fi

# Test Shopify CLI functionality
log "🧪 Testing Shopify CLI..."
if shopify version >/dev/null 2>&1; then
    log "✅ Shopify CLI test passed"
else
    log "❌ Shopify CLI test failed"
    exit 1
fi

# System information
log "📊 System Information:"
log "   OS: $(lsb_release -d | cut -f2)"
log "   Node.js: $(node --version)"
log "   npm: $(npm --version)"
log "   Shopify CLI: $(shopify version)"
log "   Docker: $(docker --version 2>/dev/null || echo 'Not installed')"

# Final checks
log "🔍 Running final checks..."

# Check if all required commands are available
REQUIRED_COMMANDS=("node" "npm" "shopify" "git" "curl")
for cmd in "${REQUIRED_COMMANDS[@]}"; do
    if command_exists "$cmd"; then
        log "✅ $cmd: Available"
    else
        log "❌ $cmd: Missing"
        exit 1
    fi
done

# Check disk space
AVAILABLE_SPACE=$(df . | tail -1 | awk '{print $4}')
if [ "$AVAILABLE_SPACE" -lt 1048576 ]; then  # Less than 1GB
    log "⚠️  Warning: Low disk space available"
fi

log "✅ VM initialization complete!"
log "🎉 System is ready for theme creation operations"
log ""
log "Next steps:"
log "1. Update .env.local with your Supabase credentials"
log "2. Start the application: npm run dev"
log "3. Test theme creation via the API"