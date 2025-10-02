/**
 * ========================================================================
 * NGROK TUNNEL SERVICE
 * ========================================================================
 *
 * Manages public tunnel URLs for local Shopify development servers.
 * Enables iframe embedding and remote access to localhost proxies.
 *
 * ARCHITECTURE:
 * Local Proxy (127.0.0.1:4000+) → ngrok Tunnel → Public URL
 *
 * FEATURES:
 * - Multi-user tunnel management (one tunnel per user/sandbox)
 * - Automatic cleanup on process exit
 * - Optional ngrok authtoken support
 * - Graceful error handling with fallback to local URLs
 * - Thread-safe tunnel storage
 *
 * ========================================================================
 */

import ngrok from '@ngrok/ngrok'

// ========================================================================
// TYPE DEFINITIONS
// ========================================================================

interface TunnelResult {
  success: boolean
  publicUrl?: string
  error?: string
  tunnelId?: string
}

interface TunnelData {
  listener: any  // ngrok.Listener type
  url: string
  port: number
  userId: string
  sandboxId: string
  createdAt: Date
}

// ========================================================================
// TUNNEL STORAGE
// ========================================================================

// Active tunnel registry: key = "userId_sandboxId", value = tunnel data
const activeTunnels = new Map<string, TunnelData>()

/**
 * Generate unique key for tunnel identification
 */
function getTunnelKey(userId: string, sandboxId: string): string {
  return `${userId}_${sandboxId}`
}

// ========================================================================
// TUNNEL CREATION
// ========================================================================

/**
 * Create a public ngrok tunnel to a local port
 *
 * @param port - Local port to tunnel (e.g., 4001 for proxy server)
 * @param userId - User ID for tracking
 * @param sandboxId - Sandbox ID for tracking
 * @returns Promise with tunnel URL and connection details
 *
 * @example
 * ```typescript
 * const result = await createTunnel(4001, 'user123', 'sandbox456')
 * if (result.success) {
 *   console.log(`Public URL: ${result.publicUrl}`)
 *   // => "https://abc123.ngrok-free.app"
 * }
 * ```
 */
export async function createTunnel(
  port: number,
  userId: string,
  sandboxId: string
): Promise<TunnelResult> {
  try {
    const tunnelKey = getTunnelKey(userId, sandboxId)

    // ===== CHECK FOR EXISTING TUNNEL =====
    if (activeTunnels.has(tunnelKey)) {
      const existingTunnel = activeTunnels.get(tunnelKey)!
      console.log(`🔗 Reusing existing tunnel: ${existingTunnel.url}`)
      return {
        success: true,
        publicUrl: existingTunnel.url,
        tunnelId: tunnelKey
      }
    }

    console.log(`🔗 Creating ngrok tunnel for port ${port}...`)
    console.log(`   User: ${userId} | Sandbox: ${sandboxId}`)

    // ===== CONFIGURE NGROK =====
    const config: any = {
      addr: port,  // Local port to forward
      // authtoken is automatically loaded from:
      // 1. NGROK_AUTHTOKEN environment variable
      // 2. ~/.ngrok2/ngrok.yml config file
      // 3. Works without authtoken on free tier (with limitations)
    }

    // Check if NGROK_AUTHTOKEN is set in environment
    if (process.env.NGROK_AUTHTOKEN) {
      config.authtoken = process.env.NGROK_AUTHTOKEN
      console.log(`   Using authtoken from environment`)
    } else {
      console.log(`   Using free tier (no authtoken)`)
    }

    // ===== START TUNNEL WITH TIMEOUT =====
    console.log(`   Connecting to ngrok... (timeout: 15s)`)

    const listener = await Promise.race([
      ngrok.forward(config),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('ngrok connection timeout after 15s - falling back to local URL')), 15000)
      )
    ])

    console.log(`   ngrok connected, retrieving URL...`)
    const publicUrl = listener.url()

    // Ensure we got a valid URL
    if (!publicUrl) {
      throw new Error('Failed to retrieve tunnel URL from ngrok')
    }

    // ===== STORE TUNNEL REFERENCE =====
    activeTunnels.set(tunnelKey, {
      listener,
      url: publicUrl,
      port,
      userId,
      sandboxId,
      createdAt: new Date()
    })

    console.log(`✅ Tunnel created successfully:`)
    console.log(`   Local:  http://127.0.0.1:${port}`)
    console.log(`   Public: ${publicUrl}`)
    console.log(`   Active tunnels: ${activeTunnels.size}`)

    return {
      success: true,
      publicUrl,
      tunnelId: tunnelKey
    }
  } catch (error: unknown) {
    console.error('❌ Failed to create ngrok tunnel:', error)

    // Detailed error message for debugging
    let errorMessage = 'Unknown tunnel error'
    if (error instanceof Error) {
      errorMessage = error.message

      // Provide helpful hints for common errors
      if (errorMessage.includes('authtoken')) {
        console.error('💡 Hint: Get an authtoken at https://dashboard.ngrok.com/get-started/your-authtoken')
        console.error('💡 Add it to .env: NGROK_AUTHTOKEN=your_token_here')
      } else if (errorMessage.includes('port')) {
        console.error('💡 Hint: Ensure the local port is accessible and not blocked by firewall')
      } else if (errorMessage.includes('network')) {
        console.error('💡 Hint: Check your internet connection')
      }
    }

    return {
      success: false,
      error: errorMessage
    }
  }
}

