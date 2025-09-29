import { NextRequest, NextResponse } from 'next/server'
import { findUserSandbox, createUserSandbox } from '@/services/userSandboxService'
import { createThemeFolder } from '@/services/themeService'

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

      if (createError) {
        return NextResponse.json(
          { error: createError },
          { status: 500 }
        )
      }

      // Only execute build.sh script for NEW sandboxes
      const themeResult = await createThemeFolder(userId, newSandbox.id)

      if (!themeResult.success) {
        return NextResponse.json(
          {
            error: 'Failed to create theme directory',
            details: themeResult.error
          },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: `New sandbox created! Theme directory created for user ${userId} with Shopify URL ${storeUrl}`,
        userId,
        storeUrl,
        sandboxId: newSandbox.id,
        isNew: true,
        sandbox: newSandbox,
        output: themeResult.output
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