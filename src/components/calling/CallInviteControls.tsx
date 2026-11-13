import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Room, RoomEvent, Track } from 'livekit-client'
import { createPortal } from 'react-dom'
import { Phone, Video, PhoneOff, Check, X, Users, Mic, MicOff, Camera, CameraOff, SwitchCamera, Volume2, VolumeX } from 'lucide-react'
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
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('user')
  const [cameraSwitching, setCameraSwitching] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [localVideoPosition, setLocalVideoPosition] = useState<{ x: number; y: number } | null>(null)
  const [remoteVideoPosition, setRemoteVideoPosition] = useState<{ x: number; y: number } | null>(null)
  const [localVideoExpanded, setLocalVideoExpanded] = useState(false)
  const localDragStartRef = useRef<{ x: number; y: number } | null>(null)
  const remoteDragStartRef = useRef<{ x: number; y: number } | null>(null)
  const localDragMovedRef = useRef(false)
  const remoteDragMovedRef = useRef(false)

  useEffect(() => {
    if (!notice) return
    const timeoutId = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [notice])
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const [joinedGroupCallId, setJoinedGroupCallId] = useState<string | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const liveKitRoomRef = useRef<Room | null>(null)
  const isGroup = Boolean(groupId)
  const activeCall = outgoing?.status === 'active' ? outgoing : incoming?.status === 'active' && (!incoming.group_id || joinedGroupCallId === incoming.id) ? incoming : null
  const ringingOutgoing = outgoing?.status === 'ringing' ? outgoing : null

  const refreshCalls = useCallback(async () => {
    if (!userId) return
    // Ignore stale call sessions so an abandoned database row cannot reopen
    // the fullscreen call UI whenever a conversation is mounted again.
    const recentCallCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    let incomingQuery = supabase.from('call_sessions').select('id,caller_id,recipient_id,group_id,call_type,status,created_at').in('status', ['ringing', 'active']).gte('created_at', recentCallCutoff).neq('caller_id', userId).order('created_at', { ascending: false }).limit(1)
    incomingQuery = groupId ? incomingQuery.eq('group_id', groupId) : incomingQuery.eq('recipient_id', userId).is('group_id', null)
    let outgoingQuery = supabase.from('call_sessions').select('id,caller_id,recipient_id,group_id,call_type,status,created_at').eq('caller_id', userId).in('status', ['ringing', 'active']).gte('created_at', recentCallCutoff).order('created_at', { ascending: false }).limit(1)
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

  // Request browser media permission directly from the user's tap. Browsers
  // are more reliable about showing the permission prompt in a user gesture
  // than when getUserMedia is first called later from an effect.
  const requestCallPermissions = async (callType: CallType) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support camera and microphone access. Please open Connect in Chrome.')
    }
    const permissionStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video' ? { facingMode: { ideal: 'user' } } : false,
    })
    permissionStream.getTracks().forEach(track => track.stop())
  }

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
    setBusy(true); setNotice(callType === 'voice' ? 'Allow microphone access to continue…' : 'Allow camera and microphone access to continue…')
    try {
      await requestCallPermissions(callType)
      setNotice('Starting call…')
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
      if (status === 'active') {
        setNotice(call.call_type === 'video' ? 'Allow camera and microphone access to join…' : 'Allow microphone access to join…')
        await requestCallPermissions(call.call_type)
        setNotice('')
      }
      const { error } = await supabase.from('call_sessions').update({
        status, ...(status === 'active' ? { answered_at: new Date().toISOString() } : { ended_at: new Date().toISOString() }),
      }).eq('id', call.id)
      if (error) throw error
      // Clear the local call UI immediately; do not rely only on Realtime delivery.
      if (incoming?.id === call.id) setIncoming(null)
      if (outgoing?.id === call.id) setOutgoing(null)
      setJoinedGroupCallId(current => current === call.id ? null : current)
      setNotice('')
      await refreshCalls()
    } catch { setNotice('Could not update this call. Please try again.') }
    finally { setBusy(false) }
  }

  // LiveKit SFU carries call media and handles TURN/ICE relay negotiation.
  useEffect(() => {
    if (!activeCall || !userId) return
    let disposed = false
    let room: Room | null = null

    const setRemoteTrack = (identity: string, track: MediaStreamTrack) => {
      setRemoteStreams(current => {
        const existing = current[identity]
        const nextTracks = existing?.getTracks() ?? []
        if (nextTracks.some(item => item.id === track.id)) return current
        return { ...current, [identity]: new MediaStream([...nextTracks, track]) }
      })
    }
    const removeRemoteTrack = (identity: string, track: MediaStreamTrack) => {
      setRemoteStreams(current => {
        const existing = current[identity]
        if (!existing) return current
        const remaining = existing.getTracks().filter(item => item.id !== track.id)
        const next = { ...current }
        if (remaining.length) next[identity] = new MediaStream(remaining)
        else delete next[identity]
        return next
      })
    }
    const syncLocalStream = (connectedRoom: Room) => {
      const tracks = connectedRoom.localParticipant.getTrackPublications()
        .map(publication => publication.track?.mediaStreamTrack)
        .filter((track): track is MediaStreamTrack => Boolean(track && track.readyState === 'live'))
      const stream = new MediaStream(tracks)
      localStreamRef.current = stream
      setLocalStream(stream)
    }

    const connect = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('This browser does not support secure calling. Open Connect over HTTPS in a current browser.')
        }
        setNotice('Connecting securely to the call…')
        const { data, error } = await supabase.functions.invoke('livekit-token', {
          body: { callId: activeCall.id },
        })
        if (error) throw error
        const serverUrl = typeof data?.serverUrl === 'string' ? data.serverUrl : ''
        const token = typeof data?.token === 'string' ? data.token : ''
        if (!serverUrl || !token) {
          throw new Error(data?.error || 'Calling service is not configured. Please try again later.')
        }
        if (disposed) return

        room = new Room({ adaptiveStream: true, dynacast: true })
        liveKitRoomRef.current = room
        room
          .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
            if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
              setRemoteTrack(participant.identity, track.mediaStreamTrack)
            }
          })
          .on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
            removeRemoteTrack(participant.identity, track.mediaStreamTrack)
          })
          .on(RoomEvent.ParticipantDisconnected, participant => {
            setRemoteStreams(current => {
              const next = { ...current }
              delete next[participant.identity]
              return next
            })
          })
          .on(RoomEvent.Disconnected, () => {
            if (!disposed) setNotice('Call connection was interrupted. Please reconnect.')
          })
          .on(RoomEvent.AudioPlaybackStatusChanged, () => {
            if (room && !room.canPlaybackAudio && !disposed) {
              setNotice('Tap Speaker to enable call audio on this browser.')
            }
          })

        await room.connect(serverUrl, token, { autoSubscribe: true })
        if (disposed) { await room.disconnect(); return }
        await room.localParticipant.setMicrophoneEnabled(true)
        if (activeCall.call_type === 'video') {
          await room.localParticipant.setCameraEnabled(true, {
            facingMode: 'user',
            resolution: { width: 1280, height: 720, frameRate: 24 },
          })
        }
        if (disposed) { await room.disconnect(); return }
        syncLocalStream(room)
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            const track = publication.track
            if (publication.isSubscribed && track && (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio)) {
              setRemoteTrack(participant.identity, track.mediaStreamTrack)
            }
          }
        }
        setNotice('')
      } catch (error) {
        if (!disposed) {
          console.error('LiveKit call connection failed:', error)
          const message = error instanceof Error ? error.message : ''
          setNotice(message.toLowerCase().includes('permission')
            ? 'Microphone/camera permission was denied. Allow access and retry the call.'
            : message || 'Could not connect audio/video. Check browser permissions and try again.')
        }
      }
    }

    void connect()
    return () => {
      disposed = true
      const activeRoom = room
      if (liveKitRoomRef.current === activeRoom) liveKitRoomRef.current = null
      if (activeRoom) void activeRoom.disconnect()
      localStreamRef.current = null
      setLocalStream(null)
      setRemoteStreams({})
    }
  }, [activeCall?.id, activeCall?.status, activeCall?.call_type, activeCall?.group_id, userId])

  const toggleMute = () => {
    const room = liveKitRoomRef.current
    if (!room) {
      setNotice('Microphone is not ready yet. Please wait for the call to connect.')
      return
    }
    const next = !muted
    void room.localParticipant.setMicrophoneEnabled(!next).then(() => setMuted(next)).catch(error => {
      console.warn('Could not change microphone state:', error)
      setNotice('Could not change microphone state. Please try again.')
    })
  }
  const toggleSpeaker = async () => {
    const room = liveKitRoomRef.current
    if (room && !room.canPlaybackAudio) {
      try { await room.startAudio() } catch (error) { console.warn('Could not start call audio:', error) }
    }
    const audioElements = [...audioElementsRef.current.values()]
    if (!audioElements.length) {
      setNotice('Call audio is not ready yet. Please wait a moment and try again.')
      return
    }

    const routable = audioElements.filter(element =>
      typeof (element as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId === 'function'
    )
    if (!routable.length) {
      setNotice('This browser does not support switching between speaker and earpiece inside Connect. Use your phone or browser audio-output controls.')
      return
    }

    const next = !speakerOn
    try {
      const devices = navigator.mediaDevices?.enumerateDevices
        ? (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audiooutput')
        : []
      const preferred = devices.find(device => next
        ? /speaker|loudspeaker|built.?in.*speaker/i.test(device.label)
        : /earpiece|receiver|earpiece|phone.*speaker|head(phone|set)/i.test(device.label))

      if (!preferred) {
        setNotice(next
          ? 'Your browser has not exposed a speaker output device to Connect.'
          : 'Your browser has not exposed an earpiece output device to Connect. Use the phone audio controls to change the route.')
        return
      }

      await Promise.all(routable.map(element =>
        (element as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(preferred.deviceId)
      ))
      setSpeakerOn(next)
      setNotice('')
    } catch (error) {
      console.warn('Could not change call audio output:', error)
      setNotice('Could not switch audio output. Use your phone or browser audio-output controls.')
    }
  }
  const toggleCamera = () => {
    const room = liveKitRoomRef.current
    if (!room) {
      setNotice('Camera is not ready yet. Please wait for the call to connect.')
      return
    }
    const next = !cameraOff
    void room.localParticipant.setCameraEnabled(!next).then(() => {
      setCameraOff(next)
      syncCallLocalPreview(room)
    }).catch(error => {
      console.warn('Could not change camera state:', error)
      setNotice('Could not change camera state. Please try again.')
    })
  }
  const switchCamera = async () => {
    if (cameraSwitching) return
    const room = liveKitRoomRef.current
    const cameraTrack = room?.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack
    if (!room || !cameraTrack) {
      setNotice('Camera is not ready yet. Please wait for the call to connect.')
      return
    }
    const nextFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user'
    setCameraSwitching(true)
    try {
      await cameraTrack.restartTrack({ facingMode: nextFacingMode })
      const tracks = room.localParticipant.getTrackPublications()
        .map(publication => publication.track?.mediaStreamTrack)
        .filter((track): track is MediaStreamTrack => Boolean(track && track.readyState === 'live'))
      const stream = new MediaStream(tracks)
      localStreamRef.current = stream
      setLocalStream(stream)
      setCameraFacingMode(nextFacingMode)
      setNotice('')
    } catch (error) {
      console.warn('Could not switch video camera:', error)
      setNotice('Could not switch camera. Check camera permissions and try again.')
    } finally {
      setCameraSwitching(false)
    }
  }
  const syncCallLocalPreview = (room: Room) => {
    const tracks = room.localParticipant.getTrackPublications()
      .map(publication => publication.track?.mediaStreamTrack)
      .filter((track): track is MediaStreamTrack => Boolean(track && track.readyState === 'live'))
    const stream = new MediaStream(tracks)
    localStreamRef.current = stream
    setLocalStream(stream)
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
    <div className={compact ? 'call-invite-controls call-invite-controls--compact' : 'call-invite-controls'} style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 8, overflowX: 'auto', whiteSpace: 'nowrap' }}>
      <button type="button" className="chat-screen__action" aria-label={isGroup ? 'Start group voice call' : 'Voice call'} title={isGroup ? 'Group voice call' : 'Voice call'} onClick={() => void startCall('voice')} disabled={busy}><Phone size={18} /></button>
      <button type="button" className="chat-screen__action" aria-label={isGroup ? 'Start group video call' : 'Video call'} title={isGroup ? 'Group video call' : 'Video call'} onClick={() => void startCall('video')} disabled={busy}><Video size={19} /></button>
    </div>
    {((incoming && (!hideIncomingPrompt || incoming.status !== 'ringing')) || ringingOutgoing || activeCall || notice) && createPortal(<div className="call-invite-backdrop call-invite-backdrop--fullscreen" role="presentation">
      <section className={`call-invite-dialog call-invite-dialog--media call-invite-dialog--fullscreen${activeCall?.call_type === 'video' ? ' call-invite-dialog--video-focus' : ''}`} role="dialog" aria-modal="true" aria-label="Call controls">
        <span className="call-invite-dialog__icon" style={{ position: 'relative', zIndex: 6 }}>{isGroup ? <Users size={25} /> : (activeCall?.call_type ?? incoming?.call_type ?? outgoing?.call_type) === 'video' ? <Video size={25} /> : <Phone size={25} />}</span>
        <h2 style={{ position: 'relative', zIndex: 6 }}>{incoming?.status === 'ringing' ? `${peerName} is calling` : activeCall ? (isGroup ? `${peerName} call` : peerName) : incoming?.status === 'active' && incoming.group_id ? 'Community call is live' : ringingOutgoing ? 'Calling…' : 'Calling setup'}</h2>
        <p style={{ position: 'relative', zIndex: 6 }}>{incoming?.status === 'ringing' ? `Incoming ${incoming.call_type} call${isGroup ? ' for this community' : ''}.` : activeCall ? (localStream ? 'Audio/video connection starting.' : 'Connecting securely to the call…') : incoming?.status === 'active' && incoming.group_id ? 'Join when you are ready; your microphone and camera stay off until you join.' : ringingOutgoing ? `Waiting for ${isGroup ? 'community members' : peerName} to answer.` : notice}</p>
        {activeCall && notice && <p role="status" className="call-invite-dialog__notice" style={{ position: 'relative', zIndex: 6 }}>{notice}</p>}
        {activeCall && <div className="call-media-grid" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: '#080808', overflow: 'hidden' }}>
          {Object.entries(remoteStreams).map(([id, stream]) => {
            const remoteIsMain = !localVideoExpanded
            const remoteStyle: CSSProperties = remoteIsMain
              ? { position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#080808', pointerEvents: 'auto', cursor: 'pointer' }
              : { position: 'fixed', zIndex: 16, pointerEvents: 'auto', width: 96, height: 136, left: remoteVideoPosition ? remoteVideoPosition.x : undefined, top: remoteVideoPosition ? remoteVideoPosition.y : undefined, right: remoteVideoPosition ? undefined : 12, bottom: remoteVideoPosition ? undefined : 142, borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(255,255,255,.85)', boxShadow: '0 6px 24px rgba(0,0,0,.45)', touchAction: 'none', cursor: 'grab', background: '#222', ...({ '--pip-left': remoteVideoPosition ? `${remoteVideoPosition.x}px` : 'auto', '--pip-top': remoteVideoPosition ? `${remoteVideoPosition.y}px` : 'auto', '--pip-right': remoteVideoPosition ? 'auto' : '12px', '--pip-bottom': remoteVideoPosition ? 'auto' : '142px' } as CSSProperties) }
            return <div key={id} className={`call-media-tile ${remoteIsMain ? 'call-media-tile--remote-main' : 'call-media-tile--remote-pip'}`} onClick={() => { if (remoteDragMovedRef.current) { remoteDragMovedRef.current = false; return }; setLocalVideoExpanded(false) }} onPointerDown={event => { if (remoteIsMain) return; remoteDragMovedRef.current = false; remoteDragStartRef.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (!remoteIsMain && remoteDragStartRef.current) { const origin = remoteDragStartRef.current; if (Math.abs(event.clientX - origin.x) > 5 || Math.abs(event.clientY - origin.y) > 5) remoteDragMovedRef.current = true; if (remoteDragMovedRef.current) setRemoteVideoPosition({ x: Math.max(8, Math.min(window.innerWidth - 120, event.clientX - 48)), y: Math.max(8, Math.min(window.innerHeight - 160, event.clientY - 68)) }) } }} onPointerUp={() => { remoteDragStartRef.current = null }} onPointerCancel={() => { remoteDragStartRef.current = null; remoteDragMovedRef.current = false }} style={remoteStyle}>
              <video autoPlay playsInline muted ref={element => { if (element && element.srcObject !== stream) element.srcObject = stream }} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', background: '#080808', transform: 'none', borderRadius: remoteIsMain ? 0 : 12 }} />
              <audio autoPlay ref={element => { if (element) { audioElementsRef.current.set(id, element); if (element.srcObject !== stream) element.srcObject = stream } else { audioElementsRef.current.delete(id) } }} />
            </div>
          })}
          {activeCall.call_type === 'video' && localStream && <div className={`call-media-tile--local ${localVideoExpanded ? 'call-media-tile--local-expanded' : 'call-media-tile--local-pip'}`} onPointerDown={event => { if (localVideoExpanded) return; localDragMovedRef.current = false; localDragStartRef.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (!localVideoExpanded && localDragStartRef.current) { const origin = localDragStartRef.current; if (Math.abs(event.clientX - origin.x) > 7 || Math.abs(event.clientY - origin.y) > 7) localDragMovedRef.current = true; if (localDragMovedRef.current) setLocalVideoPosition({ x: Math.max(8, Math.min(window.innerWidth - 120, event.clientX - 48)), y: Math.max(8, Math.min(window.innerHeight - 160, event.clientY - 68)) }) } }} onPointerUp={() => { const wasDrag = localDragMovedRef.current; localDragStartRef.current = null; localDragMovedRef.current = false; if (!wasDrag) setLocalVideoExpanded(value => !value) }} onPointerCancel={() => { localDragStartRef.current = null; localDragMovedRef.current = false }} style={localVideoExpanded ? { position: 'fixed', inset: 0, zIndex: 18, width: '100vw', height: '100dvh', pointerEvents: 'auto', background: '#080808', cursor: 'pointer', borderRadius: 0 } : { position: 'fixed', zIndex: 16, pointerEvents: 'auto', width: 96, height: 136, left: localVideoPosition ? localVideoPosition.x : undefined, top: localVideoPosition ? localVideoPosition.y : undefined, right: localVideoPosition ? undefined : 12, bottom: localVideoPosition ? undefined : 142, borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(255,255,255,.85)', boxShadow: '0 6px 24px rgba(0,0,0,.45)', touchAction: 'none', cursor: 'grab', background: '#222', ...({ '--pip-left': localVideoPosition ? `${localVideoPosition.x}px` : 'auto', '--pip-top': localVideoPosition ? `${localVideoPosition.y}px` : 'auto', '--pip-right': localVideoPosition ? 'auto' : '12px', '--pip-bottom': localVideoPosition ? 'auto' : '142px' } as CSSProperties) }}>
            <video className="call-media-tile call-media-tile--local" autoPlay playsInline muted ref={element => { if (element && element.srcObject !== localStream) element.srcObject = localStream }} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', transform: cameraFacingMode === 'user' ? 'scaleX(-1)' : 'none', background: '#080808' }} />
          </div>}
          {Object.keys(remoteStreams).length === 0 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', textAlign: 'center', padding: 24 }}>Waiting for the other person’s video…</div>}
          {activeCall.call_type === 'voice' && <span className="call-voice-status" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Phone size={20} /> Voice call connected</span>}
        </div>}
        {incoming?.status === 'active' && incoming.group_id && !activeCall && <div className="call-invite-dialog__actions" style={{ position: 'relative', zIndex: 6 }}><button type="button" className="call-invite-button call-invite-button--accept" onClick={() => setJoinedGroupCallId(incoming.id)}><Phone size={17} /> Join community call</button></div>}
        {incoming?.status === 'ringing' && <div className="call-invite-dialog__actions">
          <button type="button" className="call-invite-button call-invite-button--accept" disabled={busy} onClick={() => void updateStatus(incoming, 'active')}><Check size={17} /> Accept</button>
          <button type="button" className="call-invite-button call-invite-button--decline" disabled={busy} onClick={() => void updateStatus(incoming, 'rejected')}><PhoneOff size={17} /> Decline</button>
        </div>}
        {activeCall && <div className="call-invite-dialog__actions" style={{ position: 'fixed', zIndex: 10, left: 12, right: 12, bottom: 18, display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'center', alignItems: 'center', gap: 8, overflowX: 'auto', whiteSpace: 'nowrap', padding: '10px 8px', background: 'rgba(15,15,15,.82)', borderRadius: 18, backdropFilter: 'blur(12px)' }}>
          <button type="button" className="call-invite-button" onClick={() => void toggleSpeaker()} title={speakerOn ? 'Speaker on' : 'Speaker off'}>{speakerOn ? <Volume2 size={17} /> : <VolumeX size={17} />}{speakerOn ? 'Speaker' : 'Earpiece'}</button>
          <button type="button" className="call-invite-button" onClick={toggleMute} title={muted ? 'Unmute microphone' : 'Mute microphone'}>{muted ? <MicOff size={17} /> : <Mic size={17} />}{muted ? 'Unmute' : 'Mute'}</button>
           <button type="button" className="call-invite-button call-invite-button--call-end" disabled={busy} onClick={() => void endOrLeaveCall()}><PhoneOff size={19} />{activeCall.group_id && activeCall.caller_id !== userId ? 'Leave' : 'End'}</button>
           {activeCall.call_type === 'video' && <><button type="button" className="call-invite-button" onClick={toggleCamera} title={cameraOff ? 'Turn camera on' : 'Turn camera off'}>{cameraOff ? <CameraOff size={19} /> : <Camera size={19} />}{cameraOff ? 'Camera' : 'Camera'}</button><button type="button" className="call-invite-button" onClick={() => void switchCamera()} disabled={cameraSwitching || cameraOff} title="Switch front/back camera"><SwitchCamera size={19} />{cameraSwitching ? 'Flip…' : 'Flip'}</button></>}
        </div>}
        {ringingOutgoing && <div className="call-invite-dialog__actions"><button type="button" className="call-invite-button call-invite-button--decline" disabled={busy} onClick={() => void updateStatus(ringingOutgoing, 'ended')}><PhoneOff size={17} /> Cancel call</button></div>}
        {notice && !activeCall && !incoming && !ringingOutgoing && <button type="button" className="call-invite-button" onClick={dismissNotice}><X size={16} /> Close</button>}
      </section>
    </div>, document.body)}
  </>
}
