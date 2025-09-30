import { supabase } from '../lib/supabase'

export interface SessionData {
  user_id: string
  sandbox_id: string
}

export interface Session {
  id: string
  user_id: string
  sandbox_id: string
  status?: string
  created_at?: string
  completed_at?: string
  claude_session_id?: string
}

export async function createSession(
  sessionData: SessionData
): Promise<{ data: Session | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('agent_sessions')
      .insert({
        user_id: sessionData.user_id,
        sandbox_id: sessionData.sandbox_id,
        status: 'active'
      })
      .select('id, user_id, sandbox_id, status, created_at')
      .single()

    if (error) {
      return { data: null, error: 'Failed to create session' }
    }

    return { data, error: null }
  } catch (err) {
    return { data: null, error: 'Database error' }
  }
}

export async function updateSessionStatus(
  sessionId: string,
  status: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('agent_sessions')
      .update({
        status: status,
        completed_at: status === 'completed' ? new Date().toISOString() : null
      })
      .eq('id', sessionId)

    if (error) {
      return { success: false, error: 'Failed to update status' }
    }

    return { success: true, error: null }
  } catch (err) {
    return { success: false, error: 'Database error' }
  }
}

export async function updateClaudeSessionId(
  sessionId: string,
  claudeSessionId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('agent_sessions')
      .update({
        claude_session_id: claudeSessionId
      })
      .eq('id', sessionId)

    if (error) {
      return { success: false, error: 'Failed to update Claude session' }
    }

    return { success: true, error: null }
  } catch (err) {
    return { success: false, error: 'Database error' }
  }
}

export async function getThemePathFromSession(
  sessionId: string
): Promise<{ themePath: string | null; error: string | null }> {
  try {
    const { data: session, error: sessionError } = await supabase
      .from('agent_sessions')
      .select('sandbox_id')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return { themePath: null, error: 'Session not found' }
    }

    const { data: sandbox, error: sandboxError } = await supabase
      .from('user_sandboxes')
      .select('user_id')
      .eq('id', session.sandbox_id)
      .single()

    if (sandboxError || !sandbox) {
      return { themePath: null, error: 'Sandbox not found' }
    }

    const themePath = `/themes/user_${sandbox.user_id}/theme_${session.sandbox_id}`

    return { themePath, error: null }
  } catch (err) {
    return { themePath: null, error: 'Database error' }
  }
}

export async function createAgentActivity(
  sessionId: string,
  activityType: string,
  message: string,
  path?: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('agent_activities')
      .insert({
        session_id: sessionId,
        activity_type: activityType,
        message: message,
        path: path || null
      })

    if (error) {
      return { success: false, error: 'Failed to create activity' }
    }

    return { success: true, error: null }
  } catch (err) {
    return { success: false, error: 'Database error' }
  }
}