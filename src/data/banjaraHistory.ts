export type HeritageSource = {
  id: string
  title: string
  author: string
  publisher: string
  year: string
  scope: string
  url: string
}

export type HeritageSection = {
  id: string
  number: string
  title: string
  text: string
  sources: string[]
}

export type HeritageTopic = {
  id: string
  title: string
  description: string
  sources: string[]
}

export const heritageTimeline = [
  {
    period: 'Long historical background',
    title: 'Regional histories, not one origin date',
    text: 'Origin accounts and migration narratives differ. The sources reviewed here do not establish one definitive starting point for all Banjara communities.',
    sources: ['bikku', 'oral'],
  },
  {
    period: 'Before colonial rule',
    title: 'Caravan trade and mobility',
    text: 'Historical research describes Banjara groups in the Deccan as caravan traders and livestock breeders within particular pre-British regional economies.',
    sources: ['bikku'],
  },
  {
    period: 'Colonial period',
    title: 'Restrictions and criminalization',
    text: 'The 1871 Criminal Tribes Act formed part of colonial policies that restricted some nomadic communities. Its application and effects were not identical for every group or region.',
    sources: ['bikku', 'srmap'],
  },
  {
    period: 'After Independence',
    title: 'Changing livelihoods and classifications',
    text: 'Mobility, settlement, work, and administrative classification continued to change. Government commissions have addressed the distinct concerns of denotified and nomadic communities.',
    sources: ['bikku', 'pib-renke'],
  },
  {
    period: '2011 and after',
    title: 'Languages in a multilingual country',
    text: 'The Census of India publishes a national language atlas; separate linguistic research documents Lambadi language contact in a specific Telangana cohort.',
    sources: ['census', 'language'],
  },
  {
    period: 'Living heritage',
    title: 'Knowledge carried forward',
    text: 'Embroidery, performance, language, and oral knowledge continue in varied local settings, with community members shaping what is preserved and how it is shared.',
    sources: ['map', 'asia-inch', 'oral'],
  },
]

