import { NextRequest, NextResponse } from 'next/server'
import { findUserSandbox, createUserSandbox, updateSandboxStatus, updateSandboxPreviewUrl } from '@/services/userSandboxService'
import { createThemeFolder, pullTheme, startDevServer } from '@/services/themeService'
import { createSession } from '@/services/sessionService'

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
      // STEP 3: START DEVELOPMENT SERVER
      // ==========================================
      await updateSandboxStatus(newSandbox.id, 'setting-up-dev-server')

      const devResult = await startDevServer(userId, newSandbox.id, storeUrl, apiKey, storePassword, 'auto')

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
      // Use the proxy port (iframe-friendly URL) as the preview URL
      const previewUrl = devResult.proxyPort
        ? `http://127.0.0.1:${devResult.proxyPort}`
        : `http://127.0.0.1:${devResult.assignedPort || 3000}`


      // Save the iframe-friendly preview URL to the database
      const urlUpdateResult = await updateSandboxPreviewUrl(newSandbox.id, previewUrl)
      if (!urlUpdateResult.success) {
        console.warn('⚠️  Failed to update preview URL in database:', urlUpdateResult.error)
        // Don't fail the entire request, just log the warning
      }

      // ==========================================
      // STEP 4: CREATE CHAT SESSION
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

      await updateSandboxStatus(newSandbox.id, 'ready')

      return NextResponse.json({
        success: true,
        previewUrl: previewUrl,
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