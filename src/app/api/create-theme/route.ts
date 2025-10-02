import { NextRequest, NextResponse } from 'next/server'
import { findUserSandbox, createUserSandbox, updateSandboxStatus, updateSandboxPreviewUrl, updateSandboxThemeId } from '@/services/userSandboxService'
import { createThemeFolder, pullTheme, pushTheme, setupClaude, startDevServer } from '@/services/themeService'
import { createSession } from '@/services/sessionService'
import { getPortsForSandbox } from '@/services/portAllocationService'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, storeUrl, storePassword, apiKey } = body

    // Validate required fields
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      )
    }

    if (!storeUrl) {
      return NextResponse.json(
        { error: 'Store URL is required' },
        { status: 400 }
      )
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key is required' },
        { status: 400 }
      )
    }
    // Check if user sandbox already exists for this user_id + shopify_url combination
    const { data: existingSandbox, error: fetchError } = await findUserSandbox(userId, storeUrl)

    if (fetchError) {
      return NextResponse.json(
        { error: fetchError },
        { status: 500 }
      )
    }

    // If sandbox doesn't exist for this user_id + shopify_url, create it
    if (!existingSandbox) {
      // Create new sandbox record
      const { data: newSandbox, error: createError } = await createUserSandbox({
        user_id: userId,
        shopify_url: storeUrl,
        shopify_theme_password: apiKey,
        shopify_store_password: storePassword,
        status: null,
        shopify_template_id: null,
      })

      if (createError || !newSandbox) {
        return NextResponse.json(
          { error: createError || 'Failed to create sandbox' },
          { status: 500 }
        )
      }


      // ==========================================
      // STEP 1: CREATE THEME FOLDER STRUCTURE
      // ==========================================
      const folderResult = await createThemeFolder(userId, newSandbox.id)

      if (!folderResult.success) {
        await updateSandboxStatus(newSandbox.id, 'error')
        return NextResponse.json(
          { error: 'Failed to create theme directory' },
          { status: 500 }
        )
      }

      await updateSandboxStatus(newSandbox.id, 'created')

      // ==========================================
      // STEP 2: PULL THEME FROM SHOPIFY STORE
      // ==========================================
      await updateSandboxStatus(newSandbox.id, 'pulling-theme')

      const pullResult = await pullTheme(userId, newSandbox.id, storeUrl, apiKey)

      if (!pullResult.success) {
        await updateSandboxStatus(newSandbox.id, 'error')
        return NextResponse.json(
          { error: 'Failed to pull theme from Shopify' },
          { status: 500 }
        )
      }

      await updateSandboxStatus(newSandbox.id, 'theme-pulled')

      // ==========================================
      // STEP 2.5: PUSH THEME AS UNPUBLISHED
      // ==========================================
      await updateSandboxStatus(newSandbox.id, 'pushing-theme')

      const pushResult = await pushTheme(userId, newSandbox.id, storeUrl, apiKey)

      if (!pushResult.success || !pushResult.themeId) {
        await updateSandboxStatus(newSandbox.id, 'error')
        return NextResponse.json(
          { error: 'Failed to push theme to Shopify as unpublished' },
          { status: 500 }
        )
      }

      // Save theme ID to database
      const themeIdUpdateResult = await updateSandboxThemeId(newSandbox.id, pushResult.themeId)
      if (!themeIdUpdateResult.success) {
        console.warn('⚠️  Failed to save theme ID to database:', themeIdUpdateResult.error)
        // Don't fail the entire request, just log the warning
      } else {
        console.log(`✅ Theme ID saved: ${pushResult.themeId}`)
      }

      await updateSandboxStatus(newSandbox.id, 'theme-pushed')

      // ==========================================
      // STEP 3: SET UP CLAUDE INTEGRATION
      // ==========================================
      await updateSandboxStatus(newSandbox.id, 'setting-up-claude')

      const claudeResult = await setupClaude(userId, newSandbox.id)

      if (!claudeResult.success) {
        await updateSandboxStatus(newSandbox.id, 'error')
        return NextResponse.json(
          { error: 'Failed to set up Claude integration' },
          { status: 500 }
        )
      }

      console.log('✅ Claude integration setup complete')

      // ==========================================
      // STEP 4: ALLOCATE PORTS
      // ==========================================
      console.log('🔌 Allocating ports for development server...')

      const ports = await getPortsForSandbox(newSandbox.id)
      if (!ports) {
        await updateSandboxStatus(newSandbox.id, 'error')
        return NextResponse.json(
          { error: 'Failed to allocate ports - all 300 port slots may be in use' },
          { status: 500 }
        )
      }

      console.log(`✅ Ports allocated: dev=${ports.devPort}, proxy=${ports.proxyPort}`)

      // ==========================================
      // STEP 5: START DEVELOPMENT SERVER
      // ==========================================
      await updateSandboxStatus(newSandbox.id, 'setting-up-dev-server')

      const devResult = await startDevServer(userId, newSandbox.id, storeUrl, apiKey, pushResult.themeId, ports.devPort, ports.proxyPort, storePassword)

      if (!devResult.success) {
        await updateSandboxStatus(newSandbox.id, 'error')
        return NextResponse.json(
          { error: 'Failed to start development server' },
          { status: 500 }
        )
      }

      // ==========================================
      // FINAL: SAVE PREVIEW URL AND MARK AS READY
      // ==========================================
      // PRIORITY: Use public tunnel URL if available, fallback to local proxy URL
      // 1. devResult.publicUrl - Public ngrok URL (works from anywhere)
      // 2. devResult.proxyPort - Local proxy URL (iframe-friendly, localhost only)
      // 3. devResult.assignedPort - Fallback local URL
      const previewUrl = devResult.publicUrl
        ? devResult.publicUrl  // Public ngrok URL (preferred for remote access)
        : devResult.proxyPort
          ? `http://127.0.0.1:${devResult.proxyPort}`  // Local proxy URL
          : `http://127.0.0.1:${devResult.assignedPort || 3000}`  // Fallback

      console.log(`📱 Preview URL: ${previewUrl}`)
      console.log(`   Type: ${devResult.publicUrl ? 'Public (ngrok)' : 'Local (proxy)'}`)

      // Save the preview URL (public or local) to the database
      const urlUpdateResult = await updateSandboxPreviewUrl(newSandbox.id, previewUrl)
      if (!urlUpdateResult.success) {
        console.warn('⚠️  Failed to update preview URL in database:', urlUpdateResult.error)
        // Don't fail the entire request, just log the warning
      }

      // ==========================================
      // STEP 5: CREATE CHAT SESSION AND SAVE PORTS
      // ==========================================
      // Create chat session for this sandbox setup
      let sessionId: string | null = null
      try {
        const sessionResult = await createSession({
          user_id: userId,
          sandbox_id: newSandbox.id
        })

        if (sessionResult.error || !sessionResult.data) {
          console.warn('⚠️  Failed to create chat session:', sessionResult.error)
          // Don't fail the entire request, just log the warning
        } else {
          sessionId = sessionResult.data.id
          console.log(`✅ Chat session created: ${sessionId} for user: ${userId}`)
        }
      } catch (error) {
        console.warn('⚠️  Failed to create chat session:', error)
        // Don't fail the entire request, just log the warning
      }

      // Ports already saved by getPortsForSandbox() - no need to save again

      await updateSandboxStatus(newSandbox.id, 'ready')

      return NextResponse.json({
        success: true,
        previewUrl: previewUrl,  // Primary URL (public or local)
        publicUrl: devResult.publicUrl || null,  // Public ngrok URL (if available)
        localUrl: devResult.proxyPort ? `http://127.0.0.1:${devResult.proxyPort}` : null,  // Local proxy URL
        sessionId: sessionId
      })
    } else {
      // ==========================================
      // EXISTING SANDBOX: RETURN ERROR
      // ==========================================
      return NextResponse.json(
        {
          success: false,
          error: 'Sandbox already exists',
          previewUrl: existingSandbox.preview_url || null
        },
        { status: 409 }
      )
    }

  } catch (error: unknown) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}