export const heritageSections: HeritageSection[] = [
  {
    id: 'who', number: '01', title: 'Who are the Banjara, Lambadi and Lambani communities?',
    text: 'Banjara is a broad community name used in historical and contemporary writing. Lambadi, Lambani and related names are also used in regional contexts. These labels do not replace the names people use for themselves, and they should not be treated as identical in every state or family.',
    sources: ['bikku', 'map', 'pib-renke'],
  },
  {
    id: 'names', number: '02', title: 'Historical names and terminology',
    text: 'Written records, census schedules, local administration and community speech may use different spellings and names. A label may describe a language, a regional community, or an administrative category; ask which term a person or community prefers.',
    sources: ['map', 'census', 'pib-renke'],
  },
  {
    id: 'origins', number: '03', title: 'Origins and migration theories',
    text: 'Accounts of origin and migration vary across oral histories and historical interpretations. The evidence reviewed for this page does not settle one pan-community origin story. It presents origin claims as debated rather than as confirmed ancestry.',
    sources: ['bikku', 'oral'],
  },
  {
    id: 'background', number: '04', title: 'Historical background',
    text: 'Regional studies place Banjara communities within long histories of mobility, exchange and adaptation. The surviving record is uneven: local memory and oral accounts can preserve experiences that administrative archives do not describe in the same way.',
    sources: ['bikku', 'oral'],
  },
  {
    id: 'trade', number: '05', title: 'Movement, transport and trade',
    text: 'A study of pre-British India describes Banjara groups in the Deccan as caravan traders and livestock breeders. This is evidence about particular historical economies, not a claim that every Banjara family followed the same occupation.',
    sources: ['bikku', 'srmap'],
  },
  {
    id: 'livelihoods', number: '06', title: 'Traditional and changing livelihoods',
    text: 'Trade and transport are prominent in some historical accounts. Ethnographic work also records livelihood change, including movement into settled agriculture and other work. Occupations differ by place, period and household.',
    sources: ['bikku', 'map'],
  },
  {
    id: 'settlements', number: '07', title: 'Settlement across India',
    text: 'Sources describe Banjara communities across multiple parts of central, western and southern India. Settlement patterns and state classifications vary; no single map or regional label represents all communities.',
    sources: ['bikku', 'map', 'pib-renke'],
  },
  {
    id: 'language', number: '08', title: 'Banjara and Gor language traditions',
    text: 'Lambadi is the focus of published linguistic research, including a study of Telugu–Lambadi language contact among young people from Nalgonda living in Hyderabad. This regional sample should not be generalized to all speakers; multilingualism and naming practices vary.',
    sources: ['language', 'census'],
  },
  {
    id: 'dress', number: '09', title: 'Traditional clothing',
    text: 'Documented Lambani clothing in Sandur, Karnataka includes embroidered garments and accessories. Dress changes by region, generation, occasion and personal choice; a photographed outfit is not a universal Banjara uniform.',
    sources: ['asia-inch', 'map'],
  },
  {
    id: 'embroidery', number: '10', title: 'Embroidery and textile traditions',
    text: 'Museum documentation describes Banjara embroidery using colourful geometric stitching, patchwork and materials such as mirrors, beads, cowries and metal pieces. Techniques and meanings belong to specific makers and local traditions, and evolve over time.',
    sources: ['map', 'asia-inch'],
  },
  {
    id: 'jewellery', number: '11', title: 'Jewellery and adornment',
    text: 'A Sandur-focused craft record describes regional use of silver, brass, white-metal and bone accessories alongside embroidered garments. Materials and forms vary, so this example should not be read as a requirement or a pan-community dress code.',
    sources: ['asia-inch', 'map'],
  },
  {
    id: 'music', number: '12', title: 'Music',
    text: 'A Telangana study documents oral literature that includes songs alongside stories, proverbs and chants. Names, repertoire and performance settings vary; community recordings should be shared with the knowledge and consent of their keepers.',
    sources: ['oral'],
  },
  {
    id: 'dance', number: '13', title: 'Dance',
    text: 'Lambadi dance is documented in regional Andhra Pradesh and Telangana contexts. A university cultural event recorded one Telangana performance; this is a regional example, not a single dance form practiced identically everywhere.',
    sources: ['dance', 'ncu'],
  },
  {
    id: 'festivals', number: '14', title: 'Festivals and celebrations',
    text: 'Celebrations are shaped by locality, faith, family and community. One Telangana university event paired a Lambadi dance performance with Bathukamma; it documents that event, not a universal Banjara festival calendar.',
    sources: ['ncu'],
  },
  {
    id: 'oral', number: '15', title: 'Oral traditions and storytelling',
    text: 'A Telangana-focused study describes folk songs, stories, proverbs and chants as part of Banjara oral literature. Oral history is living knowledge: recorders should identify narrators, preserve context and seek permission before publication.',
    sources: ['oral'],
  },
  {
    id: 'oral-history', number: '16', title: 'Oral history and community memory',
    text: 'Family and community memories can add perspectives not present in administrative records. A Telangana-focused publication examines Banjara oral literature; oral accounts should be attributed to their narrators and read within their local context.',
    sources: ['oral', 'bikku'],
  },
  {
    id: 'community', number: '17', title: 'Community traditions',
    text: 'Customary practices, kinship, leadership and ceremony are locally grounded and can differ among groups. This page avoids turning one researcher’s field site or one family account into a rule for everyone.',
    sources: ['bikku', 'oral', 'pib-renke'],
  },
  {
    id: 'colonial', number: '18', title: 'Colonial-era history',
    text: 'The 2022 historical chapter examines how colonial restrictions and the Criminal Tribes Act of 1871 affected nomadic communities and their economic lives, including Banjara caravan-trading histories. It does not imply that every Banjara person or region experienced the law identically.',
    sources: ['bikku', 'srmap'],
  },
  {
    id: 'independence', number: '19', title: 'Post-independence developments',
    text: 'Government records show continuing policy attention to denotified, nomadic and semi-nomadic communities. These administrative groupings intersect with state-level SC, ST and OBC lists in different ways; they are not a single uniform legal status for all Banjaras.',
    sources: ['pib-renke', 'pib-2015'],
  },
  {
    id: 'regions', number: '20', title: 'Regional differences',
    text: 'Language use, dress, craft, worship, food, settlement and performance may differ between regions and even neighbouring communities. Examples on this page are labeled by source location wherever the source provides one.',
    sources: ['map', 'asia-inch', 'language', 'ncu'],
  },
  {
    id: 'today', number: '21', title: 'Contemporary Banjara communities',
    text: 'Today, communities include rural, urban, settled and mobile experiences, with varied livelihoods and relationships to language and heritage. No single account can represent all Banjara people across India.',
    sources: ['bikku', 'language', 'pib-renke'],
  },
  {
    id: 'preservation', number: '22', title: 'Cultural preservation',
    text: 'Preservation works best when led with practitioners: name the region and knowledge-holder, credit contributors, record consent, and allow communities to correct or withdraw material. Documentation should support living practice rather than freeze it.',
    sources: ['asia-inch', 'map', 'oral'],
  },
  {
    id: 'modern', number: '23', title: 'Banjara heritage in modern India',
    text: 'Digital archives and community networks can make stories and learning easier to discover. They should complement local practice, protect sensitive knowledge, and make regional differences visible instead of flattening them.',
    sources: ['census', 'asia-inch', 'oral'],
  },
]

