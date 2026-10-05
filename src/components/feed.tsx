import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, Heart, MapPin, MessageCircle, MoreHorizontal, Send } from 'lucide-react'
import type { PreviewPost, ToastApi } from '../types/app'
import { Avatar, Button } from './ui'

export function PostCard({ post, notify }: { post: PreviewPost; notify: ToastApi['notify'] }) {
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  return <article className="post-card"><div className="post-card__head"><Link to={`/profile/${post.handle}`} className="post-card__author"><Avatar name={post.name} initials={post.initials} tone={post.avatarTone} /><span><strong>{post.name}</strong><span><MapPin size={12} />{post.location} · {post.time}</span></span></Link><button type="button" className="icon-button post-card__more" aria-label={`More options for ${post.name}'s preview post`} onClick={() => notify('Post options are not connected in this frontend preview.')}><MoreHorizontal size={20} /></button></div><p className="post-card__text">{post.text}</p>{post.image && <div className="post-card__image-wrap"><img className="post-card__image" src={post.image} alt={post.imageAlt ?? 'Community moment shared in the local preview'} loading="lazy" /><span className="image-caption">COMMUNITY PREVIEW</span></div>}<div className="post-card__meta"><span>{post.likes + Number(liked)} appreciations</span><Link to={`/posts/${post.id}/comments`}>{post.comments} comments</Link></div><div className="post-card__actions"><button type="button" className={`post-action${liked ? ' is-liked' : ''}`} onClick={() => setLiked(!liked)} aria-pressed={liked}><Heart size={19} fill={liked ? 'currentColor' : 'none'} /><span>{liked ? 'Appreciated' : 'Appreciate'}</span></button><Link className="post-action" to={`/posts/${post.id}/comments`}><MessageCircle size={19} /><span>Comment</span></Link><button type="button" className="post-action" onClick={() => notify('Sharing is not connected in this frontend preview.')}><Send size={18} /><span>Share</span></button><button type="button" className={`post-action post-action--save${saved ? ' is-saved' : ''}`} onClick={() => setSaved(!saved)} aria-label={saved ? 'Remove saved post' : 'Save post'} aria-pressed={saved}><Bookmark size={18} fill={saved ? 'currentColor' : 'none'} /></button></div></article>
}

export function PostComposer({ notify }: { notify: ToastApi['notify'] }) {
  return <div className="composer"><Avatar name="Asha Rathod" initials="AR" tone="red" /><button type="button" className="composer__prompt" onClick={() => notify('Post creation is a local preview. No post will be published.')}>Share a moment with your community...</button><Button to="/create" variant="quiet" iconOnly aria-label="Create a post"><Send size={18} /></Button></div>
}
