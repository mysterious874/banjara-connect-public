import { supabase } from './supabase'

export async function requireAuthenticatedUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Sign in to perform this action.')
  return data.user.id
}