export const heritageTopics: HeritageTopic[] = [
  { id: 'background', title: 'History', description: 'Regional histories, mobility and changing livelihoods.', sources: ['bikku'] },
  { id: 'language', title: 'Language', description: 'Lambadi research and multilingual regional contexts.', sources: ['language', 'census'] },
  { id: 'dress', title: 'Traditional Dress', description: 'Clothing practices documented in specific regions.', sources: ['asia-inch', 'map'] },
  { id: 'embroidery', title: 'Embroidery', description: 'Textile methods and museum-documented objects.', sources: ['map', 'asia-inch'] },
  { id: 'jewellery', title: 'Jewellery', description: 'Materials and adornment in a Sandur craft record.', sources: ['asia-inch'] },
  { id: 'music', title: 'Music', description: 'Songs as part of oral literature and community life.', sources: ['oral'] },
  { id: 'dance', title: 'Dance', description: 'A regional Lambadi performance tradition.', sources: ['dance', 'ncu'] },
  { id: 'festivals', title: 'Festivals', description: 'Celebrations are local; one Telangana example is documented.', sources: ['ncu'] },
  { id: 'oral', title: 'Folk Traditions', description: 'Stories, proverbs, chants and knowledge shared orally.', sources: ['oral'] },
  { id: 'oral-history', title: 'Oral History', description: 'Community memory alongside archival records.', sources: ['oral', 'bikku'] },
  { id: 'regions', title: 'Regional Diversity', description: 'Names and practices differ by region and community.', sources: ['pib-renke', 'language'] },
  { id: 'preservation', title: 'Heritage Preservation', description: 'Documentation with consent and practitioner credit.', sources: ['asia-inch', 'map'] },
  { id: 'today', title: 'Modern Community', description: 'Contemporary and varied Banjara experiences.', sources: ['bikku', 'pib-renke'] },
]

