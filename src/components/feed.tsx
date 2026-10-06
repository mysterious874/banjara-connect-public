import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, Check, Heart, MapPin, MessageCircle, MoreHorizontal, Pencil, Send, Trash2, X } from 'lucide-react'
import type { FeedPost } from '../types/app'
import { useAuth } from '../hooks/AuthProvider'
import { loadPostLikes, togglePostLike } from '../utils/socialData'
import { supabase } from '../utils/supabase'
import { deletePostMedia, type PostMediaData } from '../utils/mediaData'
import { userFacingError } from '../utils/userFacingError'
import { Avatar, Button, ConfirmationDialog } from './ui'

export function PostCard({ post, onDeleted }: { post: FeedPost; onDeleted?: () => void }) {
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
  const [postError, setPostError] = useState('')
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
  }, [post.id, session?.user.id])

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
        {isOwner && <div className="post-card__options"><button type="button" className="icon-button post-card__more" aria-label={`More options for ${authorName}'s post`} aria-expanded={showPostOptions} onClick={() => setShowPostOptions((open) => !open)}><MoreHorizontal size={20} /></button>{showPostOptions && <div className="post-card__options-menu"><button type="button" onClick={() => { setEditContent(postContent); setIsEditing(true); setShowPostOptions(false) }}><Pencil size={15} />Edit post</button><button type="button" onClick={() => { setShowDeleteConfirmation(true); setShowPostOptions(false) }}><Trash2 size={15} />Delete post</button></div>}</div>}
      </div>
      {isEditing ? <form className="post-edit-form" onSubmit={updatePost}><label className="visually-hidden" htmlFor={`post-edit-${post.id}`}>Edit your post</label><textarea id={`post-edit-${post.id}`} value={editContent} onChange={(event) => setEditContent(event.target.value)} maxLength={500} required /><div><Button type="button" variant="quiet" onClick={() => { setIsEditing(false); setEditContent(postContent) }} disabled={isSavingPost}><X size={15} />Cancel</Button><Button type="submit" disabled={isSavingPost || !editContent.trim()}><Check size={15} />{isSavingPost ? 'Saving…' : 'Save'}</Button></div></form> : <p className="post-card__text">{postContent}</>}
      {((post as FeedPost & { media?: PostMediaData[] }).media ?? []).map((media) => media.signedUrl ? (
        media.type === 'video'
          ? <video key={media.path} className="post-card__media" src={media.signedUrl} controls playsInline preload="metadata" />
          : <img key={media.path} className="post-card__media" src={media.signedUrl} alt={media.name || 'Post media'} loading="lazy" />
      ) : null)}
      <div className="post-card__meta"><span>{post.visibility ?? 'Community post'} · {new Date(post.created_at).toLocaleString()}</span><span>{isLikeLoading ? 'Loading likes…' : `${likeCount} likes`}</span></div>
      <div className="post-card__actions">
        <button type="button" className={`post-action${liked ? ' is-liked' : ''}`} disabled={isLikeLoading || isLikePending || !session} onClick={handleLike} aria-pressed={liked}>
          <Heart size={19} fill={liked ? 'currentColor' : 'none'} /><span>{isLikePending ? 'Saving…' : liked ? 'Liked' : 'Like'}</span>
        </button>
        <Link className="post-action" to={`/posts/${post.id}/comments`}><MessageCircle size={19} /><span>Comment</span></Link>
        <button type="button" className="post-action" disabled title="Sharing is not connected yet"><Send size={18} /><span>Share</span></button>
        <button type="button" className="post-action post-action--save" disabled title="Saving posts is not connected yet" aria-label="Save post unavailable"><Bookmark size={18} /></button>
      </div>
      {likeError && <p className="field__error" role="alert">{likeError}</p>}
      {postError && <p className="field__error" role="alert">{postError}</p>}
      <ConfirmationDialog open={showDeleteConfirmation} title="Delete this post?" description="This removes your post from the community. This action cannot be undone." confirmLabel={isDeletingPost ? 'Deleting…' : 'Delete post'} onClose={() => { if (!isDeletingPost) setShowDeleteConfirmation(false) }} onConfirm={() => void deletePost()} />
    </article>
  )
}

export function PostComposer({ name, image }: { name: string; image?: string | null }) {
  return <div className="composer"><Avatar name={name} image={image ?? undefined} /><Link to="/create" className="composer__prompt">Share a moment with your community...</Link><Button to="/create" variant="quiet" iconOnly aria-label="Create a post"><Send size={18} /></Button></div>
}
