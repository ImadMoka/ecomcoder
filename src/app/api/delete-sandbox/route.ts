import { NextRequest, NextResponse } from 'next/server'
import { closeTunnel } from '@/services/tunnelService'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

/**
 * ========================================================================
 * DELETE SANDBOX API ENDPOINT
 * ========================================================================
 *
 * POST /api/delete-sandbox
 *
 * Completely removes a sandbox and all associated resources:
 * - Kills running development server processes
 * - Closes ngrok tunnels
 * - Deletes theme files and directories
 * - Removes temporary files and logs
 * - Deletes database record (ports auto-freed)
 *
 * REQUEST BODY:
 * {
 *   sandboxId: string  // Required: Sandbox ID to delete
 * }
 *
 * RESPONSE:
 * {
 *   success: boolean
 *   message: string
 * }
 *
 * PROCESS:
 * 1. Validates sandboxId and fetches sandbox data
 * 2. Kills processes on dev_port and proxy_port
 * 3. Closes ngrok tunnel
 * 4. Deletes theme folder and temporary files
 * 5. Deletes sandbox from database
 *
 * ========================================================================
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sandboxId } = body

    // ==========================================
    // STEP 1: VALIDATE AND FETCH SANDBOX
    // ==========================================

    if (!sandboxId) {
      return NextResponse.json(
        { error: 'sandboxId is required' },
        { status: 400 }
      )
    }

    console.log(`🗑️  Deleting sandbox: ${sandboxId}`)

    const { supabase } = await import('@/lib/supabase')
    const { data: sandbox, error: sandboxError } = await supabase
      .from('user_sandboxes')
      .select('*')
      .eq('id', sandboxId)
      .single()

    if (sandboxError || !sandbox) {
      return NextResponse.json(
        { error: 'Sandbox not found' },
        { status: 404 }
      )
    }

    console.log(`   User ID: ${sandbox.user_id}`)
    console.log(`   Store: ${sandbox.shopify_url}`)
    console.log(`   Dev Port: ${sandbox.dev_port || 'not assigned'}`)
    console.log(`   Proxy Port: ${sandbox.proxy_port || 'not assigned'}`)

    // ==========================================
    // STEP 2: KILL PROCESSES ON PORTS
    // ==========================================

    console.log('🔪 Killing development server processes...')

    let processesKilled = 0

    // Kill process on dev port if assigned
    if (sandbox.dev_port) {
      try {
        const { stdout } = await execAsync(`lsof -ti :${sandbox.dev_port}`, { timeout: 5000 })
        const pids = stdout.trim().split('\n').filter(pid => pid)

        if (pids.length > 0) {
          console.log(`   Found ${pids.length} process(es) on dev port ${sandbox.dev_port}`)
          await execAsync(`lsof -ti :${sandbox.dev_port} | xargs kill`, { timeout: 5000 })
          processesKilled += pids.length
          console.log(`   ✅ Killed process(es) on dev port ${sandbox.dev_port}`)
        } else {
          console.log(`   ℹ️  No processes on dev port ${sandbox.dev_port}`)
        }
      } catch (error: any) {
        // lsof returns error if no process found - this is okay
        if (!error.message.includes('No such process')) {
          console.log(`   ℹ️  No processes on dev port ${sandbox.dev_port}`)
        }
      }
    }

    // Kill process on proxy port if assigned
    if (sandbox.proxy_port) {
      try {
        const { stdout } = await execAsync(`lsof -ti :${sandbox.proxy_port}`, { timeout: 5000 })
        const pids = stdout.trim().split('\n').filter(pid => pid)

        if (pids.length > 0) {
          console.log(`   Found ${pids.length} process(es) on proxy port ${sandbox.proxy_port}`)
          await execAsync(`lsof -ti :${sandbox.proxy_port} | xargs kill`, { timeout: 5000 })
          processesKilled += pids.length
          console.log(`   ✅ Killed process(es) on proxy port ${sandbox.proxy_port}`)
        } else {
          console.log(`   ℹ️  No processes on proxy port ${sandbox.proxy_port}`)
        }
      } catch (error: any) {
        // lsof returns error if no process found - this is okay
        if (!error.message.includes('No such process')) {
          console.log(`   ℹ️  No processes on proxy port ${sandbox.proxy_port}`)
        }
      }
    }

    console.log(`   Total processes killed: ${processesKilled}`)

    // ==========================================
    // STEP 3: CLOSE NGROK TUNNEL
    // ==========================================

    console.log('🔗 Closing ngrok tunnel...')

    try {
      const tunnelClosed = await closeTunnel(sandbox.user_id, sandboxId)
      if (tunnelClosed) {
        console.log('   ✅ Tunnel closed successfully')
      } else {
        console.log('   ℹ️  No active tunnel found')
      }
    } catch (error) {
      console.warn('   ⚠️  Error closing tunnel (continuing anyway):', error)
    }

    // ==========================================
    // STEP 4: DELETE THEME FOLDER
    // ==========================================

    console.log('📁 Deleting theme folder...')

    const projectRoot = process.cwd()
    const themeDir = path.join(projectRoot, 'themes', `user_${sandbox.user_id}`, `theme_${sandboxId}`)

    console.log(`   Path: ${themeDir}`)

    try {
      await execAsync(`rm -rf "${themeDir}"`, { timeout: 10000 })
      console.log('   ✅ Theme folder deleted')
    } catch (error: any) {
      console.warn('   ⚠️  Error deleting theme folder (continuing anyway):', error.message)
    }

    // ==========================================
    // STEP 5: DELETE TEMPORARY FILES
    // ==========================================

    console.log('🧹 Deleting temporary files...')

    const tempFiles = [
      `/tmp/shopify-${sandbox.user_id}-${sandboxId}.log`,
      `/tmp/proxy-${sandbox.user_id}-${sandboxId}.log`
    ]

    for (const file of tempFiles) {
      try {
        await execAsync(`rm -f "${file}"`, { timeout: 5000 })
        console.log(`   ✅ Deleted: ${file}`)
      } catch (error: any) {
        console.warn(`   ℹ️  Could not delete ${file} (may not exist)`)
      }
    }

    // ==========================================
    // STEP 6: DELETE DATABASE RECORD
    // ==========================================

    console.log('💾 Deleting database record...')

    const { error: deleteError } = await supabase
      .from('user_sandboxes')
      .delete()
      .eq('id', sandboxId)

    if (deleteError) {
      console.error('   ❌ Error deleting sandbox from database:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete sandbox from database', details: deleteError.message },
        { status: 500 }
      )
    }

    console.log('   ✅ Database record deleted (ports auto-freed)')

    // ==========================================
    // STEP 7: RETURN SUCCESS
    // ==========================================

    console.log(`✅ Sandbox ${sandboxId} deleted successfully`)
    console.log(`   Processes killed: ${processesKilled}`)
    console.log(`   Resources cleaned: theme folder, logs, tunnel, database`)

    return NextResponse.json({
      success: true,
      message: `Sandbox deleted successfully. Killed ${processesKilled} process(es), removed all files and freed ports.`
    })

  } catch (error: unknown) {
    console.error('❌ API Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
