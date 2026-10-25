import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Phone, PhoneOff, Users, Video, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/AuthProvider'
import { supabase } from '../../utils/supabase'

type IncomingCall = {
  id: string
  caller_id: string
  recipient_id: string | null
  group_id: string | null
  call_type: 'voice' | 'video'
  status: 'ringing' | 'active' | 'rejected' | 'ended' | 'missed'
  created_at: string
  callerName: string
  groupName: string
}

export function AppWideIncomingCall() {
  const { session } = useAuth()
  const userId = session?.user.id
  const navigate = useNavigate()
  const [call, setCall] = useState<IncomingCall | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    if (!userId) { setCall(null); return }
    try {
      const recentCallCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const [{ data: directRows }, { data: memberships }] = await Promise.all([
        supabase.from('call_sessions')
          .select('id,caller_id,recipient_id,group_id,call_type,status,created_at')
          .eq('recipient_id', userId).eq('status', 'ringing').gte('created_at', recentCallCutoff)
          .neq('caller_id', userId).is('group_id', null)
          .order('created_at', { ascending: false }).limit(1),
        supabase.from('community_group_members').select('group_id').eq('user_id', userId),
      ])
      const groupIds = [...new Set((memberships ?? []).map(row => row.group_id).filter(Boolean))]
      let groupRows: Array<Omit<IncomingCall, 'callerName' | 'groupName'>> = []
      if (groupIds.length) {
        const { data } = await supabase.from('call_sessions')
          .select('id,caller_id,recipient_id,group_id,call_type,status,created_at')
          .in('group_id', groupIds).in('status', ['ringing', 'active']).gte('created_at', recentCallCutoff)
          .neq('caller_id', userId).order('created_at', { ascending: false }).limit(1)
        groupRows = (data ?? []) as typeof groupRows
      }
      const rows = [...(directRows ?? []), ...groupRows] as Array<Omit<IncomingCall, 'callerName' | 'groupName'>>
      const latest = rows.sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      if (!latest) { setCall(null); return }
      const [{ data: profile }, { data: group }] = await Promise.all([
        supabase.from('profiles').select('display_name,username').eq('id', latest.caller_id).maybeSingle(),
        latest.group_id
          ? supabase.from('community_groups').select('name').eq('id', latest.group_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      setCall({
        ...latest,
        callerName: profile?.display_name || profile?.username || 'Banjara member',
        groupName: group?.name || 'Community',
      })
    } catch {
      // Realtime will retry on the next update; never block the rest of the app.
    }
  }, [userId])

  useEffect(() => {
    if (!userId) { setCall(null); return }
    void refresh()
    const channel = supabase.channel(`app-wide-call-invites:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_sessions' }, () => { void refresh() })
      .subscribe()
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [userId, refresh])

  const respond = async (accept: boolean) => {
    if (!call || !userId || busy) return
    setBusy(true)
    setNotice('')
    try {
      // A live community call is a join invitation, not a new answer to the call.
      if (!(accept && call.group_id && call.status === 'active')) {
        const { error } = await supabase.from('call_sessions')
          .update({
            status: accept ? 'active' : 'rejected',
            ...(accept ? { answered_at: new Date().toISOString() } : { ended_at: new Date().toISOString() }),
          }).eq('id', call.id).eq('status', 'ringing')
        if (error) throw error
      }
      setCall(null)
      if (accept) {
        if (call.group_id) {
          navigate(`/community/groups/${call.group_id}`)
        } else {
          // Chat routes use the conversation UUID, not a user UUID.
          const [{ data: callerMemberships }, { data: myMemberships }] = await Promise.all([
            supabase.from('conversation_members').select('conversation_id').eq('user_id', call.caller_id),
            supabase.from('conversation_members').select('conversation_id').eq('user_id', userId),
          ])
          const myIds = new Set((myMemberships ?? []).map(row => row.conversation_id))
          const conversationId = (callerMemberships ?? []).find(row => myIds.has(row.conversation_id))?.conversation_id
          navigate(conversationId ? `/chat/${conversationId}` : '/chat')
        }
      }
      void refresh()
    } catch {
      setNotice('Could not update this call. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!call) return null
  const groupCall = Boolean(call.group_id)
  return createPortal(<div className="call-invite-backdrop call-invite-backdrop--app-wide call-invite-backdrop--fullscreen" role="presentation">
    <section className="call-invite-dialog call-invite-dialog--app-wide call-invite-dialog--fullscreen" role="dialog" aria-modal="true" aria-label="Incoming call">
      <span className="call-invite-dialog__icon">{groupCall ? <Users size={25} /> : call.call_type === 'video' ? <Video size={25} /> : <Phone size={25} />}</span>
      <h2>{groupCall ? `${call.groupName} call` : `${call.callerName} is calling`}</h2>
      <p>{groupCall && call.status === 'active' ? 'Community call is live. Join now?' : `Incoming ${call.call_type} call${groupCall ? ` from ${call.callerName} in the community` : ''}.`}</p>
      {notice && <p role="alert">{notice}</p>}
      <div className="call-invite-dialog__actions">
        <button type="button" className="call-invite-button call-invite-button--accept" disabled={busy} onClick={() => void respond(true)}><Check size={17} /> {groupCall && call.status === 'active' ? 'Join call' : 'Accept'}</button>
        <button type="button" className="call-invite-button call-invite-button--decline" disabled={busy} onClick={() => void respond(false)}><PhoneOff size={17} /> Decline</button>
      </div>
      <button type="button" className="call-invite-dialog__close" aria-label="Dismiss incoming call" disabled={busy} onClick={() => { setCall(null); setNotice('') }}><X size={17} /></button>
    </section>
  </div>, document.body)
}
