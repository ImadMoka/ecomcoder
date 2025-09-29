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
  conversation_id?: string
}

/**
 * Creates a new chat session for a user and sandbox
 * @param sessionData - The session data containing user_id and sandbox_id
 * @returns Promise with session data and error information
 */
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
      console.error('Error creating session:', error)
      return { data: null, error: 'Failed to create chat session' }
    }

    console.log(`✅ Chat session created: ${data.id} for user: ${sessionData.user_id}, sandbox: ${sessionData.sandbox_id}`)
    return { data, error: null }
  } catch (err) {
    console.error('Unexpected error in createSession:', err)
    return { data: null, error: 'Unexpected database error while creating session' }
  }
}

/**
 * Updates the status of an existing session
 * @param sessionId - The ID of the session to update
 * @param status - The new status for the session
 * @returns Promise with success status and error information
 */
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
      console.error('Error updating session status:', error)
      return { success: false, error: 'Failed to update session status' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Unexpected error in updateSessionStatus:', err)
    return { success: false, error: 'Unexpected database error' }
  }
}