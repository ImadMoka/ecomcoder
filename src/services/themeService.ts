import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { createTunnel } from './tunnelService'

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
      timeout: 120000, // 2 minutes timeout for shopify theme pull
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
      timeout: 120000, // 2 minutes timeout for shopify theme push
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
 * Kills existing development server processes and restarts them cleanly.
 * Useful for applying configuration changes or recovering from errors.
 *
 * PROCESS:
 * 1. Kills existing Shopify dev server for this sandbox
 * 2. Kills existing proxy server for this sandbox
 * 3. Cleans up temporary files and logs
 * 4. Restarts both servers with updated configuration
 *
 * @param userId - Unique identifier for the user
 * @param sandboxId - Unique identifier for the theme sandbox
 * @param storeUrl - Shopify store URL (e.g., store.myshopify.com)
 * @param apiKey - Shopify theme access token (shptka_...)
 * @param themeId - Shopify theme ID (numeric) - REQUIRED
 * @param storePassword - Optional password for password-protected stores
 * @param requestedPort - Target port number or 'auto' for automatic assignment
 *
 * @returns Promise with server status and port information
 * ========================================================================
 */
export async function refreshDevServer(userId: string, sandboxId: string, storeUrl: string, apiKey: string, themeId: number, storePassword?: string, requestedPort: string | number = 'auto'): Promise<ThemeCreationResult & { assignedPort?: number; shopifyPort?: number; proxyPort?: number; publicUrl?: string }> {
  try {
    const scriptPath = path.join(process.cwd(), 'refresh-dev-server.sh')
    const args = [userId, sandboxId, storeUrl, apiKey]

    // Add parameters in correct order: themeId (required), storePassword, port
    args.push(themeId.toString())  // Theme ID is required
    args.push(storePassword || '')  // Empty string if no store password
    args.push(requestedPort.toString())

    console.log('🔄 Refreshing development server...')
    console.log(`   User: ${userId} | Sandbox: ${sandboxId}`)
    console.log(`   Theme ID: ${themeId}`)

    // Start refresh process in background with proper process isolation
    const child = spawn(scriptPath, args, {
      cwd: process.cwd(),
      detached: true,          // Run independently of parent process
      stdio: ['ignore', 'pipe', 'pipe']  // Capture stdout/stderr for monitoring
    })

    let output = ''
    let errorOutput = ''
    let assignedPort: number | undefined
    let shopifyPort: number | undefined
    let proxyPort: number | undefined

    // Set up timeout for initial startup monitoring
    const timeout = setTimeout(() => {
      child.stdout?.removeAllListeners()
      child.stderr?.removeAllListeners()
    }, 30000)  // 30 seconds for both servers to restart

    // Monitor stdout for port assignments
    child.stdout?.on('data', (data) => {
      const dataStr = data.toString()
      output += dataStr

      // Extract ports from output
      const assignedPortMatch = dataStr.match(/ASSIGNED_PORT=(\d+)/) || output.match(/ASSIGNED_PORT=(\d+)/)
      const proxyPortHumanMatch = dataStr.match(/Proxy Port:\s+(\d+)/) || output.match(/Proxy Port:\s+(\d+)/)

      if (assignedPortMatch) {
        assignedPort = parseInt(assignedPortMatch[1], 10)
        proxyPort = assignedPort
      } else if (proxyPortHumanMatch) {
        proxyPort = parseInt(proxyPortHumanMatch[1], 10)
        assignedPort = proxyPort
      }

      const shopifyPortMatch = dataStr.match(/SHOPIFY_PORT=(\d+)/) || output.match(/SHOPIFY_PORT=(\d+)/)
      const shopifyPortHumanMatch = dataStr.match(/Shopify Port:\s+(\d+)/) || output.match(/Shopify Port:\s+(\d+)/)

      if (shopifyPortMatch) {
        shopifyPort = parseInt(shopifyPortMatch[1], 10)
      } else if (shopifyPortHumanMatch) {
        shopifyPort = parseInt(shopifyPortHumanMatch[1], 10)
      }

      const proxyPortMatch = dataStr.match(/PROXY_PORT=(\d+)/) || output.match(/PROXY_PORT=(\d+)/)
      if (proxyPortMatch) {
        proxyPort = parseInt(proxyPortMatch[1], 10)
        assignedPort = proxyPort
      }
    })

    // Monitor stderr for errors
    child.stderr?.on('data', (data) => {
      errorOutput += data.toString()
    })

    // Wait for startup confirmation
    await new Promise((resolve, reject) => {
      const checkOutput = () => {
        if (output.includes('🎉 Both servers are running!') ||
            output.includes('Development servers will be available at:') ||
            output.includes('Starting Shopify theme development server')) {
          clearTimeout(timeout)
          resolve(true)
        }
      }

      child.stdout?.on('data', checkOutput)

      child.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })

      setTimeout(() => {
        clearTimeout(timeout)
        resolve(true)
      }, 30000)
    })

    // Detach the process
    child.unref()

    // Final port extraction
    if (!assignedPort || !shopifyPort || !proxyPort) {
      const finalAssignedMatch = output.match(/ASSIGNED_PORT=(\d+)/)
      const finalProxyHumanMatch = output.match(/Proxy Port:\s+(\d+)/)

      if (finalAssignedMatch && !assignedPort) {
        assignedPort = parseInt(finalAssignedMatch[1], 10)
        proxyPort = assignedPort
      } else if (finalProxyHumanMatch && !proxyPort) {
        proxyPort = parseInt(finalProxyHumanMatch[1], 10)
        assignedPort = proxyPort
      }

      const finalShopifyMatch = output.match(/SHOPIFY_PORT=(\d+)/)
      const finalShopifyHumanMatch = output.match(/Shopify Port:\s+(\d+)/)

      if (finalShopifyMatch && !shopifyPort) {
        shopifyPort = parseInt(finalShopifyMatch[1], 10)
      } else if (finalShopifyHumanMatch && !shopifyPort) {
        shopifyPort = parseInt(finalShopifyHumanMatch[1], 10)
      }

      const finalProxyMatch = output.match(/PROXY_PORT=(\d+)/)
      if (finalProxyMatch && !proxyPort) {
        proxyPort = parseInt(finalProxyMatch[1], 10)
        assignedPort = proxyPort
      }
    }

    // Wait for port to be ready
    const tunnelPort = proxyPort || assignedPort || 4000
    console.log(`⏳ Waiting for proxy server on port ${tunnelPort} to be ready...`)

    const isPortReady = await new Promise<boolean>((resolve) => {
      const maxAttempts = 60
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

    // Create public tunnel
    let publicTunnelUrl: string | undefined

    try {
      console.log('🌍 Creating public tunnel for remote access...')
      const tunnelResult = await createTunnel(
        tunnelPort,
        userId,
        sandboxId
      )

      if (tunnelResult.success && tunnelResult.publicUrl) {
        publicTunnelUrl = tunnelResult.publicUrl
        console.log(`✅ Public tunnel created: ${publicTunnelUrl}`)
      } else {
        console.warn('⚠️  Failed to create tunnel:', tunnelResult.error)
        console.warn('⚠️  Continuing with local URL only')
      }
    } catch (tunnelError) {
      console.warn('⚠️  Tunnel creation error:', tunnelError)
      console.warn('⚠️  Continuing with local URL only')
    }

    console.log(`✅ Dev server refreshed successfully:`)
    console.log(`   Local:  http://127.0.0.1:${tunnelPort}`)
    console.log(`   Public: ${publicTunnelUrl || 'Not available'}`)

    if (errorOutput) {
      console.warn('⚠️  Dev server warnings:', errorOutput)
    }

    return {
      success: true,
      output: `✅ Dev server refreshed successfully.\n${output}`,
      assignedPort,
      shopifyPort,
      proxyPort,
      publicUrl: publicTunnelUrl
    }
  } catch (error: unknown) {
    console.error('Error refreshing dev server:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

export async function startDevServer(userId: string, sandboxId: string, storeUrl: string, apiKey: string, themeId: number, storePassword?: string, requestedPort: string | number = 'auto'): Promise<ThemeCreationResult & { assignedPort?: number; shopifyPort?: number; proxyPort?: number; publicUrl?: string }> {
  try {
    // ========================================================================
    // STEP 1: PREPARE SCRIPT EXECUTION
    // ========================================================================

    const scriptPath = path.join(process.cwd(), 'dev-theme.sh')
    const args = [userId, sandboxId, storeUrl, apiKey]

    // Add parameters in correct order: themeId (required), storePassword, port
    args.push(themeId.toString())  // Theme ID is required
    args.push(storePassword || '')  // Empty string if no store password
    args.push(requestedPort.toString())

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
    // STEP 3: OUTPUT MONITORING AND PORT EXTRACTION
    // ========================================================================

    let output = ''
    let errorOutput = ''
    let assignedPort: number | undefined    // Main proxy port (user-facing)
    let shopifyPort: number | undefined     // Direct Shopify server port
    let proxyPort: number | undefined       // Proxy server port (same as assignedPort)

    // Set up timeout for initial startup monitoring (extended for dual-server setup)
    const timeout = setTimeout(() => {
      child.stdout?.removeAllListeners()
      child.stderr?.removeAllListeners()
    }, 30000)  // 30 seconds for both servers to start

    // Monitor stdout for port assignments and startup confirmation
    child.stdout?.on('data', (data) => {
      const dataStr = data.toString()
      output += dataStr

      // ===== PORT EXTRACTION FROM SCRIPT OUTPUT =====
      // Extract ports from the actual output format we're seeing

      // Try both machine-readable format and human-readable format
      const assignedPortMatch = dataStr.match(/ASSIGNED_PORT=(\d+)/) || output.match(/ASSIGNED_PORT=(\d+)/)
      const proxyPortHumanMatch = dataStr.match(/Proxy Port:\s+(\d+)/) || output.match(/Proxy Port:\s+(\d+)/)

      if (assignedPortMatch) {
        assignedPort = parseInt(assignedPortMatch[1], 10)
        proxyPort = assignedPort
      } else if (proxyPortHumanMatch) {
        proxyPort = parseInt(proxyPortHumanMatch[1], 10)
        assignedPort = proxyPort
      }

      const shopifyPortMatch = dataStr.match(/SHOPIFY_PORT=(\d+)/) || output.match(/SHOPIFY_PORT=(\d+)/)
      const shopifyPortHumanMatch = dataStr.match(/Shopify Port:\s+(\d+)/) || output.match(/Shopify Port:\s+(\d+)/)

      if (shopifyPortMatch) {
        shopifyPort = parseInt(shopifyPortMatch[1], 10)
      } else if (shopifyPortHumanMatch) {
        shopifyPort = parseInt(shopifyPortHumanMatch[1], 10)
      }

      const proxyPortMatch = dataStr.match(/PROXY_PORT=(\d+)/) || output.match(/PROXY_PORT=(\d+)/)
      if (proxyPortMatch) {
        proxyPort = parseInt(proxyPortMatch[1], 10)
        assignedPort = proxyPort
      }
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
    // STEP 5: PROCESS DETACHMENT AND SUCCESS RESPONSE
    // ========================================================================

    // Detach the process so it continues running independently
    child.unref()

    // ========================================================================
    // FINAL PORT EXTRACTION ATTEMPT
    // ========================================================================
    // Try to extract ports from complete output one more time
    if (!assignedPort || !shopifyPort || !proxyPort) {
      const finalAssignedMatch = output.match(/ASSIGNED_PORT=(\d+)/)
      const finalProxyHumanMatch = output.match(/Proxy Port:\s+(\d+)/)

      if (finalAssignedMatch && !assignedPort) {
        assignedPort = parseInt(finalAssignedMatch[1], 10)
        proxyPort = assignedPort
      } else if (finalProxyHumanMatch && !proxyPort) {
        proxyPort = parseInt(finalProxyHumanMatch[1], 10)
        assignedPort = proxyPort
      }

      const finalShopifyMatch = output.match(/SHOPIFY_PORT=(\d+)/)
      const finalShopifyHumanMatch = output.match(/Shopify Port:\s+(\d+)/)

      if (finalShopifyMatch && !shopifyPort) {
        shopifyPort = parseInt(finalShopifyMatch[1], 10)
      } else if (finalShopifyHumanMatch && !shopifyPort) {
        shopifyPort = parseInt(finalShopifyHumanMatch[1], 10)
      }

      const finalProxyMatch = output.match(/PROXY_PORT=(\d+)/)
      if (finalProxyMatch && !proxyPort) {
        proxyPort = parseInt(finalProxyMatch[1], 10)
        assignedPort = proxyPort
      }
    }

    // ========================================================================
    // STEP 6: WAIT FOR PORT TO BE READY
    // ========================================================================

    // Determine which port to tunnel (prefer proxy port)
    const tunnelPort = proxyPort || assignedPort || 4000

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
    // STEP 7: CREATE PUBLIC TUNNEL
    // ========================================================================

    let publicTunnelUrl: string | undefined

    try {
      console.log('🌍 Creating public tunnel for remote access...')
      const tunnelResult = await createTunnel(
        tunnelPort,
        userId,
        sandboxId
      )

      if (tunnelResult.success && tunnelResult.publicUrl) {
        publicTunnelUrl = tunnelResult.publicUrl
        console.log(`✅ Public tunnel created: ${publicTunnelUrl}`)
      } else {
        console.warn('⚠️  Failed to create tunnel:', tunnelResult.error)
        console.warn('⚠️  Continuing with local URL only')
        // Don't fail the entire operation - local URL still works
      }
    } catch (tunnelError) {
      console.warn('⚠️  Tunnel creation error:', tunnelError)
      console.warn('⚠️  Continuing with local URL only')
      // Continue without tunnel - local development still works
    }

    // ========================================================================
    // STEP 8: LOG SUCCESSFUL STARTUP
    // ========================================================================

    console.log(`✅ Dev server started successfully:`)
    console.log(`   Local:  http://127.0.0.1:${tunnelPort}`)
    console.log(`   Public: ${publicTunnelUrl || 'Not available'}`)

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
      shopifyPort,     // Direct Shopify server port
      proxyPort,       // Proxy server port (same as assignedPort)
      publicUrl: publicTunnelUrl  // Public ngrok URL (if available)
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