import { NextRequest, NextResponse } from 'next/server'
import { findUserSandbox, createUserSandbox, updateSandboxStatus } from '@/services/userSandboxService'
import { createThemeFolder, pullTheme } from '@/services/themeService'

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

      // Update status to 'creating'
      await updateSandboxStatus(newSandbox.id, 'creating')

      // Step 1: Create theme folder for NEW sandboxes
      const folderResult = await createThemeFolder(userId, newSandbox.id)

      if (!folderResult.success) {
        // Update status to 'error' if folder creation fails
        await updateSandboxStatus(newSandbox.id, 'error')
        return NextResponse.json(
          {
            error: 'Failed to create theme directory',
            details: folderResult.error
          },
          { status: 500 }
        )
      }

      // Update status to 'folder_created'
      await updateSandboxStatus(newSandbox.id, 'folder_created')

      // Update status to 'pulling_theme'
      await updateSandboxStatus(newSandbox.id, 'pulling_theme')

      // Step 2: Pull theme from Shopify
      const pullResult = await pullTheme(userId, newSandbox.id, storeUrl, apiKey)

      if (!pullResult.success) {
        // Update status to 'error' if theme pull fails
        await updateSandboxStatus(newSandbox.id, 'error')
        return NextResponse.json(
          {
            error: 'Failed to pull theme from Shopify',
            details: pullResult.error,
            folderCreated: true // Folder was created successfully
          },
          { status: 500 }
        )
      }

      // Update status to 'ready' after successful completion
      await updateSandboxStatus(newSandbox.id, 'ready')

      return NextResponse.json({
        success: true,
        message: `New sandbox created! Theme directory created and Shopify theme pulled for user ${userId} with store ${storeUrl}`,
        userId,
        storeUrl,
        sandboxId: newSandbox.id,
        isNew: true,
        sandbox: newSandbox,
        status: 'ready',
        folderOutput: folderResult.output,
        pullOutput: pullResult.output
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