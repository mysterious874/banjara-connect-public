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

export type ToastApi = {
  notify: (message: string) => void
}
