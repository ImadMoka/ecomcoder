import { supabase } from '@/lib/supabase'

/**
 * ========================================================================
 * PORT ALLOCATION SERVICE
 * ========================================================================
 *
 * Simple port management using the existing user_sandboxes table.
 * No new tables needed - just queries existing ports and finds available pairs.
 *
 * PORT RANGES:
 * - Dev Server (Shopify):  5100-5400 (300 slots)
 * - Proxy Server:          6100-6400 (300 slots)
 * - Pairing: dev=5100 → proxy=6100, dev=5101 → proxy=6101, etc.
 *
 * FEATURES:
 * - Reuses existing ports for same sandbox
 * - Auto-cleanup when sandbox deleted
 * - Sequential allocation
 * - Database-driven (single source of truth)
 * ========================================================================
 */

const DEV_PORT_START = 5100
const DEV_PORT_END = 5400
const PROXY_PORT_START = 6100
const PROXY_PORT_END = 6400

/**
 * Finds the next available port pair by querying the database
 * @returns Object with devPort and proxyPort, or null if none available
 */
export async function findAvailablePortPair(): Promise<{ devPort: number; proxyPort: number } | null> {
  try {
    // Query all sandboxes with ports assigned
    const { data: sandboxes, error } = await supabase
      .from('user_sandboxes')
      .select('dev_port, proxy_port')
      .not('dev_port', 'is', null)
      .not('proxy_port', 'is', null)

    if (error) {
      console.error('❌ Error querying ports from database:', error)
      return null
    }

    // Build sets of used ports for fast lookup
    const usedDevPorts = new Set(sandboxes?.map(s => s.dev_port) || [])
    const usedProxyPorts = new Set(sandboxes?.map(s => s.proxy_port) || [])

    console.log(`📊 Port utilization: ${usedDevPorts.size}/300 dev ports, ${usedProxyPorts.size}/300 proxy ports`)

    // Find first available pair (sequential allocation)
    for (let i = 0; i <= (DEV_PORT_END - DEV_PORT_START); i++) {
      const devPort = DEV_PORT_START + i
      const proxyPort = PROXY_PORT_START + i

      if (!usedDevPorts.has(devPort) && !usedProxyPorts.has(proxyPort)) {
        console.log(`✅ Found available port pair: dev=${devPort}, proxy=${proxyPort}`)
        return { devPort, proxyPort }
      }
    }

    console.error('❌ No available ports in pool (all 300 slots used)')
    return null

  } catch (error) {
    console.error('❌ Exception in findAvailablePortPair:', error)
    return null
  }
}

/**
 * Gets ports for a sandbox - reuses existing or allocates new
 * This is the main function to call when starting/refreshing servers
 *
 * @param sandboxId - The sandbox ID
 * @returns Object with devPort and proxyPort, or null on error
 */
export async function getPortsForSandbox(sandboxId: string): Promise<{ devPort: number; proxyPort: number } | null> {
  try {
    console.log(`🔍 Getting ports for sandbox: ${sandboxId}`)

    // Check if sandbox already has ports assigned
    const { data: sandbox, error } = await supabase
      .from('user_sandboxes')
      .select('dev_port, proxy_port')
      .eq('id', sandboxId)
      .single()

    if (error) {
      console.error('❌ Error getting sandbox from database:', error)
      return null
    }

    // If sandbox has ports, reuse them
    if (sandbox.dev_port && sandbox.proxy_port) {
      console.log(`♻️  Reusing existing ports for sandbox ${sandboxId}:`)
      console.log(`   Dev Port:   ${sandbox.dev_port}`)
      console.log(`   Proxy Port: ${sandbox.proxy_port}`)
      return {
        devPort: sandbox.dev_port,
        proxyPort: sandbox.proxy_port
      }
    }

    // Otherwise, allocate new ports
    console.log(`🆕 Allocating new ports for sandbox ${sandboxId}...`)
    const ports = await findAvailablePortPair()

    if (!ports) {
      console.error('❌ No available ports in pool')
      return null
    }

    // Save ports to sandbox
    const { error: updateError } = await supabase
      .from('user_sandboxes')
      .update({
        dev_port: ports.devPort,
        proxy_port: ports.proxyPort,
        last_used: new Date().toISOString()
      })
      .eq('id', sandboxId)

    if (updateError) {
      console.error('❌ Error saving ports to sandbox:', updateError)
      return null
    }

    console.log(`✅ Allocated and saved new ports:`)
    console.log(`   Dev Port:   ${ports.devPort}`)
    console.log(`   Proxy Port: ${ports.proxyPort}`)

    return ports

  } catch (error) {
    console.error('❌ Exception in getPortsForSandbox:', error)
    return null
  }
}

/**
 * Gets current port utilization stats
 * Useful for monitoring and debugging
 *
 * @returns Object with stats about port usage
 */
export async function getPortUtilization(): Promise<{
  used: number
  total: number
  available: number
  percentUsed: number
} | null> {
  try {
    const { data: sandboxes, error } = await supabase
      .from('user_sandboxes')
      .select('dev_port, proxy_port')
      .not('dev_port', 'is', null)
      .not('proxy_port', 'is', null)

    if (error) {
      console.error('Error getting port utilization:', error)
      return null
    }

    const used = sandboxes?.length || 0
    const total = DEV_PORT_END - DEV_PORT_START + 1
    const available = total - used
    const percentUsed = (used / total) * 100

    return {
      used,
      total,
      available,
      percentUsed: Math.round(percentUsed * 10) / 10
    }

  } catch (error) {
    console.error('Exception in getPortUtilization:', error)
    return null
  }
}
