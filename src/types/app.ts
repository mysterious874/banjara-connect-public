export type PreviewPost = {
  id: string
  name: string
  handle: string
  location: string
  time: string
  text: string
  image?: string
  imageAlt?: string
  likes: number
  comments: number
  initials: string
  avatarTone: 'green' | 'red' | 'blue' | 'orange'
}

export type PreviewUser = {
  name: string
  handle: string
  detail: string
  initials: string
  tone: 'green' | 'red' | 'blue' | 'orange'
}

export type ProfileRecord = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  location: string | null
  is_verified: boolean
}

export type ProfileUpdate = Partial<Pick<ProfileRecord, 'username' | 'display_name' | 'avatar_url' | 'bio' | 'location'>>

export type PostRecord = {
  id: string
  user_id: string
  group_id: string | null
  content: string
  created_at: string
  visibility: string | null
  media_urls?: string[]
  media_type?: string | null
}

export type PostMedia = {
  path: string
  type: 'image' | 'video'
  mimeType: string
  signedUrl: string
}

export type FeedPost = PostRecord & {
  author: Pick<ProfileRecord, 'id' | 'username' | 'display_name' | 'avatar_url' | 'location'> | null
  media: PostMedia[]
}

export type ToastApi = {
  notify: (message: string) => void
}
