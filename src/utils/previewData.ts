import type { PreviewPost, PreviewUser } from '../types/app'

export const previewUsers: PreviewUser[] = [
  { name: 'Meera Pawar', handle: 'meerawoven', detail: 'Nashik', initials: 'MP', tone: 'orange' },
  { name: 'Kiran Rathod', handle: 'kiran.r', detail: 'Indore', initials: 'KR', tone: 'blue' },
  { name: 'Sonal Banjara', handle: 'sonal.b', detail: 'Udaipur', initials: 'SB', tone: 'red' },
]

export const previewPosts: PreviewPost[] = [
  {
    id: 'loom-day', name: 'Meera Pawar', handle: 'meerawoven', location: 'Nashik, Maharashtra', time: '2h',
    text: 'A morning with my auntie at the loom. Every thread carries a little bit of home. Sharing a detail from the piece we have been working on together.',
    image: '/loom-preview.svg', imageAlt: 'Illustrated Banjara-inspired textile detail in green, red, saffron, and blue',
    likes: 28, comments: 6, initials: 'MP', avatarTone: 'orange',
  },
  {
    id: 'market-morning', name: 'Kiran Rathod', handle: 'kiran.r', location: 'Indore, Madhya Pradesh', time: '5h',
    text: 'The Sunday market is full of color today. Ran into three cousins before I even reached the chai stall. That is community for you.',
    likes: 41, comments: 9, initials: 'KR', avatarTone: 'blue',
  },
  {
    id: 'song-circle', name: 'Sonal Banjara', handle: 'sonal.b', location: 'Udaipur, Rajasthan', time: '1d',
    text: 'We are gathering for songs this weekend. If you are nearby, bring a memory, a verse, or just yourself. Everyone is welcome.',
    likes: 63, comments: 14, initials: 'SB', avatarTone: 'red',
  },
]
