/**
 * ========================================================================
 * X-FRAME-OPTIONS REMOVAL PROXY SERVER
 * ========================================================================
 *
 * This proxy server acts as a middleware between clients and the Shopify
 * development server to remove X-Frame-Options headers that prevent iframe
 * embedding.
 *
 * HOW IT WORKS:
 * 1. Client requests → Proxy Server (this) → Shopify Dev Server
 * 2. Shopify Dev Server responds → Proxy Server → Client (headers stripped)
 *
 * HEADERS REMOVED:
 * - X-Frame-Options: DENY/SAMEORIGIN (blocks iframe embedding)
 * - Content-Security-Policy: frame-ancestors (CSP frame restrictions)
 *
 * USAGE:
 * node proxy-server-template.js <shopify_port> <proxy_port>
 *
 * EXAMPLE:
 * node proxy-server-template.js 3001 4001
 * → Proxies Shopify server at :3001 through proxy at :4001
 * ========================================================================
 */

import http from 'http';
import httpProxy from 'http-proxy';

// ========================================================================
// STEP 1: CONFIGURATION
// ========================================================================
// Get ports from command line arguments with sensible defaults
const SHOPIFY_PORT = process.argv[2] || 3000;  // Shopify dev server port
const PROXY_PORT = process.argv[3] || 8000;    // This proxy server port

console.log('🔧 Proxy Configuration:');
console.log(`   Shopify Dev Server: http://127.0.0.1:${SHOPIFY_PORT}`);
console.log(`   Proxy Server:       http://127.0.0.1:${PROXY_PORT}`);
console.log(`   Purpose: Remove X-Frame-Options for iframe embedding`);
console.log('');

// ========================================================================
// STEP 2: CREATE HTTP PROXY INSTANCE
// ========================================================================
// Create a proxy server instance that will forward requests to Shopify
const proxy = httpProxy.createProxyServer({
  // Configuration options for the proxy
  changeOrigin: true,     // Changes the origin of the host header to the target URL
  secure: false,          // Allow self-signed certificates
  timeout: 30000,         // 30 second timeout for requests
  proxyTimeout: 30000     // 30 second timeout for proxy responses
});

// ========================================================================
// STEP 3: HEADER MANIPULATION MIDDLEWARE
// ========================================================================
// This is the core functionality - intercept responses and strip headers
proxy.on('proxyRes', (proxyRes, req) => {
  // Log the incoming request for debugging
  console.log(`📥 Proxying: ${req.method} ${req.url}`);

  // Check what X-Frame-Options header exists before removal
  const originalXFrame = proxyRes.headers['x-frame-options'];
  const originalCSP = proxyRes.headers['content-security-policy'];

  if (originalXFrame) {
    console.log(`   🚫 Found X-Frame-Options: ${originalXFrame}`);
  }
  if (originalCSP && originalCSP.includes('frame-ancestors')) {
    console.log(`   🚫 Found CSP with frame-ancestors`);
  }

  // ===== REMOVE IFRAME-BLOCKING HEADERS =====
  // These headers prevent the content from being embedded in iframes

  // Remove X-Frame-Options (all variations)
  delete proxyRes.headers['x-frame-options'];      // lowercase
  delete proxyRes.headers['X-Frame-Options'];      // proper case
  delete proxyRes.headers['X-FRAME-OPTIONS'];      // uppercase

  // Remove Content Security Policy headers that restrict framing
  delete proxyRes.headers['content-security-policy'];     // lowercase
  delete proxyRes.headers['Content-Security-Policy'];     // proper case
  delete proxyRes.headers['CONTENT-SECURITY-POLICY'];     // uppercase

  // Log successful removal
  if (originalXFrame || (originalCSP && originalCSP.includes('frame-ancestors'))) {
    console.log(`   ✅ Headers removed - iframe embedding now allowed`);
  }
});

// ========================================================================
// STEP 4: CREATE HTTP SERVER
// ========================================================================
// Create the main server that handles incoming requests
const server = http.createServer((req, res) => {
  // Add error handling for proxy errors
  proxy.on('error', (err, req, res) => {
    console.error(`❌ Proxy error for ${req.url}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway: Unable to connect to Shopify dev server');
    }
  });

  // Forward the request to the Shopify development server
  proxy.web(req, res, {
    target: `http://127.0.0.1:${SHOPIFY_PORT}`,
    changeOrigin: true
  });
});

// ========================================================================
// STEP 5: START THE PROXY SERVER
// ========================================================================
server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🎉 X-Frame-Options Removal Proxy Server Started!');
  console.log('');
  console.log('📋 Server Information:');
  console.log(`   Proxy URL:    http://127.0.0.1:${PROXY_PORT}`);
  console.log(`   Target URL:   http://127.0.0.1:${SHOPIFY_PORT}`);
  console.log(`   Purpose:      Enable iframe embedding by removing X-Frame-Options`);
  console.log('');
  console.log('🔗 Usage:');
  console.log(`   - Use http://127.0.0.1:${PROXY_PORT} for iframe-friendly access`);
  console.log(`   - Use http://127.0.0.1:${SHOPIFY_PORT} for direct Shopify access`);
  console.log('');
  console.log('⏹️  Press Ctrl+C to stop the proxy server');
  console.log('');
});

// ========================================================================
// STEP 6: GRACEFUL SHUTDOWN HANDLERS
// ========================================================================
// Handle process termination signals gracefully

process.on('SIGTERM', () => {
  console.log('');
  console.log('🛑 Received SIGTERM - Shutting down proxy server gracefully...');
  server.close(() => {
    console.log('✅ Proxy server stopped successfully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('');
  console.log('🛑 Received SIGINT (Ctrl+C) - Shutting down proxy server gracefully...');
  server.close(() => {
    console.log('✅ Proxy server stopped successfully');
    process.exit(0);
  });
});

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  console.log('🛑 Shutting down due to uncaught exception...');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  console.log('🛑 Shutting down due to unhandled rejection...');
  process.exit(1);
});