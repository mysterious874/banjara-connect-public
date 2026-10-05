import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, Heart, MapPin, MessageCircle, MoreHorizontal, Send } from 'lucide-react'
import type { FeedPost } from '../types/app'
import { useAuth } from '../hooks/AuthProvider'
import { loadPostLikes, togglePostLike } from '../utils/socialData'
import { Avatar, Button } from './ui'

export function PostCard({ post }: { post: FeedPost }) {
  const { session } = useAuth()
  const [likeCount, setLikeCount] = useState(0)
  const [liked, setLiked] = useState(false)
  const [isLikeLoading, setIsLikeLoading] = useState(true)
  const [isLikePending, setIsLikePending] = useState(false)
  const [likeError, setLikeError] = useState('')
  const authorName = post.author?.display_name || post.author?.username || 'Community member'
  const authorContent = <><Avatar name={authorName} image={post.author?.avatar_url ?? undefined} /><span><strong>{authorName}</strong><span>{post.author?.location && <><MapPin size={12} />{post.author.location} · </>}{new Date(post.created_at).toLocaleString()}</span></span></>

  useEffect(() => {
    let active = true
    if (!session?.user) {
      setLikeCount(0)
      setLiked(false)
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
      if (active) setLikeError(error instanceof Error ? error.message : 'Could not load post likes.')
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
      setLikeError(error instanceof Error ? error.message : 'Could not update the post like.')
    } finally {
      setIsLikePending(false)
    }
  }

  return (
    <article className="post-card">
      <div className="post-card__head">
        {post.author ? <Link to={`/profile/${post.author.username}`} className="post-card__author">{authorContent}</Link> : <div className="post-card__author">{authorContent}</div>}
        <button type="button" className="icon-button post-card__more" aria-label={`More options for ${authorName}'s post`} disabled><MoreHorizontal size={20} /></button>
      </div>
      <p className="post-card__text">{post.content}</p>
      <div className="post-card__meta"><span>{post.visibility ?? 'Community post'} · {new Date(post.created_at).toLocaleString()}</span><span>{isLikeLoading ? 'Loading likes…' : `${likeCount} likes`}</span></div>
      <div className="post-card__actions">
        <button type="button" className={`post-action${liked ? ' is-liked' : ''}`} disabled={isLikeLoading || isLikePending || !session} onClick={handleLike} aria-pressed={liked}>
          <Heart size={19} fill={liked ? 'currentColor' : 'none'} /><span>{isLikePending ? 'Saving…' : liked ? 'Liked' : 'Like'}</span>
        </button>
        <Link className="post-action" to={`/posts/${post.id}/comments`}><MessageCircle size={19} /><span>Comment</span></Link>
        <button type="button" className="post-action" disabled title="Sharing is not connected yet"><Send size={18} /><span>Share</span></button>
        <button type="button" className="post-action post-action--save" disabled aria-label="Save post"><Bookmark size={18} /></button>
      </div>
      {likeError && <p className="field__error" role="alert">{likeError}</p>}
    </article>
  )
}

export function PostComposer({ name, image }: { name: string; image?: string | null }) {
  return <div className="composer"><Avatar name={name} image={image ?? undefined} /><Link to="/create" className="composer__prompt">Share a moment with your community...</Link><Button to="/create" variant="quiet" iconOnly aria-label="Create a post"><Send size={18} /></Button></div>
}
