import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { createTunnel, closeTunnel } from './tunnelService'

const execAsync = promisify(exec)

export interface ThemeCreationResult {
  success: boolean
  output?: string
  error?: string
}

export async function createThemeFolder(userId: string, sandboxId: string): Promise<ThemeCreationResult> {
  try {
    const scriptPath = path.join(process.cwd(), 'build.sh')
    const { stdout, stderr } = await execAsync(`${scriptPath} ${userId} ${sandboxId}`, {
      timeout: 5000, // 5 seconds timeout for folder creation
      cwd: process.cwd() // Ensure script runs from project root
    })

    if (stderr) {
      console.error('Build script stderr:', stderr)
    }

    console.log('Build script output:', stdout)

    return {
      success: true,
      output: stdout
    }
  } catch (error: unknown) {
    console.error('Error executing build script:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

export async function pullTheme(userId: string, sandboxId: string, storeUrl: string, apiKey: string): Promise<ThemeCreationResult> {
  try {
    const scriptPath = path.join(process.cwd(), 'pull-theme.sh')
    const { stdout, stderr } = await execAsync(`${scriptPath} ${userId} ${sandboxId} ${storeUrl} ${apiKey}`, {
      timeout: 600000, // 10 minutes timeout for shopify theme pull (367 files can take a while)
      cwd: process.cwd() // Ensure script runs from project root
    })

    if (stderr) {
      console.error('Pull theme script stderr:', stderr)
    }

    console.log('Pull theme script output:', stdout)

    return {
      success: true,
      output: stdout
    }
  } catch (error: unknown) {
    console.error('Error executing pull theme script:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

export async function pushTheme(userId: string, sandboxId: string, storeUrl: string, apiKey: string): Promise<ThemeCreationResult & { themeId?: number; themeName?: string }> {
  try {
    const scriptPath = path.join(process.cwd(), 'push-theme.sh')
    const { stdout, stderr } = await execAsync(`${scriptPath} ${userId} ${sandboxId} ${storeUrl} ${apiKey}`, {
      timeout: 600000, // 10 minutes timeout for shopify theme push (367 files can take a while)
      cwd: process.cwd() // Ensure script runs from project root
    })

    if (stderr) {
      console.error('Push theme script stderr:', stderr)
    }

    console.log('Push theme script output:', stdout)

    // Extract theme ID from output
    const themeIdMatch = stdout.match(/THEME_ID=(\d+)/)
    const themeNameMatch = stdout.match(/THEME_NAME=(.+)/)

    if (!themeIdMatch) {
      console.error('Failed to extract theme ID from push output')
      return {
        success: false,
        error: 'Failed to extract theme ID from Shopify response'
      }
    }

    const themeId = parseInt(themeIdMatch[1], 10)
    const themeName = themeNameMatch ? themeNameMatch[1].trim() : `ecomCoder-theme-${sandboxId}`

    console.log(`✅ Theme pushed successfully - ID: ${themeId}, Name: ${themeName}`)

    return {
      success: true,
      output: stdout,
      themeId,
      themeName
    }
  } catch (error: unknown) {
    console.error('Error executing push theme script:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

export async function setupClaude(userId: string, sandboxId: string): Promise<ThemeCreationResult> {
  try {
    const scriptPath = path.join(process.cwd(), 'setup-claude.sh')
    const { stdout, stderr } = await execAsync(`${scriptPath} ${userId} ${sandboxId}`, {
      timeout: 10000, // 10 seconds timeout for Claude setup
      cwd: process.cwd() // Ensure script runs from project root
    })

    if (stderr) {
      console.error('Setup Claude script stderr:', stderr)
    }

    console.log('Setup Claude script output:', stdout)

    return {
      success: true,
      output: stdout
    }
  } catch (error: unknown) {
    console.error('Error executing setup Claude script:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * ========================================================================
 * START DEVELOPMENT SERVER WITH X-FRAME-OPTIONS REMOVAL
 * ========================================================================
 *
 * Starts a dual-server setup for Shopify theme development:
 * 1. Shopify CLI development server (direct theme access)
 * 2. HTTP proxy server (removes X-Frame-Options headers for iframe embedding)
 *
 * ARCHITECTURE:
 * Client → Proxy Server (port 4000+) → Shopify Dev Server (port 3000+)
 *
 * FEATURES:
 * - Dynamic port allocation for multi-user support
 * - Automatic X-Frame-Options header removal
 * - Background process management
 * - Port conflict resolution
 * - Process monitoring and cleanup
 *
 * @param userId - Unique identifier for the user
 * @param sandboxId - Unique identifier for the theme sandbox
 * @param storeUrl - Shopify store URL (e.g., store.myshopify.com)
 * @param apiKey - Shopify theme access token (shptka_...)
 * @param themeId - Shopify theme ID (numeric) - REQUIRED for unpublished development theme
 * @param storePassword - Optional password for password-protected stores
 * @param requestedPort - Target port number or 'auto' for automatic assignment
 *
 * @returns Promise with server status and port information
 * ========================================================================
 */
/**
 * ========================================================================
 * REFRESH DEVELOPMENT SERVER
 * ========================================================================
 *
 * Simplified refresh: closes old tunnel and restarts servers.
 * dev-theme.sh handles all process cleanup (zombie killing) automatically.
 *
 * @param userId - Unique identifier for the user
 * @param sandboxId - Unique identifier for the theme sandbox
 * @param storeUrl - Shopify store URL (e.g., store.myshopify.com)
 * @param apiKey - Shopify theme access token (shptka_...)
 * @param themeId - Shopify theme ID (numeric) - REQUIRED
 * @param devPort - Shopify dev server port (from database)
 * @param proxyPort - Proxy server port (from database)
 * @param storePassword - Optional password for password-protected stores
 *
 * @returns Promise with server status and port information
 * ========================================================================
 */
export async function refreshDevServer(
  userId: string,
  sandboxId: string,
  storeUrl: string,
  apiKey: string,
  themeId: number,
  devPort: number,
  proxyPort: number,
  storePassword?: string
): Promise<ThemeCreationResult & { assignedPort?: number; shopifyPort?: number; proxyPort?: number; publicUrl?: string }> {
  try {
    console.log('🔄 Refreshing development server...')
    console.log(`   User: ${userId} | Sandbox: ${sandboxId}`)

    // Close old tunnel
    await closeTunnel(userId, sandboxId)

    // Restart servers (dev-theme.sh handles process cleanup automatically)
    return await startDevServer(userId, sandboxId, storeUrl, apiKey, themeId, devPort, proxyPort, storePassword)
  } catch (error: unknown) {
    console.error('Error refreshing dev server:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

export async function startDevServer(
  userId: string,
  sandboxId: string,
  storeUrl: string,
  apiKey: string,
  themeId: number,
  devPort: number,
  proxyPort: number,
  storePassword?: string
): Promise<ThemeCreationResult & { assignedPort?: number; shopifyPort?: number; proxyPort?: number; publicUrl?: string }> {
  try {
    // ========================================================================
    // STEP 1: PREPARE SCRIPT EXECUTION
    // ========================================================================

    const scriptPath = path.join(process.cwd(), 'dev-theme.sh')
    const args = [userId, sandboxId, storeUrl, apiKey]

    // Add parameters in correct order: themeId, devPort, proxyPort, storePassword
    args.push(themeId.toString())       // Theme ID is required
    args.push(devPort.toString())       // Dev server port (from port allocation)
    args.push(proxyPort.toString())     // Proxy server port (from port allocation)
    args.push(storePassword || '')      // Empty string if no store password

    // ========================================================================
    // STEP 2: SPAWN DEVELOPMENT SERVER PROCESS
    // ========================================================================

    // Start dev server in background with proper process isolation
    const child = spawn(scriptPath, args, {
      cwd: process.cwd(),
      detached: true,          // Run independently of parent process
      stdio: ['ignore', 'pipe', 'pipe']  // Capture stdout/stderr for monitoring
    })

    // ========================================================================
    // STEP 3: OUTPUT MONITORING
    // ========================================================================
    // Ports are now passed as parameters (pre-allocated from database)
    // No need to extract from output - we already know them!

    let output = ''
    let errorOutput = ''
    const assignedPort = proxyPort  // Main user-facing port is the proxy port

    // Set up timeout for initial startup monitoring (extended for dual-server setup)
    const timeout = setTimeout(() => {
      child.stdout?.removeAllListeners()
      child.stderr?.removeAllListeners()
    }, 30000)  // 30 seconds for both servers to start

    // Monitor stdout for startup confirmation and logging
    child.stdout?.on('data', (data) => {
      const dataStr = data.toString()
      output += dataStr
    })

    // Monitor stderr for errors
    child.stderr?.on('data', (data) => {
      errorOutput += data.toString()
    })

    // ========================================================================
    // STEP 4: STARTUP CONFIRMATION AND ERROR HANDLING
    // ========================================================================

    // Wait for startup confirmation from the script
    await new Promise((resolve, reject) => {
      const checkOutput = () => {
        // Look for success indicators from the script
        if (output.includes('🎉 Both servers are running!') ||
            output.includes('Development servers will be available at:') ||
            output.includes('Starting Shopify theme development server')) {
          clearTimeout(timeout)
          resolve(true)
        }
      }

      child.stdout?.on('data', checkOutput)

      // Handle process errors
      child.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })

      // Auto-resolve after 30 seconds to prevent hanging
      setTimeout(() => {
        clearTimeout(timeout)
        resolve(true)
      }, 30000)
    })

    // ========================================================================
    // STEP 5: PROCESS DETACHMENT
    // ========================================================================

    // Detach the process so it continues running independently
    child.unref()

    // ========================================================================
    // STEP 6: WAIT FOR PORT TO BE READY
    // ========================================================================

    // The tunnel port is the proxy port (user-facing)
    const tunnelPort = proxyPort

    console.log(`⏳ Waiting for proxy server on port ${tunnelPort} to be ready...`)

    // Wait for the port to actually be listening (max 30 seconds)
    const isPortReady = await new Promise<boolean>((resolve) => {
      const maxAttempts = 60 // 60 attempts * 500ms = 30 seconds
      let attempts = 0

      const checkPort = async () => {
        attempts++
        try {
          const net = await import('net')
          const socket = new net.Socket()

          socket.setTimeout(1000)

          socket.on('connect', () => {
            socket.destroy()
            console.log(`✅ Port ${tunnelPort} is ready!`)
            resolve(true)
          })

          socket.on('timeout', () => {
            socket.destroy()
            if (attempts >= maxAttempts) {
              console.warn(`⚠️  Port ${tunnelPort} not ready after ${maxAttempts * 0.5}s, continuing anyway...`)
              resolve(false)
            } else {
              setTimeout(checkPort, 500)
            }
          })

          socket.on('error', () => {
            socket.destroy()
            if (attempts >= maxAttempts) {
              console.warn(`⚠️  Port ${tunnelPort} not ready after ${maxAttempts * 0.5}s, continuing anyway...`)
              resolve(false)
            } else {
              setTimeout(checkPort, 500)
            }
          })

          socket.connect(tunnelPort, '127.0.0.1')
        } catch (err) {
          if (attempts >= maxAttempts) {
            console.warn(`⚠️  Port check failed, continuing anyway...`)
            resolve(false)
          } else {
            setTimeout(checkPort, 500)
          }
        }
      }

      checkPort()
    })

    // ========================================================================
    // STEP 7: CREATE PUBLIC TUNNEL (REQUIRED)
    // ========================================================================

    console.log('🌍 Creating public tunnel for remote access...')
    const tunnelResult = await createTunnel(
      tunnelPort,
      userId,
      sandboxId
    )

    if (!tunnelResult.success || !tunnelResult.publicUrl) {
      throw new Error(`Failed to create ngrok tunnel: ${tunnelResult.error || 'Unknown error'}`)
    }

    const publicTunnelUrl = tunnelResult.publicUrl
    console.log(`✅ Public tunnel created: ${publicTunnelUrl}`)

    // ========================================================================
    // STEP 8: LOG SUCCESSFUL STARTUP
    // ========================================================================

    console.log(`✅ Dev server started successfully:`)
    console.log(`   Local:  http://127.0.0.1:${tunnelPort}`)
    console.log(`   Public: ${publicTunnelUrl}`)

    if (errorOutput) {
      console.warn('⚠️  Dev server warnings:', errorOutput)
    }

    // ========================================================================
    // STEP 9: RETURN COMPREHENSIVE RESULT
    // ========================================================================

    return {
      success: true,
      output: `✅ Dev server with X-Frame-Options removal proxy started successfully in background.\n${output}`,
      assignedPort,    // Main port (proxy) for user access
      shopifyPort: devPort,     // Direct Shopify server port (passed as parameter)
      proxyPort,       // Proxy server port (passed as parameter)
      publicUrl: publicTunnelUrl  // Public ngrok URL (required)
    }
  } catch (error: unknown) {
    console.error('Error starting dev server:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

// Future VM implementation would replace these functions:
// export async function createThemeFolderOnVM(userId: string, sandboxId: string): Promise<ThemeCreationResult> {
//   try {
//     const result = await vmClient.executeScript({
//       script: 'build.sh',
//       params: { userId, sandboxId },
//       vmInstance: 'theme-builder-vm',
//       timeout: 30000
//     })
//
//     return {
//       success: true,
//       output: result.stdout
//     }
//   } catch (error) {
//     return {
//       success: false,
//       error: error.message
//     }
//   }
// }
//
// export async function pullThemeOnVM(userId: string, sandboxId: string, storeUrl: string, apiKey: string): Promise<ThemeCreationResult> {
//   try {
//     const result = await vmClient.executeScript({
//       script: 'pull-theme.sh',
//       params: { userId, sandboxId, storeUrl, apiKey },
//       vmInstance: 'theme-builder-vm',
//       timeout: 120000 // 2 minutes for shopify theme pull
//     })
//
//     return {
//       success: true,
//       output: result.stdout
//     }
//   } catch (error) {
//     return {
//       success: false,
//       error: error.message
//     }
//   }
// }