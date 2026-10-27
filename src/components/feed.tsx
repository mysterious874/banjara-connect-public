import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, Check, Heart, MapPin, MessageCircle, MoreHorizontal, Pencil, Send, Trash2, X } from 'lucide-react'
import type { FeedPost } from '../types/app'
import { useAuth } from '../hooks/AuthProvider'
import { loadPostLikes, togglePostLike } from '../utils/socialData'
import { supabase } from '../utils/supabase'
import { deletePostMedia, type PostMediaData } from '../utils/mediaData'
import { userFacingError } from '../utils/userFacingError'
import { createReport } from '../utils/reportData'
import { loadConversations, sendConversationMessage, type ConversationSummary } from '../utils/chatData'
import { Avatar, Button, ConfirmationDialog, EmptyState, Loading, useBodyScrollLock } from './ui'

export function PostCard({ post, onDeleted, initialLikeState }: { post: FeedPost; onDeleted?: () => void; initialLikeState?: { count: number; liked: boolean } }) {
  const { session } = useAuth()
  const [likeCount, setLikeCount] = useState(0)
  const [liked, setLiked] = useState(false)
  const [isLikeLoading, setIsLikeLoading] = useState(true)
  const [isLikePending, setIsLikePending] = useState(false)
  const [likeError, setLikeError] = useState('')
  const [postContent, setPostContent] = useState(post.content)
  const [editContent, setEditContent] = useState(post.content)
  const [isEditing, setIsEditing] = useState(false)
  const [isSavingPost, setIsSavingPost] = useState(false)
  const [isDeletingPost, setIsDeletingPost] = useState(false)
  const [showPostOptions, setShowPostOptions] = useState(false)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [reportReason, setReportReason] = useState('harassment')
  const [reportDetails, setReportDetails] = useState('')
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportSuccess, setReportSuccess] = useState(false)
  const [postError, setPostError] = useState('')
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [selectedConversationIds, setSelectedConversationIds] = useState<string[]>([])
  const [isShareLoading, setIsShareLoading] = useState(false)
  const [isShareSending, setIsShareSending] = useState(false)
  const [shareError, setShareError] = useState('')
  const [shareSuccess, setShareSuccess] = useState('')
  const [previewMedia, setPreviewMedia] = useState<PostMediaData | null>(null)
  useBodyScrollLock(Boolean(previewMedia))
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)
  const isOwner = session?.user.id === post.user_id
  const authorName = post.author?.display_name || post.author?.username || 'Community member'
  const authorContent = <><Avatar name={authorName} image={post.author?.avatar_url ?? undefined} /><span><strong>{authorName}</strong><span>{post.author?.location && <><MapPin size={12} />{post.author.location} · </>}{new Date(post.created_at).toLocaleString()}</span></span></>

  useEffect(() => {
    let active = true
    setLikeCount(0)
    setLiked(false)
    if (!session?.user) {
      setIsLikeLoading(false)
      return () => { active = false }
    }
    if (initialLikeState) {
      setLikeCount(initialLikeState.count)
      setLiked(initialLikeState.liked)
      setIsLikeLoading(false)
      return () => { active = false }
    }
    setIsLikeLoading(true)
    setLikeError('')
    loadPostLikes(post.id).then((state) => {
      if (!active) return
      setLikeCount(state.count)
      setLiked(state.liked)
    }).catch((error: unknown) => {
      if (active) setLikeError(userFacingError(error, 'Could not load post likes.'))
    }).finally(() => {
      if (active) setIsLikeLoading(false)
    })
    return () => { active = false }
  }, [initialLikeState, post.id, session?.user.id])

  async function handleLike() {
    if (!session?.user || isLikeLoading || isLikePending) return
    setIsLikePending(true)
    setLikeError('')
    try {
      const state = await togglePostLike(post.id, liked)
      setLikeCount(state.count)
      setLiked(state.liked)
    } catch (error) {
      setLikeError(userFacingError(error, 'Could not update the post like.'))
    } finally {
      setIsLikePending(false)
    }
  }

  async function updatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = editContent.trim()
    if (!session?.user || !isOwner || !content || isSavingPost) return
    setIsSavingPost(true)
    setPostError('')
    try {
      const { data, error } = await supabase.from('posts')
        .update({ content })
        .eq('id', post.id)
        .eq('user_id', session.user.id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('This post could not be updated. It may have been removed or you may not own it.')
      setPostContent(content)
      setIsEditing(false)
      setShowPostOptions(false)
    } catch (caught) {
      setPostError(userFacingError(caught, 'Could not update this post.'))
    } finally {
      setIsSavingPost(false)
    }
  }

  useEffect(() => {
    if (!showShareDialog) return
    let active = true
    setIsShareLoading(true)
    setShareError('')
    setShareSuccess('')
    setSelectedConversationIds([])
    loadConversations()
      .then((items) => {
        if (active) setConversations(items)
      })
      .catch((caught: unknown) => {
        if (active) setShareError(userFacingError(caught, 'Could not load conversations.'))
      })
      .finally(() => {
        if (active) setIsShareLoading(false)
      })
    return () => { active = false }
  }, [showShareDialog])

  function toggleShareConversation(conversationId: string) {
    setSelectedConversationIds((current) =>
      current.includes(conversationId)
        ? current.filter((id) => id !== conversationId)
        : [...current, conversationId],
    )
  }

  async function sharePost() {
    if (!session?.user || !selectedConversationIds.length || isShareSending) return
    setIsShareSending(true)
    setShareError('')
    setShareSuccess('')
    try {
      const message = [
        `📌 Shared post from ${authorName}`,
        '',
        postContent.trim() || 'Photo/video post',
        '',
        `/posts/${post.id}`,
      ].join('\n')
      let sent = 0
      for (const conversationId of selectedConversationIds) {
        await sendConversationMessage(conversationId, message)
        sent += 1
      }
      setShareSuccess(`Post shared to ${sent} conversation${sent === 1 ? '' : 's'}.`)
      setSelectedConversationIds([])
    } catch (caught) {
      setShareError(userFacingError(caught, 'Could not share this post.'))
    } finally {
      setIsShareSending(false)
    }
  }

  function clearMediaLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function startMediaLongPress(media: PostMediaData) {
    clearMediaLongPress()
    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      setPreviewMedia(media)
    }, 450)
  }

  function cancelMediaLongPress() {
    clearMediaLongPress()
  }

  useEffect(() => () => clearMediaLongPress(), [])

  async function deletePost() {
    if (!session?.user || !isOwner || isDeletingPost) return
    setIsDeletingPost(true)
    setPostError('')
    try {
      const media = ((post as FeedPost & { media?: PostMediaData[] }).media ?? [])
      await deletePostMedia(media.map((item) => item.path))
      const { data, error } = await supabase.from('posts')
        .delete()
        .eq('id', post.id)
        .eq('user_id', session.user.id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('This post could not be deleted. It may have been removed or you may not own it.')
      setShowDeleteConfirmation(false)
      onDeleted?.()
    } catch (caught) {
      setPostError(userFacingError(caught, 'Could not delete this post.'))
    } finally {
      setIsDeletingPost(false)
    }
  }

  return (
    <article className="post-card">
      <div className="post-card__head">
        {post.author ? <Link to={`/profile/${post.author.username || post.author.id}`} className="post-card__author">{authorContent}</Link> : <div className="post-card__author">{authorContent}</div>}
        {session?.user && <div className="post-card__options"><button type="button" className="icon-button post-card__more" aria-label={`More options for ${authorName}'s post`} aria-expanded={showPostOptions} onClick={() => setShowPostOptions((open) => !open)}><MoreHorizontal size={20} /></button>{showPostOptions && <div className="post-card__options-menu">{isOwner ? <><button type="button" onClick={() => { setEditContent(postContent); setIsEditing(true); setShowPostOptions(false) }}><Pencil size={15} />Edit post</button><button type="button" onClick={() => { setShowDeleteConfirmation(true); setShowPostOptions(false) }}><Trash2 size={15} />Delete post</button></> : <button type="button" onClick={() => { setShowPostOptions(false); setReportError(''); setReportSuccess(false); setShowReportDialog(true) }}><span aria-hidden="true">⚑</span>Report post</button>}</div>}</div>}
      </div>
      {isEditing ? <form className="post-edit-form" onSubmit={updatePost}><label className="visually-hidden" htmlFor={`post-edit-${post.id}`}>Edit your post</label><textarea id={`post-edit-${post.id}`} value={editContent} onChange={(event) => setEditContent(event.target.value)} maxLength={500} required /><div><Button type="button" variant="quiet" onClick={() => { setIsEditing(false); setEditContent(postContent) }} disabled={isSavingPost}><X size={15} />Cancel</Button><Button type="submit" disabled={isSavingPost || !editContent.trim()}><Check size={15} />{isSavingPost ? 'Saving…' : 'Save'}</Button></div></form> : <p className="post-card__text">{postContent}</p>}
      {((post as FeedPost & { media?: PostMediaData[] }).media ?? []).map((media) => media.signedUrl ? (
        <div
          key={media.path}
          className={`post-card__media-hold${longPressTriggered.current ? ' is-long-pressing' : ''}`}
          onPointerDown={() => startMediaLongPress(media)}
          onPointerUp={cancelMediaLongPress}
          onPointerCancel={cancelMediaLongPress}
          onPointerLeave={cancelMediaLongPress}
          onContextMenu={(event) => event.preventDefault()}
        >
          {media.type === 'video'
            ? <video className="post-card__media post-card__video" src={media.signedUrl} controls playsInline preload="metadata" />
            : <img className="post-card__media" src={media.signedUrl} alt="Post media" loading="lazy" />}
        </div>
      ) : null)}
      {previewMedia?.signedUrl && <div className="media-preview-backdrop" role="presentation" onClick={() => setPreviewMedia(null)}>
        <div className="media-preview-dialog" role="dialog" aria-modal="true" aria-label="Media preview" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="media-preview-close" aria-label="Close media preview" onClick={() => setPreviewMedia(null)}><X size={22} /></button>
          {previewMedia.type === 'video'
            ? <video className="media-preview-content" src={previewMedia.signedUrl} controls autoPlay playsInline />
            : <img className="media-preview-content" src={previewMedia.signedUrl} alt="Post media preview" />}
        </div>
      </div>}
      <div className="post-card__meta"><span>{post.visibility ?? 'Community post'} · {new Date(post.created_at).toLocaleString()}</span><span>{isLikeLoading ? 'Loading likes…' : `${likeCount} likes`}</span></div>
      <div className="post-card__actions">
        <button type="button" className={`post-action${liked ? ' is-liked' : ''}`} disabled={isLikeLoading || isLikePending || !session} onClick={handleLike} aria-pressed={liked}>
          <Heart size={19} fill={liked ? 'currentColor' : 'none'} /><span>{isLikePending ? 'Saving…' : liked ? 'Liked' : 'Like'}</span>
        </button>
        <Link className="post-action" to={`/posts/${post.id}/comments`}><MessageCircle size={19} /><span>Comment</span></Link>
        <button type="button" className="post-action" disabled={!session || isShareSending} onClick={() => setShowShareDialog(true)}><Send size={18} /><span>Share</span></button>
        <button type="button" className="post-action post-action--save" disabled title="Saving posts is not connected yet" aria-label="Save post unavailable"><Bookmark size={18} /></button>
      </div>
      {likeError && <p className="field__error" role="alert">{likeError}</p>}
      {postError && <p className="field__error" role="alert">{postError}</p>}
      {showShareDialog && <div className="share-dialog-backdrop" role="presentation" onClick={() => !isShareSending && setShowShareDialog(false)}>
        <div className="share-dialog" role="dialog" aria-modal="true" aria-labelledby={`share-post-title-${post.id}`} onClick={(event) => event.stopPropagation()}>
          <div className="share-dialog__head">
            <div><span className="eyebrow">SEND TO YOUR CIRCLE</span><h2 id={`share-post-title-${post.id}`}>Share post</h2></div>
            <button type="button" className="icon-button" aria-label="Close share dialog" onClick={() => setShowShareDialog(false)} disabled={isShareSending}><X size={19} /></button>
          </div>
          <div className="share-dialog__post"><strong>{authorName}</strong><p>{postContent || 'Photo/video post'}</p></div>
          {isShareLoading ? <Loading label="Loading conversations" /> : conversations.length ? <div className="share-dialog__list">{conversations.map((conversation) => {
            const name = conversation.member.display_name || conversation.member.username || 'Community member'
            const selected = selectedConversationIds.includes(conversation.id)
            return <button type="button" className={`share-conversation${selected ? ' is-selected' : ''}`} key={conversation.id} onClick={() => toggleShareConversation(conversation.id)} disabled={isShareSending}>
              <Avatar name={name} image={conversation.member.avatar_url ?? undefined} />
              <span><strong>{name}</strong><small>{conversation.lastMessage?.content || 'Conversation'}</small></span>
              <span className="share-conversation__check">{selected ? '✓' : ''}</span>
            </button>
          })}</div> : <EmptyState title="No conversations yet" description="Start a chat with a community member first, then you can share posts here." />}
          {shareError && <p className="field__error" role="alert">{shareError}</p>}
          {shareSuccess && <p className="micro-note" role="status">{shareSuccess}</p>}
          <div className="share-dialog__footer">
            <Button type="button" variant="quiet" onClick={() => setShowShareDialog(false)} disabled={isShareSending}>Close</Button>
            <Button type="button" onClick={() => void sharePost()} disabled={!selectedConversationIds.length || isShareSending || isShareLoading}>{isShareSending ? 'Sending…' : `Send${selectedConversationIds.length ? ` · ${selectedConversationIds.length}` : ''}`} <Send size={15} /></Button>
          </div>
        </div>
      </div>}
      {showReportDialog && <div className="share-dialog-backdrop" role="presentation" onClick={() => !isSubmittingReport && setShowReportDialog(false)}>
        <div className="share-dialog" role="dialog" aria-modal="true" aria-labelledby={`report-post-title-${post.id}`} onClick={(event) => event.stopPropagation()}>
          <div className="share-dialog__head">
            <div><span className="eyebrow">HELP KEEP CONNECT SAFE</span><h2 id={`report-post-title-${post.id}`}>{reportSuccess ? 'Report submitted' : 'Report post'}</h2></div>
            <button type="button" className="icon-button" aria-label="Close report dialog" onClick={() => setShowReportDialog(false)} disabled={isSubmittingReport}><X size={19} /></button>
          </div>
          {reportSuccess ? <><p className="micro-note" role="status">Thanks for letting us know. Your report has been submitted for review.</p><div className="share-dialog__footer"><Button type="button" onClick={() => setShowReportDialog(false)}>Done</Button></div></> : <>
            <div className="share-dialog__post"><strong>Reporting {authorName}'s post</strong><p>{postContent || 'Photo/video post'}</p></div>
            <label className="field"><span className="field__label">Reason for report</span><span className="field__control-wrap"><select className="field__control" value={reportReason} onChange={(event) => setReportReason(event.target.value)} disabled={isSubmittingReport}>
              <option value="harassment">Harassment or bullying</option>
              <option value="hate">Hate or discrimination</option>
              <option value="violence">Violence or dangerous content</option>
              <option value="sexual">Sexual content</option>
              <option value="spam">Spam or scam</option>
              <option value="misinformation">False or misleading information</option>
              <option value="other">Something else</option>
            </select></span></label>
            <label className="field"><span className="field__label">Additional details (optional)</span><textarea className="field__control" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1000} rows={3} placeholder="Tell us a little more…" disabled={isSubmittingReport} /></label>
            {reportError && <p className="field__error" role="alert">{reportError}</p>}
            <div className="share-dialog__footer">
              <Button type="button" variant="quiet" onClick={() => setShowReportDialog(false)} disabled={isSubmittingReport}>Cancel</Button>
              <Button type="button" variant="danger" disabled={isSubmittingReport} onClick={() => {
                if (!session?.user || isSubmittingReport) return
                setIsSubmittingReport(true)
                setReportError('')
                void createReport({ postId: post.id }, reportReason, reportDetails).then(() => {
                  setReportSuccess(true)
                }).catch((caught: unknown) => {
                  setReportError(userFacingError(caught, 'Could not submit this report. Please try again.'))
                }).finally(() => setIsSubmittingReport(false))
              }}>{isSubmittingReport ? 'Submitting…' : 'Submit report'}</Button>
            </div>
          </>}
        </div>
      </div>}
      <ConfirmationDialog open={showDeleteConfirmation} title="Delete this post?" description="This removes your post from the community. This action cannot be undone." confirmLabel={isDeletingPost ? 'Deleting…' : 'Delete post'} onClose={() => { if (!isDeletingPost) setShowDeleteConfirmation(false) }} onConfirm={() => void deletePost()} />
    </article>
  )
}

export function PostComposer({ name, image }: { name: string; image?: string | null }) {
  return <div className="composer"><Avatar name={name} image={image ?? undefined} /><Link to="/create" className="composer__prompt">Share a moment with your community...</Link><Button to="/create" variant="quiet" iconOnly aria-label="Create a post"><Send size={18} /></Button></div>
}
