export type DeveloperFocus = {
  title: string
  text: string
}

export const developerProfile = {
  name: 'Harish Lahu Rathod',
  role: 'Founder & Developer — Banjara Connect',
  bio: 'Harish Lahu Rathod is the founder and developer of Banjara Connect. No additional personal biography has been provided for publication.',
  about: 'The project is being developed as a digital place for community connection, cultural knowledge and shared stories.',
  why: 'I started building Banjara Connect to create a digital place for community connection, cultural knowledge and shared stories, and to make discovery and communication easier.',
  vision: 'A welcoming digital future where people can connect, learn from one another and help preserve community knowledge with care.',
  mission: 'Build practical, respectful tools for community discovery, communication and knowledge sharing without flattening regional differences.',
  technology: 'Phase 1 is a frontend built with React, TypeScript, Vite and React Router. Authentication, databases, APIs and other backend services are not part of this phase.',
  developmentJourney: 'The project is being delivered in phases. This phase focuses on the user interface, navigation and community information; later work can be planned separately.',
  publicProjectInfo: [
    { label: 'Project', value: 'Banjara Connect' },
    { label: 'Current phase', value: 'Phase 1 · frontend only' },
    { label: 'Purpose', value: 'Community connection and cultural knowledge sharing' },
  ],
  focusAreas: [
    { title: 'Community connection', text: 'Make it easier to discover people, groups and shared interests across distance.' },
    { title: 'Cultural preservation', text: 'Make room for stories, language and knowledge shared by their keepers.' },
    { title: 'Respectful participation', text: 'Support a safer, inclusive space without claiming to represent every community.' },
  ] satisfies DeveloperFocus[],
  portraitAlt: 'Harish Lahu Rathod - Founder and Developer of Banjara Connect',
  portraitStatus: 'The approved founder photo is not available in the current workspace.',
}

export type DeveloperProfile = typeof developerProfile
