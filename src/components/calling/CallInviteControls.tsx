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
type Props = { recipientId?: string; groupId?: string; peerName: string; compact?: boolean; hideIncomingPrompt?: boolean }

declare global {
  interface Window { LivekitClient?: any }
}

// The static CDN tag normally loads before React, but an ad blocker or a
// transient CDN failure can leave the calling UI mounted without the SDK.
// Retry once on demand so the user gets a useful error instead of a dead call.
let liveKitSdkPromise: Promise<any> | null = null
function loadLiveKitSdk(): Promise<any> {
  if (window.LivekitClient?.Room && window.LivekitClient?.RoomEvent) {
    return Promise.resolve(window.LivekitClient)
  }
  if (liveKitSdkPromise) return liveKitSdkPromise
  liveKitSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/livekit-client@2.22.4/dist/livekit-client.umd.min.js'
    script.crossOrigin = 'anonymous'
    script.async = true
    const timeout = window.setTimeout(() => {
      script.remove()
      reject(new Error('LiveKit browser SDK could not load. Check your internet connection or content blocker, then refresh.'))
    }, 15000)
    script.onload = () => {
      window.clearTimeout(timeout)
      if (window.LivekitClient?.Room && window.LivekitClient?.RoomEvent) resolve(window.LivekitClient)
      else reject(new Error('LiveKit browser SDK loaded but was not available. Refresh the page and try again.'))
    }
    script.onerror = () => {
      window.clearTimeout(timeout)
      script.remove()
      reject(new Error('LiveKit browser SDK could not load. Check your internet connection or content blocker, then refresh.'))
    }
    document.head.appendChild(script)
  }).catch(error => {
    liveKitSdkPromise = null
    throw error
  })
  return liveKitSdkPromise
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
  const roomRef = useRef<any>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
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
    if (!userId) {
      setNotice('Please sign in again to start a call.')
      return
    }
    if (busy) return
    if (incoming || outgoing) {
      setNotice('A call is already active or ringing. Use the call window to answer or end it first.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice('Voice/video calling needs a secure connection and browser media support. Open the app in the latest Chrome or Edge and allow microphone/camera access.')
      return
    }
    setBusy(true); setNotice(callType === 'voice' ? 'Starting voice call…' : 'Starting video call…')
    try {
      const { data, error } = await supabase.from('call_sessions').insert({
        caller_id: userId, recipient_id: recipientId ?? null, group_id: groupId ?? null,
        call_type: callType, status: 'ringing',
      }).select('id,caller_id,recipient_id,group_id,call_type,status,created_at').single()
      if (error) throw error
      setOutgoing(data as CallSession)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '')
      console.error('Banjara Connect start-call failed:', error)
      setNotice(message.includes('call_sessions') || message.includes('schema cache')
        ? 'Calling database setup is missing or not available yet.'
        : message
          ? `Could not start the call: ${message}`
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

  // LiveKit transports audio/video through the configured media server. Supabase
  // remains responsible for invitations and the authenticated token endpoint.
  useEffect(() => {
    if (!activeCall || !userId) return
    let disposed = false
    let room: any = null
    const streamByParticipant = new Map<string, MediaStream>()
    const refreshRemoteStreams = () => {
      const next: Record<string, MediaStream> = {}
      for (const [identity, stream] of streamByParticipant) next[identity] = stream
      setRemoteStreams(next)
    }
    const start = async () => {
      try {
        const sdk = await loadLiveKitSdk()
        if (!sdk?.Room || !sdk?.RoomEvent || !sdk?.Track) {
          throw new Error('LiveKit browser SDK did not load. Refresh the page and try again.')
        }
        if (disposed) return
        const { data: tokenData, error: tokenError } = await supabase.functions.invoke('livekit-token', {
          body: { callId: activeCall.id },
        })
        if (tokenError) throw tokenError
        const serverUrl = tokenData?.serverUrl
        const token = tokenData?.token
        if (!serverUrl || !token) throw new Error('The calling server did not return a LiveKit connection token.')
        if (disposed) return

        room = new sdk.Room({ adaptiveStream: true, dynacast: true })
        roomRef.current = room
        room.on(sdk.RoomEvent.TrackSubscribed, (track: any, _publication: any, participant: any) => {
          if (disposed) return
          if (track.kind === sdk.Track.Kind.Audio || track.kind === sdk.Track.Kind.Video) {
            let stream = streamByParticipant.get(participant.identity)
            if (!stream) { stream = new MediaStream(); streamByParticipant.set(participant.identity, stream) }
            if (!stream.getTracks().some((item: MediaStreamTrack) => item.id === track.mediaStreamTrack.id)) stream.addTrack(track.mediaStreamTrack)
            refreshRemoteStreams()
          }
        })
        room.on(sdk.RoomEvent.TrackUnsubscribed, (track: any, _publication: any, participant: any) => {
          const stream = streamByParticipant.get(participant.identity)
          if (stream) {
            stream.getTracks().filter((item: MediaStreamTrack) => item.id === track.mediaStreamTrack.id).forEach((item: MediaStreamTrack) => stream.removeTrack(item))
            if (!stream.getTracks().length) streamByParticipant.delete(participant.identity)
            refreshRemoteStreams()
          }
        })
        room.on(sdk.RoomEvent.ParticipantDisconnected, (participant: any) => {
          streamByParticipant.delete(participant.identity)
          refreshRemoteStreams()
        })
        room.on(sdk.RoomEvent.Disconnected, () => {
          if (!disposed) setNotice('Call disconnected. Check your connection and rejoin if needed.')
        })
        await room.connect(serverUrl, token)
        if (disposed) { await room.disconnect(); return }
        await room.localParticipant.setMicrophoneEnabled(true)
        if (activeCall.call_type === 'video') await room.localParticipant.setCameraEnabled(true)
        const local = new MediaStream()
        room.localParticipant.getTrackPublications().forEach((publication: any) => {
          if (publication.track?.mediaStreamTrack) local.addTrack(publication.track.mediaStreamTrack)
        })
        localStreamRef.current = local
        setLocalStream(local)
        setNotice('')
      } catch (error) {
        if (!disposed) {
          const message = error instanceof Error ? error.message : ''
          setNotice(message.includes('NotAllowedError') || message.toLowerCase().includes('permission')
            ? 'Microphone/camera permission was denied. Allow access and retry the call.'
            : message || 'Could not connect audio/video. Check browser permissions and network, then try again.')
        }
      }
    }
    void start()
    return () => {
      disposed = true
      if (roomRef.current === room) roomRef.current = null
      if (room) void room.disconnect()
      streamByParticipant.clear()
      localStreamRef.current = null
      setLocalStream(null)
      setRemoteStreams({})
    }
  }, [activeCall?.id, activeCall?.status, activeCall?.call_type, activeCall?.group_id, userId])

  const toggleMute = () => {
    const next = !muted
    const room = roomRef.current
    if (room) void room.localParticipant.setMicrophoneEnabled(!next).catch(() => setNotice('Could not change microphone state.'))
    setMuted(next)
  }
  const toggleCamera = () => {
    const next = !cameraOff
    const room = roomRef.current
    if (room) void room.localParticipant.setCameraEnabled(!next).catch(() => setNotice('Could not change camera state.'))
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
      <button type="button" className="chat-screen__action" aria-label={isGroup ? 'Start group voice call' : 'Voice call'} title={isGroup ? 'Group voice call' : 'Voice call'} onClick={() => void startCall('voice')} disabled={busy}><Phone size={18} /></button>
      <button type="button" className="chat-screen__action" aria-label={isGroup ? 'Start group video call' : 'Video call'} title={isGroup ? 'Group video call' : 'Video call'} onClick={() => void startCall('video')} disabled={busy}><Video size={19} /></button>
    </div>
    {((incoming && (!hideIncomingPrompt || incoming.status !== 'ringing')) || ringingOutgoing || activeCall || notice) && <div className="call-invite-backdrop" role="presentation">
      <section className="call-invite-dialog call-invite-dialog--media" role="dialog" aria-modal="true" aria-label="Call controls">
        <span className="call-invite-dialog__icon">{isGroup ? <Users size={25} /> : (activeCall?.call_type ?? incoming?.call_type ?? outgoing?.call_type) === 'video' ? <Video size={25} /> : <Phone size={25} />}</span>
        <h2>{incoming?.status === 'ringing' ? `${peerName} is calling` : activeCall ? (isGroup ? `${peerName} call` : 'Connected') : incoming?.status === 'active' && incoming.group_id ? 'Community call is live' : ringingOutgoing ? 'Calling…' : 'Calling setup'}</h2>
        <p>{incoming?.status === 'ringing' ? `Incoming ${incoming.call_type} call${isGroup ? ' for this community' : ''}.` : activeCall ? (localStream ? 'Audio/video connection starting.' : 'Connecting securely to the call…') : incoming?.status === 'active' && incoming.group_id ? 'Join when you are ready; your microphone and camera stay off until you join.' : ringingOutgoing ? `Waiting for ${isGroup ? 'community members' : peerName} to answer.` : notice}</p>
        {activeCall && notice && <p role="status" className="call-invite-dialog__notice">{notice}</p>}
        {activeCall && <div className="call-media-grid">
          {activeCall.call_type === 'video' && localStream && <video className="call-media-tile call-media-tile--local" autoPlay playsInline muted ref={element => { if (element && element.srcObject !== localStream) element.srcObject = localStream }} />}
          {Object.entries(remoteStreams).map(([id, stream]) => <div key={id} className="call-media-tile"><video autoPlay playsInline muted ref={element => { if (element && element.srcObject !== stream) element.srcObject = stream }} /><audio autoPlay ref={element => { if (element && element.srcObject !== stream) element.srcObject = stream }} /></div>)}
          {activeCall.call_type === 'voice' && <span className="call-voice-status"><Phone size={20} /> Voice call connected</span>}
        </div>}
        {incoming?.status === 'active' && incoming.group_id && !activeCall && <div className="call-invite-dialog__actions"><button type="button" className="call-invite-button call-invite-button--accept" onClick={() => setJoinedGroupCallId(incoming.id)}><Phone size={17} /> Join community call</button></div>}
        {incoming?.status === 'ringing' && <div className="call-invite-dialog__actions">
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