// ========================================================================
// TUNNEL RETRIEVAL
// ========================================================================

/**
 * Get the public URL for an existing tunnel
 *
 * @param userId - User ID
 * @param sandboxId - Sandbox ID
 * @returns Public URL if tunnel exists, null otherwise
 */
export function getTunnelUrl(userId: string, sandboxId: string): string | null {
  const tunnelKey = getTunnelKey(userId, sandboxId)
  const tunnel = activeTunnels.get(tunnelKey)
  return tunnel ? tunnel.url : null
}

/**
 * Check if a tunnel exists for a user/sandbox
 *
 * @param userId - User ID
 * @param sandboxId - Sandbox ID
 * @returns True if tunnel exists and is active
 */
export function hasTunnel(userId: string, sandboxId: string): boolean {
  return activeTunnels.has(getTunnelKey(userId, sandboxId))
}

/**
 * Get information about an active tunnel
 *
 * @param userId - User ID
 * @param sandboxId - Sandbox ID
 * @returns Tunnel data if exists, null otherwise
 */
export function getTunnelInfo(userId: string, sandboxId: string): TunnelData | null {
  const tunnelKey = getTunnelKey(userId, sandboxId)
  return activeTunnels.get(tunnelKey) || null
}

// ========================================================================
// TUNNEL CLEANUP
// ========================================================================

/**
 * Close a specific tunnel
 *
 * @param userId - User ID
 * @param sandboxId - Sandbox ID
 * @returns True if tunnel was closed, false if not found
 */
export async function closeTunnel(userId: string, sandboxId: string): Promise<boolean> {
  try {
    const tunnelKey = getTunnelKey(userId, sandboxId)
    const tunnel = activeTunnels.get(tunnelKey)

    if (!tunnel) {
      console.log(`⚠️  No tunnel found for ${tunnelKey}`)
      return false
    }

    // Close the ngrok listener
    await tunnel.listener.close()
    activeTunnels.delete(tunnelKey)

    console.log(`✅ Tunnel closed: ${tunnelKey}`)
    console.log(`   URL was: ${tunnel.url}`)
    console.log(`   Active tunnels: ${activeTunnels.size}`)

    return true
  } catch (error) {
    console.error('❌ Error closing tunnel:', error)
    return false
  }
}

/**
 * Close all active tunnels
 * Called on process shutdown
 *
 * @returns Promise that resolves when all tunnels are closed
 */
export async function closeAllTunnels(): Promise<void> {
  const tunnelCount = activeTunnels.size

  if (tunnelCount === 0) {
    console.log('🛑 No active tunnels to close')
    return
  }

  console.log(`🛑 Closing ${tunnelCount} active tunnel${tunnelCount > 1 ? 's' : ''}...`)

  // Close all tunnels concurrently
  const closePromises = Array.from(activeTunnels.entries()).map(async ([key, tunnel]) => {
    try {
      await tunnel.listener.close()
      console.log(`   ✅ Closed: ${key} (${tunnel.url})`)
    } catch (error) {
      console.error(`   ❌ Error closing ${key}:`, error)
    }
  })

  await Promise.all(closePromises)
  activeTunnels.clear()

  console.log('✅ All tunnels closed')
}

/**
 * Get statistics about active tunnels
 *
 * @returns Object with tunnel statistics
 */
export function getTunnelStats() {
  return {
    total: activeTunnels.size,
    tunnels: Array.from(activeTunnels.entries()).map(([key, tunnel]) => ({
      key,
      userId: tunnel.userId,
      sandboxId: tunnel.sandboxId,
      url: tunnel.url,
      port: tunnel.port,
      uptime: Date.now() - tunnel.createdAt.getTime()
    }))
  }
}

// ========================================================================
// PROCESS EXIT HANDLERS
// ========================================================================

/**
 * Clean up tunnels on process exit
 * Ensures ngrok connections are properly closed
 */
async function cleanup() {
  console.log('\n🛑 Process terminating - cleaning up tunnels...')
  await closeAllTunnels()
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await cleanup()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await cleanup()
  process.exit(0)
})

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught exception:', error)
  await cleanup()
  process.exit(1)
})

// Log service initialization
console.log('🔗 Tunnel service initialized')
console.log(`   Provider: ngrok`)
console.log(`   Authtoken: ${process.env.NGROK_AUTHTOKEN ? 'Configured' : 'Not configured (free tier)'}`)
