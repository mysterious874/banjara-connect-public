import { useCallback, useEffect, useState } from 'react'
import { Phone, Video, PhoneOff, Check, X, Users } from 'lucide-react'
import { useAuth } from '../../hooks/AuthProvider'
import { supabase } from '../../utils/supabase'

type CallType = 'voice' | 'video'
type CallSession = {
  id: string
  caller_id: string
  recipient_id: string | null
  group_id: string | null
  call_type: CallType
  status: 'ringing' | 'active' | 'rejected' | 'ended' | 'missed'
  created_at: string
}

type Props = {
  recipientId?: string
  groupId?: string
  peerName: string
  compact?: boolean
}

export function CallInviteControls({ recipientId, groupId, peerName, compact = false }: Props) {
  const { session } = useAuth()
  const userId = session?.user.id
  const [incoming, setIncoming] = useState<CallSession | null>(null)
  const [outgoing, setOutgoing] = useState<CallSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const isGroup = Boolean(groupId)

  const refreshCalls = useCallback(async () => {
    if (!userId) return
    let incomingQuery = supabase.from('call_sessions').select('id,caller_id,recipient_id,group_id,call_type,status,created_at').eq('status', 'ringing').neq('caller_id', userId).order('created_at', { ascending: false }).limit(1)
    incomingQuery = groupId
      ? incomingQuery.eq('group_id', groupId)
      : incomingQuery.eq('recipient_id', userId).is('group_id', null)
    let outgoingQuery = supabase.from('call_sessions').select('id,caller_id,recipient_id,group_id,call_type,status,created_at').eq('caller_id', userId).in('status', ['ringing', 'active']).order('created_at', { ascending: false }).limit(1)
    outgoingQuery = groupId ? outgoingQuery.eq('group_id', groupId) : outgoingQuery.eq('recipient_id', recipientId || '').is('group_id', null)
    const [{ data: incomingRows }, { data: outgoingRows }] = await Promise.all([incomingQuery, outgoingQuery])
    setIncoming((incomingRows?.[0] as CallSession | undefined) ?? null)
    setOutgoing((outgoingRows?.[0] as CallSession | undefined) ?? null)
  }, [userId, recipientId, groupId])

  useEffect(() => {
    if (!userId) return
    void refreshCalls()
    const channel = supabase.channel(`call-invites:${userId}:${groupId || recipientId || 'personal'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_sessions' }, () => { void refreshCalls() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [userId, recipientId, groupId, refreshCalls])

  const startCall = async (callType: CallType) => {
    if (!userId || busy) return
    setBusy(true)
    setNotice('')
    try {
      const { data, error } = await supabase.from('call_sessions').insert({
        caller_id: userId,
        recipient_id: recipientId ?? null,
        group_id: groupId ?? null,
        call_type: callType,
        status: 'ringing',
      }).select('id,caller_id,recipient_id,group_id,call_type,status,created_at').single()
      if (error) throw error
      setOutgoing(data as CallSession)
      setNotice(`${callType === 'voice' ? 'Voice' : 'Video'} call invitation sent.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start the call.'
      setNotice(message.includes('call_sessions') || message.includes('schema cache')
        ? 'Calling setup is not active on the server yet.'
        : 'Could not start the call. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const updateStatus = async (call: CallSession, status: 'active' | 'rejected' | 'ended') => {
    if (!userId || busy) return
    setBusy(true)
    setNotice('')
    try {
      const { error } = await supabase.from('call_sessions').update({
        status,
        ...(status === 'active' ? { answered_at: new Date().toISOString() } : { ended_at: new Date().toISOString() }),
      }).eq('id', call.id)
      if (error) throw error
      await refreshCalls()
      if (status === 'active') setNotice('Call accepted. Media calling setup is the next step.')
    } catch {
      setNotice('Could not update this call. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const closeNotice = () => setNotice('')
  const activeCall = outgoing?.status === 'active' ? outgoing : null
  const ringingOutgoing = outgoing?.status === 'ringing' ? outgoing : null

  return <>
    <div className={compact ? 'call-invite-controls call-invite-controls--compact' : 'call-invite-controls'}>
      <button type="button" className="chat-screen__action" aria-label={isGroup ? 'Start group voice call' : 'Voice call'} title={isGroup ? 'Group voice call' : 'Voice call'} onClick={() => void startCall('voice')} disabled={busy}><Phone size={18} /></button>
      <button type="button" className="chat-screen__action" aria-label={isGroup ? 'Start group video call' : 'Video call'} title={isGroup ? 'Group video call' : 'Video call'} onClick={() => void startCall('video')} disabled={busy}><Video size={19} /></button>
    </div>
    {(incoming || ringingOutgoing || activeCall || notice) && <div className="call-invite-backdrop" role="presentation">
      <section className="call-invite-dialog" role="dialog" aria-modal="true" aria-label="Call controls">
        <span className="call-invite-dialog__icon">{isGroup ? <Users size={25} /> : incoming?.call_type === 'video' || outgoing?.call_type === 'video' ? <Video size={25} /> : <Phone size={25} />}</span>
        <h2>{incoming ? `${peerName} is calling` : activeCall ? 'Call accepted' : ringingOutgoing ? 'Calling…' : 'Calling setup'}</h2>
        <p>{incoming ? `Incoming ${incoming.call_type} call${isGroup ? ' for this community' : ''}.` : activeCall ? 'The invitation was accepted. Audio/video transport is not connected yet.' : ringingOutgoing ? `Waiting for ${isGroup ? 'community members' : peerName} to answer.` : notice}</p>
        {incoming && <div className="call-invite-dialog__actions">
          <button type="button" className="call-invite-button call-invite-button--accept" disabled={busy} onClick={() => void updateStatus(incoming, 'active')}><Check size={17} /> Accept</button>
          <button type="button" className="call-invite-button call-invite-button--decline" disabled={busy} onClick={() => void updateStatus(incoming, 'rejected')}><PhoneOff size={17} /> Decline</button>
        </div>}
        {(ringingOutgoing || activeCall) && <div className="call-invite-dialog__actions"><button type="button" className="call-invite-button call-invite-button--decline" disabled={busy} onClick={() => void updateStatus((activeCall || ringingOutgoing)!, 'ended')}><PhoneOff size={17} /> End call</button></div>}
        {notice && !incoming && !ringingOutgoing && !activeCall && <button type="button" className="call-invite-button" onClick={closeNotice}><X size={16} /> Close</button>}
      </section>
    </div>}
  </>
}
