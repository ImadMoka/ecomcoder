import { supabase } from '@/lib/supabase'

export interface UserSandboxData {
  user_id: string
  shopify_url: string
  shopify_theme_password: string
  shopify_store_password?: string
  status?: null
  shopify_template_id?: null
}

export interface UserSandbox {
  id: string
  user_id: string
  shopify_url: string
  shopify_theme_password: string
  shopify_store_password?: string
  sandbox_id?: string
  shopify_template_id?: string
  status?: string
  created_at?: string
  last_used?: string
  preview_url?: string
}

export async function findUserSandbox(
  userId: string,
  shopifyUrl: string
): Promise<{ data: UserSandbox | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('user_sandboxes')
      .select('id, user_id, shopify_url')
      .eq('user_id', userId)
      .eq('shopify_url', shopifyUrl)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is expected if sandbox doesn't exist
      console.error('Error fetching user sandbox:', error)
      return { data: null, error: 'Database error while checking user sandbox' }
    }

    return { data: data || null, error: null }
  } catch (err) {
    console.error('Unexpected error in findUserSandbox:', err)
    return { data: null, error: 'Unexpected database error' }
  }
}

export async function createUserSandbox(
  sandboxData: UserSandboxData
): Promise<{ data: UserSandbox | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('user_sandboxes')
      .insert([sandboxData])
      .select()
      .single()

    if (error) {
      console.error('Error creating user sandbox:', error)
      return { data: null, error: 'Failed to create user sandbox record' }
    }

    return { data, error: null }
  } catch (err) {
    console.error('Unexpected error in createUserSandbox:', err)
    return { data: null, error: 'Unexpected database error' }
  }
}

export async function updateSandboxStatus(
  sandboxId: string,
  status: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('user_sandboxes')
      .update({
        status: status,
        last_used: new Date().toISOString()
      })
      .eq('id', sandboxId)

    if (error) {
      console.error('Error updating sandbox status:', error)
      return { success: false, error: 'Failed to update sandbox status' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Unexpected error in updateSandboxStatus:', err)
    return { success: false, error: 'Unexpected database error' }
  }
}