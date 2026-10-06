export type DeveloperFocus = {
  title: string
  text: string
}

export const developerProfile = {
  credit: 'Made by the Proud गोरवंशी 🏳️',
  about: 'The project is being developed as a digital place for community connection, cultural knowledge and shared stories.',
  why: 'I started building Banjara Connect to create a digital place for community connection, cultural knowledge and shared stories, and to make discovery and communication easier.',
  vision: 'A welcoming digital future where people can connect, learn from one another and help preserve community knowledge with care.',
  mission: 'Build practical, respectful tools for community discovery, communication and knowledge sharing without flattening regional differences.',
  technology: 'Banjara Connect uses React, TypeScript, Vite and React Router, with Supabase authentication and database-backed features.',
  developmentJourney: 'The project is being delivered in phases, with community features built alongside their supporting authentication and data services.',
  publicProjectInfo: [
    { label: 'Project', value: 'Banjara Connect' },
    { label: 'Current phase', value: 'Community platform development' },
    { label: 'Purpose', value: 'Community connection and cultural knowledge sharing' },
  ],
  focusAreas: [
    { title: 'Community connection', text: 'Make it easier to discover people, groups and shared interests across distance.' },
    { title: 'Cultural preservation', text: 'Make room for stories, language and knowledge shared by their keepers.' },
    { title: 'Respectful participation', text: 'Support a safer, inclusive space without claiming to represent every community.' },
  ] satisfies DeveloperFocus[],
}

export type DeveloperProfile = typeof developerProfile
