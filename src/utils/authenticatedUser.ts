import { supabase } from './supabase'

export async function requireAuthenticatedUserId() {
  // This helper only needs the current browser session's user id. getSession()
  // avoids an extra Auth network request on every data operation; RLS remains
  // the authorization boundary for all database reads/writes.
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session?.user) throw new Error('Sign in to perform this action.')
  return data.session.user.id
}