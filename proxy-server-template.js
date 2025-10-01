/**
 * ========================================================================
 * MINIMAL X-FRAME-OPTIONS REMOVAL PROXY
 * ========================================================================
 *
 * This proxy server removes X-Frame-Options headers to enable iframe
 * embedding while transparently proxying all other traffic.
 *
 * HOW IT WORKS:
 * 1. Client → Proxy → Shopify Dev Server
 * 2. Shopify Dev Server → Proxy (remove headers) → Client
 * 3. WebSocket connections are proxied transparently for hot reload
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
 * ========================================================================
 */

import http from 'http';
import httpProxy from 'http-proxy';

// ========================================================================
// CONFIGURATION
// ========================================================================
const SHOPIFY_PORT = process.argv[2] || 3000;
const PROXY_PORT = process.argv[3] || 8000;

console.log('🔧 Proxy Configuration:');
console.log(`   Shopify Server: http://127.0.0.1:${SHOPIFY_PORT}`);
console.log(`   Proxy Server:   http://127.0.0.1:${PROXY_PORT}`);
console.log('');

// ========================================================================
// CREATE PROXY
// ========================================================================
const proxy = httpProxy.createProxyServer({
  target: `http://127.0.0.1:${SHOPIFY_PORT}`,
  changeOrigin: true,
  secure: false,
  ws: true,  // Enable WebSocket proxying
  timeout: 30000,
  proxyTimeout: 30000
});

// ========================================================================
// REMOVE IFRAME-BLOCKING HEADERS
// ========================================================================
proxy.on('proxyRes', (proxyRes, req) => {
  const originalXFrame = proxyRes.headers['x-frame-options'];
  const originalCSP = proxyRes.headers['content-security-policy'];

  // Remove X-Frame-Options (all variations)
  delete proxyRes.headers['x-frame-options'];
  delete proxyRes.headers['X-Frame-Options'];
  delete proxyRes.headers['X-FRAME-OPTIONS'];

  // Remove CSP headers that restrict framing
  delete proxyRes.headers['content-security-policy'];
  delete proxyRes.headers['Content-Security-Policy'];
  delete proxyRes.headers['CONTENT-SECURITY-POLICY'];

  // Log when headers are removed
  if (originalXFrame || (originalCSP && originalCSP.includes('frame-ancestors'))) {
    console.log(`📥 ${req.method} ${req.url} - iframe headers removed`);
  }
});

// ========================================================================
// ERROR HANDLING
// ========================================================================
proxy.on('error', (err, req, res) => {
  console.error(`❌ Proxy error: ${err.message}`);
  if (res && res.writeHead) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway');
  }
});

// ========================================================================
// CREATE HTTP SERVER
// ========================================================================
const server = http.createServer((req, res) => {
  // Add ngrok bypass header
  req.headers['ngrok-skip-browser-warning'] = '69420';

  proxy.web(req, res);
});

// ========================================================================
// WEBSOCKET SUPPORT (for hot reload)
// ========================================================================
server.on('upgrade', (req, socket, head) => {
  console.log(`🔌 WebSocket upgrade: ${req.url}`);
  req.headers['ngrok-skip-browser-warning'] = '69420';

  proxy.ws(req, socket, head);
});

// ========================================================================
// START SERVER
// ========================================================================
server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log('🎉 Minimal Proxy Server Started!');
  console.log('');
  console.log('✨ Features:');
  console.log('   ✅ X-Frame-Options removal (iframe embedding)');
  console.log('   ✅ WebSocket proxying (hot reload support)');
  console.log('   ✅ Transparent pass-through (no body modification)');
  console.log('');
  console.log(`🔗 Access via: http://127.0.0.1:${PROXY_PORT}`);
  console.log('');
});

// ========================================================================
// GRACEFUL SHUTDOWN
// ========================================================================
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  server.close(() => process.exit(0));
});