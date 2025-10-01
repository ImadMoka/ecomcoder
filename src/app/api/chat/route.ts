import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { join } from 'path'
import { exec } from 'child_process'
import { getThemePathFromSession } from '@/services/sessionService'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, message } = body

    // Validate required fields
    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      )
    }

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 }
      )
    }

    // Get session details
    const { data: session, error: sessionError } = await supabase
      .from('agent_sessions')
      .select('id, user_id, sandbox_id, claude_session_id, status')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // Get theme path
    const { themePath, error: themePathError } = await getThemePathFromSession(sessionId)

    if (themePathError || !themePath) {
      return NextResponse.json(
        { error: themePathError || 'Could not determine theme path' },
        { status: 404 }
      )
    }

    // Get the actual theme directory
    const themeDir = join(process.cwd(), themePath)
    const claudeAssistantPath = join(themeDir, 'claude-assistant.ts')

    console.log(`🎨 Running Claude assistant in: ${themePath}`)

    let fullResponse = ''

    try {
      // Execute the template directly
      const result = await new Promise<{
        success: boolean
        response: string
        error?: string
      }>((resolve, reject) => {
        const userPrompt = message.trim()
        const convId = session.claude_session_id || ''
        const command = `tsx "${claudeAssistantPath}" "${userPrompt}" "${convId}" "${sessionId}"`

        const execOptions = {
          cwd: themeDir,
          timeout: 300000, // 5 minutes timeout
          maxBuffer: 1024 * 1024 * 10 // 10MB buffer
        }

        exec(command, execOptions, (error, stdout) => {
          if (error) {
            reject(new Error(`Claude assistant failed: ${error.message}`))
            return
          }

          // Extract JSON result from stdout
          const resultMatch = stdout.match(/__CLAUDE_RESULT_START__[\s\S]*?\n([\s\S]*?)\n__CLAUDE_RESULT_END__/)
          if (resultMatch) {
            try {
              const result = JSON.parse(resultMatch[1])
              resolve(result)
              return
            } catch (parseError) {
              console.error('Failed to parse result:', parseError)
            }
          }

          resolve({
            success: true,
            response: stdout || 'Task completed'
          })
        })
      })

      fullResponse = result.response

    } catch (processError: unknown) {
      const errorMessage = processError instanceof Error ? processError.message : 'Unknown error';
      return NextResponse.json(
        { error: `Claude assistant failed: ${errorMessage}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: fullResponse || 'Claude assistant completed the task.',
      themePath
    })

  } catch (error: unknown) {
    console.error('Chat API Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}