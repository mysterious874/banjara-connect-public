import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Globe, Users, Send, X } from 'lucide-react'
import { Avatar, Button, Loading } from '../components/ui'
import { useAuth } from '../hooks/AuthProvider'
import { supabase } from '../utils/supabase'
import { deletePostMedia, uploadPostMedia, validatePostMedia } from '../utils/mediaData'
import { userFacingError } from '../utils/userFacingError'

type Community = { id: string; name: string }

export default function CreatePostPage() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [groups, setGroups] = useState<Community[]>([])
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [sharePublic, setSharePublic] = useState(true)
  const [shareCommunity, setShareCommunity] = useState(false)
  const [communityPickerOpen, setCommunityPickerOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!session?.user) {
      setGroups([])
      setGroupsLoading(false)
      return () => { active = false }
    }
    void (async () => {
      try {
        const { data: memberships, error: membershipError } = await supabase
          .from('community_group_members').select('group_id').eq('user_id', session.user.id)
        if (membershipError) throw membershipError
        const ids = (memberships ?? []).map((row) => row.group_id)
        if (!ids.length) {
          if (active) setGroups([])
          return
        }
        const { data, error: groupError } = await supabase
          .from('community_groups').select('id,name').in('id', ids).order('name')
        if (groupError) throw groupError
        if (active) setGroups((data ?? []) as Community[])
      } catch (caught) {
        if (active) setError(userFacingError(caught, 'Could not load your communities.'))
      } finally {
        if (active) setGroupsLoading(false)
      }
    })()
    return () => { active = false }
  }, [session?.user.id])

  function handleMediaChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setError('')
    if (!file) { setMediaFile(null); return }
    try {
      validatePostMedia(file)
      setMediaFile(file)
    } catch (caught) {
      event.target.value = ''
      setMediaFile(null)
      setError(userFacingError(caught, 'This media file could not be selected.'))
    }
  }

  function toggleCommunityDestination(enabled: boolean) {
    setShareCommunity(enabled)
    if (enabled) setCommunityPickerOpen(true)
  }

  function toggleGroup(id: string) {
    setSelectedGroupIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session?.user) { setError('Sign in before creating a post.'); return }
    if (!sharePublic && !shareCommunity) { setError('Choose at least one sharing destination.'); return }
    if (shareCommunity && !selectedGroupIds.length) { setCommunityPickerOpen(true); setError('Select at least one community group.'); return }
    if (!text.trim() && !mediaFile) { setError('Add some text or choose a photo/video.'); return }

    setIsSaving(true)
    setError('')
    const destinations: Array<{ group_id: string | null }> = [
      ...(sharePublic ? [{ group_id: null }] : []),
      ...(shareCommunity ? selectedGroupIds.map((group_id) => ({ group_id })) : []),
    ]
    const createdIds: string[] = []
    const uploadedPaths: string[] = []
    try {
      // The current schema stores one destination per post row. Create one row for
      // the public feed and one for each selected group, reusing the same content.
      for (const destination of destinations) {
        const { data, error: insertError } = await supabase.from('posts').insert({
          user_id: session.user.id,
          group_id: destination.group_id,
          content: text.trim(),
          media_urls: [],
          media_type: mediaFile?.type.startsWith('video/') ? 'video' : mediaFile ? 'image' : null,
        }).select('id').single()
        if (insertError) throw insertError
        createdIds.push(data.id)

        if (mediaFile) {
          const uploaded = await uploadPostMedia(mediaFile, session.user.id, data.id)
          uploadedPaths.push(uploaded.path)
          const { error: updateError } = await supabase.from('posts')
            .update({ media_urls: [uploaded.path], media_type: uploaded.type })
            .eq('id', data.id).eq('user_id', session.user.id)
          if (updateError) throw updateError
        }
      }
      navigate(`/posts/${createdIds[0]}`, { replace: true })
    } catch (caught) {
      if (uploadedPaths.length) await deletePostMedia(uploadedPaths).catch(() => undefined)
      if (createdIds.length) await supabase.from('posts').delete().in('id', createdIds).eq('user_id', session.user.id)
      setError(userFacingError(caught, 'Could not publish to all selected destinations. Please try again.'))
    } finally {
      setIsSaving(false)
    }
  }

  return <section className="page-stack page-stack--narrow">
    <header className="page-heading">
      <span className="eyebrow">MAKE SOMETHING TOGETHER</span>
      <h1>Create a post</h1>
      <p>Choose one or more places to share your post.</p>
    </header>
    <form className="create-post-box" onSubmit={submit}>
      <div className="post-card__author">
        <Avatar name={profile?.display_name || profile?.username || 'Your profile'} image={profile?.avatar_url ?? undefined} />
        <span><strong>{profile?.display_name || profile?.username || 'Your profile'}</strong><span>{sharePublic && shareCommunity ? 'Public + selected communities' : sharePublic ? 'Sharing publicly' : shareCommunity ? 'Sharing to selected communities' : 'Choose a destination below'}</span></span>
      </div>

      <div className="destination-options" style={{ display: 'grid', gap: 10, margin: '16px 0' }}>
        <label className="destination-option" style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--border, #ddd)', borderRadius: 14, padding: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={sharePublic} onChange={(event) => setSharePublic(event.target.checked)} />
          <Globe size={20} />
          <span style={{ flex: 1 }}><strong>Share to Public</strong><span style={{ display: 'block', opacity: .72, fontSize: 13 }}>Make this post available in the public feed.</span></span>
          {sharePublic && <Check size={18} />}
        </label>
        <label className="destination-option" style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--border, #ddd)', borderRadius: 14, padding: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={shareCommunity} onChange={(event) => toggleCommunityDestination(event.target.checked)} />
          <Users size={20} />
          <span style={{ flex: 1 }}><strong>Share to Community</strong><span style={{ display: 'block', opacity: .72, fontSize: 13 }}>{selectedGroupIds.length ? `${selectedGroupIds.length} group(s) selected` : 'Choose one or more of your groups.'}</span></span>
          {shareCommunity && <Check size={18} />}
        </label>
        {shareCommunity && <button type="button" className="button button--outline" onClick={() => setCommunityPickerOpen(true)}>Select community groups ({selectedGroupIds.length})</button>}
      </div>

      <label className="visually-hidden" htmlFor="post-text">Write your post</label>
      <textarea id="post-text" value={text} onChange={(event) => setText(event.target.value)} placeholder="What would you like to share?" maxLength={500} />
      <div className="create-post-media-picker">
        <label className="button button--outline" htmlFor="post-media">Add photo or video</label>
        <input id="post-media" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf,text/plain,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={handleMediaChange} />
        {mediaFile && <span className="micro-note">{mediaFile.name} · {(mediaFile.size / (1024 * 1024)).toFixed(1)} MB</span>}
        <span className="micro-note">JPG, PNG, WEBP, GIF, MP4, WebM or MOV · max 50 MB</span>
      </div>
      <div className="create-post-box__footer"><span>{text.length}/500</span><Button type="submit" disabled={(!text.trim() && !mediaFile) || isSaving || groupsLoading}>{isSaving ? 'Publishing…' : 'Share post'} {!isSaving && <Send size={16} />}</Button></div>
      {error && <p className="field__error" role="alert">{error}</p>}
    </form>

    {communityPickerOpen && <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommunityPickerOpen(false) }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.56)', display: 'grid', placeItems: 'center', padding: 18 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="community-picker-title" className="create-post-box" style={{ width: 'min(100%, 440px)', maxHeight: 'min(80dvh, 620px)', overflow: 'auto', background: 'var(--surface, #fff)', color: 'var(--text, #222)', boxShadow: '0 20px 70px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div><h2 id="community-picker-title" style={{ margin: 0 }}>Select communities</h2><p className="micro-note">Choose every group that should receive this post.</p></div>
          <button type="button" aria-label="Close community picker" className="button button--outline" onClick={() => setCommunityPickerOpen(false)}><X size={18} /></button>
        </div>
        {groupsLoading ? <Loading label="Loading your communities" /> : groups.length ? <div style={{ display: 'grid', gap: 8, margin: '16px 0' }}>{groups.map((group) => <label key={group.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, border: '1px solid var(--border, #ddd)', cursor: 'pointer' }}>
          <input type="checkbox" checked={selectedGroupIds.includes(group.id)} onChange={() => toggleGroup(group.id)} />
          <span style={{ flex: 1 }}>{group.name}</span>
          {selectedGroupIds.includes(group.id) && <Check size={18} />}
        </label>)}</div> : <p className="micro-note">You have not joined any community groups yet.</p>}
        <div className="create-post-box__footer"><span>{selectedGroupIds.length} selected</span><Button type="button" onClick={() => { setCommunityPickerOpen(false); if (selectedGroupIds.length) setError('') }}>Done</Button></div>
      </section>
    </div>}
  </section>
}
