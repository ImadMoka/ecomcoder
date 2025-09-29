import { NextRequest, NextResponse } from 'next/server'
import { findUserSandbox, createUserSandbox, updateSandboxStatus } from '@/services/userSandboxService'
import { createThemeFolder, pullTheme, startDevServer } from '@/services/themeService'

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

      // Set initial status
      await updateSandboxStatus(newSandbox.id, 'creating')

      // ==========================================
      // STEP 1: CREATE THEME FOLDER STRUCTURE
      // ==========================================
      const folderResult = await createThemeFolder(userId, newSandbox.id)

      if (!folderResult.success) {
        await updateSandboxStatus(newSandbox.id, 'error')
        return NextResponse.json(
          {
            error: 'Failed to create theme directory',
            details: folderResult.error
          },
          { status: 500 }
        )
      }

      await updateSandboxStatus(newSandbox.id, 'folder_created')

      // ==========================================
      // STEP 2: PULL THEME FROM SHOPIFY STORE
      // ==========================================
      await updateSandboxStatus(newSandbox.id, 'pulling_theme')

      const pullResult = await pullTheme(userId, newSandbox.id, storeUrl, apiKey)

      if (!pullResult.success) {
        await updateSandboxStatus(newSandbox.id, 'error')
        return NextResponse.json(
          {
            error: 'Failed to pull theme from Shopify',
            details: pullResult.error,
            folderCreated: true
          },
          { status: 500 }
        )
      }

      // ==========================================
      // STEP 3: START DEVELOPMENT SERVER
      // ==========================================
      await updateSandboxStatus(newSandbox.id, 'starting_dev')

      const devResult = await startDevServer(userId, newSandbox.id, storeUrl, apiKey, storePassword)

      if (!devResult.success) {
        await updateSandboxStatus(newSandbox.id, 'error')
        return NextResponse.json(
          {
            error: 'Failed to start development server',
            details: devResult.error,
            folderCreated: true,
            themesPulled: true
          },
          { status: 500 }
        )
      }

      // ==========================================
      // FINAL: MARK AS READY
      // ==========================================
      await updateSandboxStatus(newSandbox.id, 'ready')

      return NextResponse.json({
        success: true,
        message: `Complete! Theme created, pulled, and development server started for user ${userId} with store ${storeUrl}`,
        userId,
        storeUrl,
        sandboxId: newSandbox.id,
        isNew: true,
        sandbox: newSandbox,
        status: 'ready',
        devServerUrl: `http://127.0.0.1:3000`,
        folderOutput: folderResult.output,
        pullOutput: pullResult.output,
        devOutput: devResult.output
      })
    } else {
      // Sandbox already exists, no need to create folder again
      return NextResponse.json({
        success: true,
        message: `Sandbox already exists for user ${userId} with Shopify URL ${storeUrl}`,
        userId,
        storeUrl,
        isNew: false,
        existingRecord: existingSandbox
      })
    }

  } catch (error: unknown) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}