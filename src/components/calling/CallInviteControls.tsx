import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
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
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const channelRef = useRef<any>(null)
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
      // Clear the local call UI immediately; do not rely only on Realtime delivery.
      if (incoming?.id === call.id) setIncoming(null)
      if (outgoing?.id === call.id) setOutgoing(null)
      setJoinedGroupCallId(current => current === call.id ? null : current)
      setNotice('')
      await refreshCalls()
    } catch { setNotice('Could not update this call. Please try again.') }
    finally { setBusy(false) }
  }

  // Native WebRTC carries media; private Supabase Realtime broadcasts exchange SDP and ICE.
  useEffect(() => {
    if (!activeCall || !userId) return
    let disposed = false
    let channel: any = null
    let local: MediaStream | null = null
    let joinInterval: number | undefined
    const peers = peerConnectionsRef.current
    const pendingIce = new Map<string, RTCIceCandidateInit[]>()

    const sendSignal = async (event: string, payload: Record<string, unknown>) => {
      if (!disposed && channel) {
        try { await channel.send({ type: 'broadcast', event, payload: { ...payload, from: userId } }) }
        catch (error) { if (!disposed) console.warn('Call signaling failed:', event, error) }
      }
    }
    const setRemote = (id: string, stream: MediaStream | null) => setRemoteStreams(prev => {
      const next = { ...prev }
      if (stream?.getTracks().length) next[id] = stream
      else delete next[id]
      return next
    })
    const getPeer = (id: string) => {
      const existing = peers.get(id)
      if (existing) return existing
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      peers.set(id, peer)
      const currentLocalStream = localStreamRef.current ?? local
      currentLocalStream?.getTracks().forEach(track => peer.addTrack(track, currentLocalStream))
      peer.onicecandidate = event => {
        if (event.candidate) void sendSignal('ice', { to: id, candidate: event.candidate.toJSON() })
      }
      peer.ontrack = event => {
        if (event.streams?.[0]) setRemote(id, event.streams[0])
      }
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
          peer.close(); peers.delete(id); setRemote(id, null)
        }
      }
      return peer
    }
    const flushIce = async (id: string, peer: RTCPeerConnection) => {
      const queued = pendingIce.get(id) ?? []
      pendingIce.delete(id)
      for (const candidate of queued) {
        try { await peer.addIceCandidate(candidate) } catch (error) { console.warn('ICE candidate rejected', error) }
      }
    }
    const onSignal = async (event: string, payload: any) => {
      const from = typeof payload?.from === 'string' ? payload.from : ''
      if (!from || from === userId || (payload?.to && payload.to !== userId)) return
      try {
        if (event === 'join') {
          if (userId.localeCompare(from) < 0 && !peers.has(from)) {
            const peer = getPeer(from)
            const offer = await peer.createOffer()
            await peer.setLocalDescription(offer)
            await sendSignal('offer', { to: from, description: peer.localDescription })
          }
        } else if (event === 'offer') {
          const peer = getPeer(from)
          await peer.setRemoteDescription(payload.description as RTCSessionDescriptionInit)
          await flushIce(from, peer)
          const answer = await peer.createAnswer()
          await peer.setLocalDescription(answer)
          await sendSignal('answer', { to: from, description: peer.localDescription })
        } else if (event === 'answer') {
          const peer = peers.get(from)
          if (peer) {
            await peer.setRemoteDescription(payload.description as RTCSessionDescriptionInit)
            await flushIce(from, peer)
          }
        } else if (event === 'ice') {
          const candidate = payload.candidate as RTCIceCandidateInit | undefined
          if (!candidate) return
          const peer = peers.get(from)
          if (peer?.remoteDescription) await peer.addIceCandidate(candidate)
          else pendingIce.set(from, [...(pendingIce.get(from) ?? []), candidate])
        } else if (event === 'leave') {
          peers.get(from)?.close(); peers.delete(from); pendingIce.delete(from); setRemote(from, null)
          // A direct call is over when the other participant leaves. Mark the
          // database session ended so reopening the chat cannot resurrect it.
          if (!activeCall.group_id) {
            void supabase.from('call_sessions').update({ status: 'ended', ended_at: new Date().toISOString() })
              .eq('id', activeCall.id).in('status', ['ringing', 'active'])
            setIncoming(current => current?.id === activeCall.id ? null : current)
            setOutgoing(current => current?.id === activeCall.id ? null : current)
            setNotice('')
          }
        }
      } catch (error) {
        if (!disposed) {
          console.error('WebRTC signaling failed:', event, error)
          setNotice('Could not establish the call connection. Check the network and try again.')
        }
      }
    }
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
          throw new Error('This browser does not support secure calling. Open Connect over HTTPS in a current browser.')
        }
        local = await navigator.mediaDevices.getUserMedia({ audio: true, video: activeCall.call_type === 'video' ? { facingMode: { ideal: 'user' } } : false })
        if (disposed) { local.getTracks().forEach(track => track.stop()); return }
        localStreamRef.current = local
        setLocalStream(local)
        channel = supabase.channel(`call:${activeCall.id}`, { config: { private: true } })
        channelRef.current = channel
        for (const event of ['join', 'offer', 'answer', 'ice', 'leave']) {
          channel.on('broadcast', { event }, (message: any) => { void onSignal(event, message?.payload) })
        }
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error('Call signaling timed out. Check your connection.')), 12000)
          channel.subscribe((status: string) => {
            if (status === 'SUBSCRIBED') { window.clearTimeout(timeout); resolve() }
            else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
              window.clearTimeout(timeout)
              reject(new Error('Private call signaling could not connect. Check Supabase Realtime permissions.'))
            }
          })
        })
        if (!disposed) {
          await sendSignal('join', {})
          // Broadcast join briefly more than once so peers that subscribed later
          // still discover each other; Realtime broadcast itself is not durable.
          let attempts = 0
          joinInterval = window.setInterval(() => {
            attempts += 1
            if (attempts >= 5 || disposed) {
              if (joinInterval !== undefined) window.clearInterval(joinInterval)
              return
            }
            void sendSignal('join', {})
          }, 1000)
          setNotice('')
        }
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
      if (joinInterval !== undefined) window.clearInterval(joinInterval)
      if (channelRef.current === channel) channelRef.current = null
      if (channel) {
        void channel.send({ type: 'broadcast', event: 'leave', payload: { from: userId } })
        void supabase.removeChannel(channel)
      }
      peers.forEach(peer => peer.close()); peers.clear(); pendingIce.clear()
      const streamToStop = localStreamRef.current ?? local
      streamToStop?.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
      setLocalStream(null); setRemoteStreams({})
    }
  }, [activeCall?.id, activeCall?.status, activeCall?.call_type, activeCall?.group_id, userId])

  const toggleMute = () => {
    const next = !muted
    const tracks = localStreamRef.current?.getAudioTracks() ?? []
    if (!tracks.length) {
      setNotice('Microphone is not ready yet. Please wait for the call to connect.')
      return
    }
    tracks.forEach(track => { track.enabled = !next })
    setMuted(next)
  }
  const toggleSpeaker = async () => {
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
    const next = !cameraOff
    const tracks = localStreamRef.current?.getVideoTracks() ?? []
    if (!tracks.length) {
      setNotice('Camera is not ready yet. Please wait for the video call to connect.')
      return
    }
    tracks.forEach(track => { track.enabled = !next })
    setCameraOff(next)
  }
  const switchCamera = async () => {
    if (cameraSwitching) return
    const currentStream = localStreamRef.current
    if (!currentStream?.getVideoTracks().length || !navigator.mediaDevices?.getUserMedia) {
      setNotice('Camera is not ready yet. Please wait for the video call to connect.')
      return
    }
    const nextFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user'
    setCameraSwitching(true)
    let replacementStream: MediaStream | null = null
    try {
      try {
        replacementStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { exact: nextFacingMode } } })
      } catch {
        replacementStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: nextFacingMode } } })
      }
      const nextTrack = replacementStream.getVideoTracks()[0]
      if (!nextTrack) throw new Error('No camera track was returned.')
      const videoSenders = [...peerConnectionsRef.current.values()]
        .flatMap(peer => peer.getSenders())
        .filter(sender => sender.track?.kind === 'video')
      await Promise.all(videoSenders.map(sender => sender.replaceTrack(nextTrack)))
      const latestStream = localStreamRef.current ?? currentStream
      const nextStream = new MediaStream([...latestStream.getAudioTracks(), nextTrack])
      localStreamRef.current = nextStream
      setLocalStream(nextStream)
      currentStream.getVideoTracks().forEach(track => track.stop())
      setCameraFacingMode(nextFacingMode)
      setNotice('')
    } catch (error) {
      replacementStream?.getTracks().forEach(track => track.stop())
      console.warn('Could not switch video camera:', error)
      setNotice('Could not switch camera. Check camera permissions and try again.')
    } finally {
      setCameraSwitching(false)
    }
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
              : { position: 'fixed', zIndex: 16, pointerEvents: 'auto', width: 96, height: 136, left: remoteVideoPosition ? remoteVideoPosition.x : undefined, top: remoteVideoPosition ? remoteVideoPosition.y : undefined, right: remoteVideoPosition ? undefined : 12, bottom: remoteVideoPosition ? undefined : 142, borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(255,255,255,.85)', boxShadow: '0 6px 24px rgba(0,0,0,.45)', touchAction: 'none', cursor: 'grab', background: '#222', ...({ '--pip-left': remoteVideoPosition ? `${remoteVideoPosition.x}px` : 'auto', '--pip-top': remoteVideoPosition ? `${remoteVideoPosition.y}px` : 'auto' } as CSSProperties) }
            return <div key={id} className={`call-media-tile ${remoteIsMain ? 'call-media-tile--remote-main' : 'call-media-tile--remote-pip'}`} onClick={() => { if (remoteDragMovedRef.current) { remoteDragMovedRef.current = false; return }; setLocalVideoExpanded(false) }} onPointerDown={event => { if (remoteIsMain) return; remoteDragMovedRef.current = false; remoteDragStartRef.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (!remoteIsMain && remoteDragStartRef.current) { const origin = remoteDragStartRef.current; if (Math.abs(event.clientX - origin.x) > 5 || Math.abs(event.clientY - origin.y) > 5) remoteDragMovedRef.current = true; if (remoteDragMovedRef.current) setRemoteVideoPosition({ x: Math.max(8, Math.min(window.innerWidth - 120, event.clientX - 48)), y: Math.max(8, Math.min(window.innerHeight - 160, event.clientY - 68)) }) } }} onPointerUp={() => { remoteDragStartRef.current = null }} onPointerCancel={() => { remoteDragStartRef.current = null; remoteDragMovedRef.current = false }} style={remoteStyle}>
              <video autoPlay playsInline muted ref={element => { if (element && element.srcObject !== stream) element.srcObject = stream }} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', background: '#080808', transform: 'none', borderRadius: remoteIsMain ? 0 : 12 }} />
              <audio autoPlay ref={element => { if (element) { audioElementsRef.current.set(id, element); if (element.srcObject !== stream) element.srcObject = stream } else { audioElementsRef.current.delete(id) } }} />
            </div>
          })}
          {activeCall.call_type === 'video' && localStream && <div className={`call-media-tile--local ${localVideoExpanded ? 'call-media-tile--local-expanded' : 'call-media-tile--local-pip'}`} onClick={() => { if (localDragMovedRef.current) { localDragMovedRef.current = false; return }; setLocalVideoExpanded(value => !value) }} onPointerDown={event => { if (localVideoExpanded) return; localDragMovedRef.current = false; localDragStartRef.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (!localVideoExpanded && localDragStartRef.current) { const origin = localDragStartRef.current; if (Math.abs(event.clientX - origin.x) > 5 || Math.abs(event.clientY - origin.y) > 5) localDragMovedRef.current = true; if (localDragMovedRef.current) setLocalVideoPosition({ x: Math.max(8, Math.min(window.innerWidth - 120, event.clientX - 48)), y: Math.max(8, Math.min(window.innerHeight - 160, event.clientY - 68)) }) } }} onPointerUp={() => { localDragStartRef.current = null }} onPointerCancel={() => { localDragStartRef.current = null; localDragMovedRef.current = false }} style={localVideoExpanded ? { position: 'fixed', inset: 0, zIndex: 18, width: '100vw', height: '100dvh', pointerEvents: 'auto', background: '#080808', cursor: 'pointer', borderRadius: 0 } : { position: 'fixed', zIndex: 16, pointerEvents: 'auto', width: 96, height: 136, left: localVideoPosition ? localVideoPosition.x : undefined, top: localVideoPosition ? localVideoPosition.y : undefined, right: localVideoPosition ? undefined : 12, bottom: localVideoPosition ? undefined : 142, borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(255,255,255,.85)', boxShadow: '0 6px 24px rgba(0,0,0,.45)', touchAction: 'none', cursor: 'grab', background: '#222', ...({ '--pip-left': localVideoPosition ? `${localVideoPosition.x}px` : 'auto', '--pip-top': localVideoPosition ? `${localVideoPosition.y}px` : 'auto' } as CSSProperties) }}>
            <video className="call-media-tile call-media-tile--local" autoPlay playsInline muted ref={element => { if (element && element.srcObject !== localStream) element.srcObject = localStream }} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', transform: 'none', background: '#080808' }} />
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
          {activeCall.call_type === 'video' && <><button type="button" className="call-invite-button" onClick={toggleCamera} title={cameraOff ? 'Turn camera on' : 'Turn camera off'}>{cameraOff ? <CameraOff size={17} /> : <Camera size={17} />}{cameraOff ? 'Camera on' : 'Camera off'}</button><button type="button" className="call-invite-button" onClick={() => void switchCamera()} disabled={cameraSwitching || cameraOff} title="Switch front/back camera"><SwitchCamera size={17} />{cameraSwitching ? 'Switching…' : 'Flip'}</button></>}
          <button type="button" className="call-invite-button call-invite-button--decline" disabled={busy} onClick={() => void endOrLeaveCall()}><PhoneOff size={17} />{activeCall.group_id && activeCall.caller_id !== userId ? 'Leave call' : 'End call'}</button>
        </div>}
        {ringingOutgoing && <div className="call-invite-dialog__actions"><button type="button" className="call-invite-button call-invite-button--decline" disabled={busy} onClick={() => void updateStatus(ringingOutgoing, 'ended')}><PhoneOff size={17} /> Cancel call</button></div>}
        {notice && !activeCall && !incoming && !ringingOutgoing && <button type="button" className="call-invite-button" onClick={dismissNotice}><X size={16} /> Close</button>}
      </section>
    </div>, document.body)}
  </>
}
