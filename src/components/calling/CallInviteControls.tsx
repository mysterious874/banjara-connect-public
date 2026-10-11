import { useCallback, useEffect, useRef, useState } from 'react'
import { Phone, Video, PhoneOff, Check, X, Users, Mic, MicOff, Camera, CameraOff } from 'lucide-react'
import { useAuth } from '../../hooks/AuthProvider'
import { supabase } from '../../utils/supabase'

type CallType = 'voice' | 'video'
type CallStatus = 'ringing' | 'active' | 'rejected' | 'ended' | 'missed'
type CallSession = {
  id: string
  caller_id: string
  recipient_id: string | null
  group_id: string | null
  call_type: CallType
  status: CallStatus
  created_at: string
}
type Signal = {
  from: string
  to: string
  kind: 'join' | 'offer' | 'answer' | 'candidate'
  description?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}
type Props = { recipientId?: string; groupId?: string; peerName: string; compact?: boolean; hideIncomingPrompt?: boolean }
const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

export function CallInviteControls({ recipientId, groupId, peerName, compact = false, hideIncomingPrompt = false }: Props) {
  const { session } = useAuth()
  const userId = session?.user.id
  const [incoming, setIncoming] = useState<CallSession | null>(null)
  const [outgoing, setOutgoing] = useState<CallSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({})
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [joinedGroupCallId, setJoinedGroupCallId] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const isGroup = Boolean(groupId)
  const activeCall = outgoing?.status === 'active' ? outgoing : incoming?.status === 'active' && (!incoming.group_id || joinedGroupCallId === incoming.id) ? incoming : null
  const ringingOutgoing = outgoing?.status === 'ringing' ? outgoing : null

  const refreshCalls = useCallback(async () => {
    if (!userId) return
    let incomingQuery = supabase.from('call_sessions').select('id,caller_id,recipient_id,group_id,call_type,status,created_at').in('status', ['ringing', 'active']).neq('caller_id', userId).order('created_at', { ascending: false }).limit(1)
    incomingQuery = groupId ? incomingQuery.eq('group_id', groupId) : incomingQuery.eq('recipient_id', userId).is('group_id', null)
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
    if (incoming || outgoing) { setNotice('Finish your current call before starting another one.'); return }
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      setNotice('Voice/video calling is not supported by this browser. Try the latest version of Chrome, Safari, or Edge.')
      return
    }
    setBusy(true); setNotice('')
    try {
      const { data, error } = await supabase.from('call_sessions').insert({
        caller_id: userId, recipient_id: recipientId ?? null, group_id: groupId ?? null,
        call_type: callType, status: 'ringing',
      }).select('id,caller_id,recipient_id,group_id,call_type,status,created_at').single()
      if (error) throw error
      setOutgoing(data as CallSession)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      setNotice(message.includes('call_sessions') || message.includes('schema cache')
        ? 'Calling setup is not active on the server yet.'
        : 'Could not start the call. Check the connection and try again.')
    } finally { setBusy(false) }
  }

  const updateStatus = async (call: CallSession, status: 'active' | 'rejected' | 'ended') => {
    if (!userId || busy) return
    setBusy(true); setNotice('')
    try {
      const { error } = await supabase.from('call_sessions').update({
        status, ...(status === 'active' ? { answered_at: new Date().toISOString() } : { ended_at: new Date().toISOString() }),
      }).eq('id', call.id)
      if (error) throw error
      await refreshCalls()
    } catch { setNotice('Could not update this call. Please try again.') }
    finally { setBusy(false) }
  }

  // Native WebRTC media path. Private Supabase Realtime broadcasts carry only SDP/ICE
  // for participants authorized by the call_sessions RLS policies.
  useEffect(() => {
    if (!activeCall || !userId) return
    let disposed = false
    let mediaChannel: ReturnType<typeof supabase.channel> | null = null
    const sendSignal = async (signal: Signal) => {
      if (disposed || !mediaChannel) return
      await mediaChannel.send({ type: 'broadcast', event: 'signal', payload: signal })
    }
    const createPeer = (remoteId: string, stream: MediaStream) => {
      const existing = peersRef.current.get(remoteId)
      if (existing) return existing
      const pc = new RTCPeerConnection(rtcConfig)
      stream.getTracks().forEach(track => pc.addTrack(track, stream))
      pc.ontrack = event => {
        const remote = event.streams[0]
        if (remote) setRemoteStreams(previous => ({ ...previous, [remoteId]: remote }))
      }
      pc.onicecandidate = event => {
        if (event.candidate) void sendSignal({ from: userId, to: remoteId, kind: 'candidate', candidate: event.candidate.toJSON() })
      }
      pc.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
          setRemoteStreams(previous => { const next = { ...previous }; delete next[remoteId]; return next })
        }
      }
      peersRef.current.set(remoteId, pc)
      return pc
    }
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: activeCall.call_type === 'video',
        })
        if (disposed) { stream.getTracks().forEach(track => track.stop()); return }
        localStreamRef.current = stream
        setLocalStream(stream)
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser || disposed) return
        mediaChannel = supabase.channel(`call:${activeCall.id}`, { config: { private: true, broadcast: { self: false } } })
        channelRef.current = mediaChannel
        mediaChannel.on('broadcast', { event: 'signal' }, async ({ payload }) => {
          const signal = payload as Signal
          if (!signal || signal.to !== userId || signal.from === userId) return
          const pc = createPeer(signal.from, stream)
          try {
            if (signal.kind === 'join') {
              // Direct calls have a single offerer: the original caller.
              // Group mesh calls elect one offerer per peer pair by user ID.
              const shouldOffer = activeCall.group_id
                ? userId.localeCompare(signal.from) < 0
                : activeCall.caller_id === userId
              if (shouldOffer && !pc.localDescription) {
                const offer = await pc.createOffer()
                await pc.setLocalDescription(offer)
                await sendSignal({ from: userId, to: signal.from, kind: 'offer', description: offer })
              }
            } else if (signal.kind === 'offer' && signal.description) {
              await pc.setRemoteDescription(signal.description)
              const pending = pendingCandidatesRef.current.get(signal.from) ?? []
              for (const candidate of pending) await pc.addIceCandidate(candidate)
              pendingCandidatesRef.current.delete(signal.from)
              const answer = await pc.createAnswer()
              await pc.setLocalDescription(answer)
              await sendSignal({ from: userId, to: signal.from, kind: 'answer', description: answer })
            } else if (signal.kind === 'answer' && signal.description) {
              await pc.setRemoteDescription(signal.description)
              const pending = pendingCandidatesRef.current.get(signal.from) ?? []
              for (const candidate of pending) await pc.addIceCandidate(candidate)
              pendingCandidatesRef.current.delete(signal.from)
            } else if (signal.kind === 'candidate' && signal.candidate) {
              if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate)
              else pendingCandidatesRef.current.set(signal.from, [...(pendingCandidatesRef.current.get(signal.from) ?? []), signal.candidate])
            }
          } catch (error) {
            if (import.meta.env.DEV) console.warn('Call signaling event failed.', error)
          }
        })
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error('Call signaling connection timed out.')), 10000)
          mediaChannel!.subscribe(status => {
            if (status === 'SUBSCRIBED') { window.clearTimeout(timeout); resolve() }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { window.clearTimeout(timeout); reject(new Error('Could not connect call signaling.')) }
          })
        })
        if (activeCall.group_id) {
          const { data: members, error } = await supabase.from('community_group_members').select('user_id').eq('group_id', activeCall.group_id)
          if (error) throw error
          const ids = [...new Set((members ?? []).map(member => member.user_id).filter(id => id !== userId))]
          for (const remoteId of ids) {
            createPeer(remoteId, stream)
            await sendSignal({ from: userId, to: remoteId, kind: 'join' })
          }
        } else {
          const remoteId = activeCall.caller_id === userId ? activeCall.recipient_id : activeCall.caller_id
          if (remoteId) {
            createPeer(remoteId, stream)
            await sendSignal({ from: userId, to: remoteId, kind: 'join' })
            if (activeCall.caller_id === userId) {
              const pc = peersRef.current.get(remoteId)!
              const offer = await pc.createOffer()
              await pc.setLocalDescription(offer)
              await sendSignal({ from: userId, to: remoteId, kind: 'offer', description: offer })
            }
          }
        }
      } catch (error) {
        if (!disposed) setNotice(error instanceof Error && error.name === 'NotAllowedError'
          ? 'Microphone/camera permission was denied. Allow access and retry the call.'
          : 'Could not connect audio/video. Check browser permissions and network, then try again.')
      }
    }
    void start()
    return () => {
      disposed = true
      if (channelRef.current === mediaChannel) channelRef.current = null
      if (mediaChannel) void supabase.removeChannel(mediaChannel)
      peersRef.current.forEach(pc => { pc.ontrack = null; pc.onicecandidate = null; pc.close() })
      peersRef.current.clear()
      localStreamRef.current?.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
      setLocalStream(null)
      setRemoteStreams({})
      pendingCandidatesRef.current.clear()
    }
  }, [activeCall?.id, activeCall?.status, activeCall?.call_type, activeCall?.group_id, userId])

  const toggleMute = () => {
    const next = !muted
    localStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next })
    setMuted(next)
  }
  const toggleCamera = () => {
    const next = !cameraOff
    localStreamRef.current?.getVideoTracks().forEach(track => { track.enabled = !next })
    setCameraOff(next)
  }
  const dismissNotice = () => setNotice('')
  const endOrLeaveCall = async () => {
    if (!activeCall) return
    if (activeCall.group_id && activeCall.caller_id !== userId) {
      setJoinedGroupCallId(null)
      return
    }
    await updateStatus(activeCall, 'ended')
  }

  return <>
    <div className={compact ? 'call-invite-controls call-invite-controls--compact' : 'call-invite-controls'}>
      <button type="button" className="chat-screen__action" aria-label={isGroup ? 'Start group voice call' : 'Voice call'} title={isGroup ? 'Group voice call' : 'Voice call'} onClick={() => void startCall('voice')} disabled={busy || Boolean(incoming || outgoing)}><Phone size={18} /></button>
      <button type="button" className="chat-screen__action" aria-label={isGroup ? 'Start group video call' : 'Video call'} title={isGroup ? 'Group video call' : 'Video call'} onClick={() => void startCall('video')} disabled={busy || Boolean(incoming || outgoing)}><Video size={19} /></button>
    </div>
    {((incoming && (!hideIncomingPrompt || incoming.status !== 'ringing')) || ringingOutgoing || activeCall || notice) && <div className="call-invite-backdrop" role="presentation">
      <section className="call-invite-dialog call-invite-dialog--media" role="dialog" aria-modal="true" aria-label="Call controls">
        <span className="call-invite-dialog__icon">{isGroup ? <Users size={25} /> : (activeCall?.call_type ?? incoming?.call_type ?? outgoing?.call_type) === 'video' ? <Video size={25} /> : <Phone size={25} />}</span>
        <h2>{incoming?.status === 'ringing' ? `${peerName} is calling` : activeCall ? (isGroup ? `${peerName} call` : 'Connected') : incoming?.status === 'active' && incoming.group_id ? 'Community call is live' : ringingOutgoing ? 'Calling…' : 'Calling setup'}</h2>
        <p>{incoming?.status === 'ringing' ? `Incoming ${incoming.call_type} call${isGroup ? ' for this community' : ''}.` : activeCall ? (localStream ? 'Audio/video connection starting.' : 'Requesting microphone/camera permission…') : incoming?.status === 'active' && incoming.group_id ? 'Join when you are ready; your microphone and camera stay off until you join.' : ringingOutgoing ? `Waiting for ${isGroup ? 'community members' : peerName} to answer.` : notice}</p>
        {activeCall && <div className="call-media-grid">
          {activeCall.call_type === 'video' && localStream && <video className="call-media-tile call-media-tile--local" autoPlay playsInline muted ref={element => { if (element && element.srcObject !== localStream) element.srcObject = localStream }} />}
          {Object.entries(remoteStreams).map(([id, stream]) => <video key={id} className="call-media-tile" autoPlay playsInline ref={element => { if (element && element.srcObject !== stream) element.srcObject = stream }} />)}
          {activeCall.call_type === 'voice' && <span className="call-voice-status"><Phone size={20} /> Voice connected</span>}
        </div>}
        {incoming?.status === 'active' && incoming.group_id && !activeCall && <div className="call-invite-dialog__actions"><button type="button" className="call-invite-button call-invite-button--accept" onClick={() => setJoinedGroupCallId(incoming.id)}><Phone size={17} /> Join community call</button></div>}\n        {incoming?.status === 'ringing' && <div className="call-invite-dialog__actions">
          <button type="button" className="call-invite-button call-invite-button--accept" disabled={busy} onClick={() => void updateStatus(incoming, 'active')}><Check size={17} /> Accept</button>
          <button type="button" className="call-invite-button call-invite-button--decline" disabled={busy} onClick={() => void updateStatus(incoming, 'rejected')}><PhoneOff size={17} /> Decline</button>
        </div>}
        {activeCall && <div className="call-invite-dialog__actions">
          <button type="button" className="call-invite-button" onClick={toggleMute} title={muted ? 'Unmute microphone' : 'Mute microphone'}>{muted ? <MicOff size={17} /> : <Mic size={17} />}{muted ? 'Unmute' : 'Mute'}</button>
          {activeCall.call_type === 'video' && <button type="button" className="call-invite-button" onClick={toggleCamera} title={cameraOff ? 'Turn camera on' : 'Turn camera off'}>{cameraOff ? <CameraOff size={17} /> : <Camera size={17} />}{cameraOff ? 'Camera on' : 'Camera off'}</button>}
          <button type="button" className="call-invite-button call-invite-button--decline" disabled={busy} onClick={() => void endOrLeaveCall()}><PhoneOff size={17} />{activeCall.group_id && activeCall.caller_id !== userId ? 'Leave call' : 'End call'}</button>
        </div>}
        {ringingOutgoing && <div className="call-invite-dialog__actions"><button type="button" className="call-invite-button call-invite-button--decline" disabled={busy} onClick={() => void updateStatus(ringingOutgoing, 'ended')}><PhoneOff size={17} /> Cancel call</button></div>}
        {notice && !activeCall && !incoming && !ringingOutgoing && <button type="button" className="call-invite-button" onClick={dismissNotice}><X size={16} /> Close</button>}
      </section>
    </div>}
  </>
}
