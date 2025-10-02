import { NextRequest, NextResponse } from 'next/server'
import { updateSandboxPreviewUrl } from '@/services/userSandboxService'
import { refreshDevServer } from '@/services/themeService'

/**
 * ========================================================================
 * REFRESH DEVELOPMENT SERVER API ENDPOINT
 * ========================================================================
 *
 * POST /api/refresh-server
 *
 * Kills specific development server processes and restarts them cleanly.
 * Uses sandbox-specific ports to target only that sandbox's servers.
 *
 * REQUEST BODY:
 * {
 *   sandboxId: string       // Required: Sandbox ID
 * }
 *
 * RESPONSE:
 * {
 *   success: boolean
 *   previewUrl: string        // Updated preview URL (public or local)
 *   publicUrl: string | null  // Public ngrok URL if available
 *   localUrl: string | null   // Local proxy URL
 *   message: string
 * }
 *
 * PROCESS:
 * 1. Validates sandboxId
 * 2. Retrieves sandbox configuration (theme_id, credentials, preview_url, ports)
 * 3. Validates sandbox has port information
 * 4. Closes old ngrok tunnel if exists
 * 5. Kills processes on specific dev_port and proxy_port
 * 6. Cleans up temporary files
 * 7. Restarts servers on SAME ports (reuses database-allocated ports)
 * 8. Updates sandbox preview URL
 *
 * ========================================================================
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sandboxId } = body

    // ==========================================
    // STEP 1: VALIDATE REQUEST
    // ==========================================

    if (!sandboxId) {
      return NextResponse.json(
        { error: 'sandboxId is required' },
        { status: 400 }
      )
    }

    // ==========================================
    // STEP 2: FIND SANDBOX AND VALIDATE
    // ==========================================

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

    if (!sandbox.theme_id) {
      return NextResponse.json(
        { error: 'Sandbox does not have a theme_id' },
        { status: 400 }
      )
    }

    if (!sandbox.shopify_theme_password || !sandbox.shopify_url) {
      return NextResponse.json(
        { error: 'Sandbox missing Shopify credentials' },
        { status: 400 }
      )
    }

    if (!sandbox.dev_port || !sandbox.proxy_port) {
      return NextResponse.json(
        { error: 'Sandbox missing port information. Cannot perform targeted refresh.' },
        { status: 400 }
      )
    }

    console.log(`🔄 Refreshing server for sandbox: ${sandboxId}`)
    console.log(`   User: ${sandbox.user_id}`)
    console.log(`   Theme ID: ${sandbox.theme_id}`)
    console.log(`   Current Dev Port: ${sandbox.dev_port}`)
    console.log(`   Current Proxy Port: ${sandbox.proxy_port}`)

    // ==========================================
    // STEP 3: REFRESH DEVELOPMENT SERVER
    // ==========================================

    const refreshResult = await refreshDevServer(
      sandbox.user_id,
      sandbox.id,
      sandbox.shopify_url,
      sandbox.shopify_theme_password,
      sandbox.theme_id,
      sandbox.dev_port,
      sandbox.proxy_port,
      sandbox.shopify_store_password || undefined
    )

    if (!refreshResult.success) {
      return NextResponse.json(
        { error: 'Failed to refresh development server', details: refreshResult.error },
        { status: 500 }
      )
    }

    // Ports don't change during refresh - they're reused from database

    // ==========================================
    // STEP 4: UPDATE PREVIEW URL IN DATABASE
    // ==========================================

    // Priority: Use public tunnel URL if available, fallback to local proxy URL
    const previewUrl = refreshResult.publicUrl
      ? refreshResult.publicUrl
      : refreshResult.proxyPort
        ? `http://127.0.0.1:${refreshResult.proxyPort}`
        : `http://127.0.0.1:${refreshResult.assignedPort || 4000}`

    console.log(`📱 Updated Preview URL: ${previewUrl}`)
    console.log(`   Type: ${refreshResult.publicUrl ? 'Public (ngrok)' : 'Local (proxy)'}`)

    // Save the updated preview URL to the database
    const urlUpdateResult = await updateSandboxPreviewUrl(sandbox.id, previewUrl)
    if (!urlUpdateResult.success) {
      console.warn('⚠️  Failed to update preview URL in database:', urlUpdateResult.error)
      // Don't fail the entire request, just log the warning
    }

    // ==========================================
    // STEP 5: RETURN SUCCESS RESPONSE
    // ==========================================

    return NextResponse.json({
      success: true,
      previewUrl: previewUrl,
      publicUrl: refreshResult.publicUrl || null,
      localUrl: refreshResult.proxyPort ? `http://127.0.0.1:${refreshResult.proxyPort}` : null,
      message: 'Development server refreshed successfully'
    })

  } catch (error: unknown) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