export const heritageSources: HeritageSource[] = [
  {
    id: 'bikku',
    title: 'Colonial Impact on Pastoral Nomads and Caravan Traders in India: The Raika and the Banjara',
    author: 'R. Bikku', publisher: 'Springer Nature, in Tribe, Space, and Mobilisation', year: '2022',
    scope: 'Academic chapter on regional caravan-trade histories and colonial impacts.',
    url: 'https://doi.org/10.1007/978-981-19-0059-4_13',
  },
  {
    id: 'srmap',
    title: 'Colonial Impact on Pastoral Nomads and Caravan Traders in India',
    author: 'SRM University-AP', publisher: 'University research summary', year: '2022',
    scope: 'Institutional summary of the chapter and its Deccan fieldwork context.',
    url: 'https://www.srmap.edu.in/news/colonial-impact-on-pastoral-nomads-and-caravan-traders-in-india/',
  },
  {
    id: 'map',
    title: 'Banjara Embroidery',
    author: 'ImPart / Museum of Art & Photography', publisher: 'Art & Photography Foundation', year: '2022',
    scope: 'Museum objects, textiles and techniques; includes specific object locations and dates.',
    url: 'https://imp-art.org/articles/banjara-embroidery/',
  },
  {
    id: 'asia-inch',
    title: 'Lambani / Banjara Embroidery of Karnataka',
    author: 'Craft Revival Trust / Asia InCH', publisher: 'Asia InCH: Encyclopedia of Intangible Cultural Heritage', year: 'n.d.',
    scope: 'Regional Sandur, Karnataka craft documentation; not a pan-community description.',
    url: 'https://asiainch.org/craft/banjara-embroidery-of-sandur-karnataka/',
  },
  {
    id: 'language',
    title: 'Language-attitudes of Lambada youth in a language contact situation between Telugu and Lambadi languages',
    author: 'Kishore Vadthya', publisher: 'Bulletin of Ugric Studies, 8(4), 792–797', year: '2018',
    scope: 'A study focused on Telugu–Lambadi contact among a specific group of young people.',
    url: 'https://vestnik-ugrovedenia.ru/en/content/language-attitudes-lambada-youth-language-contact-situation-between-telugu-and-lambadi',
  },
  {
    id: 'census',
    title: 'Census of India 2011: Language Atlas of India',
    author: 'Office of the Registrar General & Census Commissioner, India', publisher: 'Census of India Digital Library', year: '2022',
    scope: 'Official national language reference; it is not a Banjara-specific ethnography.',
    url: 'https://censusindia.gov.in/nada/index.php/catalog/42561',
  },
  {
    id: 'oral',
    title: 'Oral Histories and Lived Realities: The Banjara Community’s Literature and Lifestyle in Telangana',
    author: 'Badavath Veeru', publisher: 'International Journal for Social Studies, 10(8), 110–116; Zenodo', year: '2024',
    scope: 'Telangana-focused account of oral literature; regional scope should be kept explicit.',
    url: 'https://doi.org/10.5281/zenodo.13839299',
  },
  {
    id: 'dance',
    title: 'Lambadi (Banjara) Dance',
    author: 'WRIKSH', publisher: 'Living traditions documentation', year: 'n.d.',
    scope: 'Describes dance practice in Andhra Pradesh and Telangana; one regional account.',
    url: 'https://www.wriksh.com/traditions/lambadi-banjara-dance-andhra-pradesh',
  },
  {
    id: 'ncu',
    title: 'Lambadi – Telangana Folk Dance – A UGC Initiative',
    author: 'Ek Bharat Shreshtha Bharat Club, The NorthCap University', publisher: 'University event record', year: '2023',
    scope: 'Records one Telangana campus performance; not evidence of a universal festival practice.',
    url: 'https://ebsb.ncuindia.edu/event/lambadi-telangana-folk-dance-a-ugc-initiative/',
  },
  {
    id: 'pib-renke',
    title: 'Implementation of Renke Commission Recommendations',
    author: 'Press Information Bureau, Government of India', publisher: 'Ministry of Social Justice & Empowerment', year: '2026',
    scope: 'Official record of the commission’s formation, report and later DNT/NT/SNT policy measures.',
    url: 'https://pib.gov.in/PressReleasePage.aspx?PRID=2226197&reg=3&lang=1',
  },
  {
    id: 'pib-2015',
    title: 'Gist of Recommendations of the Renke Commission',
    author: 'Press Information Bureau, Government of India', publisher: 'Ministry of Social Justice & Empowerment', year: '2015',
    scope: 'Official note recommending state-wise lists for welfare implementation, underscoring classification variation.',
    url: 'https://pib.gov.in/newsite/PrintRelease.aspx?relid=118570',
  },
]
