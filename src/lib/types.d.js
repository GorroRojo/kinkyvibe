/**
 * @typedef { 'head' |'face' |'neck' |'shoulder-left' |'shoulder-right' |'arm-left' |'forearm-left' |'arm-right' |'forearm-right' |'chest-left' |'chest-right' |'belly-left' |'ribs-left' |'belly-right' |'belly' |'ribs-right' |'thigh-left' |'innerthigh-left' |'feet-left' |'calf-left' |'knee-left' |'thigh-right' |'genitalia' |'innerthigh-right' |'right-feet' |'calf-right' |'knee-right' |'elbow-right' |'hand-right' |'elbow-left' |'hands-left' |'armback-left' |'leg-left' |'buttock' |'loin' |'column' |'head-back' |'nape' |'armback-right' |'leg-right' |'back-right' |'clavicule-right' |'back-left' |'clavicule-left'|string  } BodyPart
 */
/**@typedef Group
 * @prop {string} name
 * @prop {string[]} [members]
 * @prop {Group[]} sub
 * @prop {boolean} [noname]
 * @prop {string} [color]
 * @prop {string} [parent]
 */

/** @typedef TagProps
 * @prop {string} [aliasOf]
 * @prop {string} [color]
 */

/** @typedef {string} TagID */
/** @typedef {string} postID */

/**
 * @typedef {Object} RawTag
 * @prop {TagID} id
 * @prop {string} [visible_name]
 * @prop {string} [color]
 * @prop {string} [description]
 * @prop {TagID[]} [related]
 * @prop {string[]} [aka]
 * @prop {TagID} [aliasOf]
 * @prop {TagID[]} [children]
 * @prop {postID} [entry]
 * @prop {boolean} [noname]
 * */

/**
 * @typedef {RawTag & {
 *      getColor: ()=>(string|undefined),
 *      getAllChildren: ()=>(string[]),
 *      getAllParents: ()=>(string[]),
 *      cleanDescription?: string,
 *      parsedDescription?: Array<{line: string, type: "text"|"link"|"mark", href?: string}>,
 *      parents?: TagID[],
 *      orphan?: boolean
 * }} ProcessedTag
 */
/**@typedef TagManager
 * @prop {(tagID: string, fallbackData?: *)=>(ProcessedTag)} get
 * @prop {()=>([TagID, ProcessedTag][])} entries
 * @prop {()=>(TagID[])} tagIDs
 * @prop {()=>(ProcessedTag[])} tagsData
 * @prop {(tagID: string, value: RawTag)=>void} set
 * @prop {string[]} missingTags
 */

/**@typedef List
 * @prop {string[]|Group[]} items
 * @prop {string} classname
 * @prop {boolean} visible
 * */

/** @typedef PostData
 * @prop {string} postID
 * @prop {string} title
 * @prop {string} summary
 * @prop {string[]} tags
 * @prop {'material'|'calendario'|'amigues'|'wiki'} category
 * @prop {'material'|'calendario'|'amigues'} layout
 * @prop {string[]} authors
 * @prop {string} [featured]
 * @prop {string} [published_date]
 * @prop {string} [updated_date]
 * @prop {boolean} [force_unlisted]
 * @prop {boolean} [force_unpublished]
 */
/** @typedef {PostData & {
 * 		type: 'descargable' | 'link' | 'contenido',
 * 		link: string,
 * 		access_date: Date,
 * 		original_published_date: Date
 *      redirect: boolean
 *      wiki?: string
 * }} MaterialPostData
 */
/** @typedef {PostData & {
 *		status: 'abierto' | 'anunciado' | 'lleno' | 'cancelado',
 * 		start: string,
 * 		end?: string,
 * 		duration?: Date,
 * 		location?: string,
 * 		location_name?: string,
 * 		link?: URL
 * 		link_text?: string
 * }} CalendarioPostData */
/** @typedef {PostData & {
 * 		pronoun: string,
 * 		link: URL,
 * 		logo?: string,
 * 		photo?: string,
 * 		email?: string,
 * 		location?: string,
 * 		tel?: string,
 * 		job_title?: string,
 * 		job_role?: string,
 * 		gender_identity?: string | URL,
 * 		bday?: Date,
 * }} AmiguesPostData */
// TODO affiliation, education, experience, skill

/**
 * @typedef ProcessedPost
 * @prop {string} path
 * @prop {AnyPostData} meta
 * @prop {ConstructorOfATypedSvelteComponent|undefined} [content]
 * @prop {ProcessedPost[]} [authorsProfiles]
 * @prop {ProcessedPost[]} [relatedPosts]
 */
/** @typedef {AmiguesPostData & MaterialPostData & CalendarioPostData} AnyPostData */

/**
 * @typedef {import('schema-dts').Thing | import('schema-dts').WithContext<import('schema-dts').Thing>} LD.Schema
 */
/** @typedef {import('schema-dts').Organization} LD.Organization */
/** @typedef {import('schema-dts').WebSite} LD.Website */
/** @typedef {import('schema-dts').Article} LD.Article */
/** @typedef {import('schema-dts').Event} LD.Event */
/** @typedef {import('schema-dts').EventSeries} LD.EventSeries */
/** @typedef {import('schema-dts').Person} LD.Person */
/** @typedef {import('schema-dts').ProfilePage} LD.ProfilePage */
/** @typedef {import('schema-dts').EventVenue} LD.EventVenue */
/** @typedef {import('schema-dts').Book} LD.Book */
/** @typedef {import('schema-dts').BreadcrumbList} LD.BreadcrumbList */
/** @typedef {import('schema-dts').ClaimReview} LD.ClaimReview */
/** @typedef {import('schema-dts').FAQPage} LD.FAWPage */
/** @typedef {import('schema-dts').SpeakableSpecification} LD.SpeakableSpecification */
/** @typedef {import('schema-dts').SearchAction} LD.SearchAction */
/**
 * @typedef {Object} GHUser
 * @property {string} login
 * @property {number} id
 * @property {string} node_id
 * @property {string} avatar_url
 * @property {string} gravatar_id
 * @property {string} url
 * @property {string} html_url
 * @property {string} followers_url
 * @property {string} following_url
 * @property {string} gists_url
 * @property {string} starred_url
 * @property {string} subscriptions_url
 * @property {string} organizations_url
 * @property {string} repos_url
 * @property {string} events_url
 * @property {string} received_events_url
 * @property {string} type
 * @property {boolean} site_admin
 * @property {string} name
 * @property {null|string} company
 * @property {string} blog
 * @property {string} location
 * @property {string} email
 * @property {boolean} hireable
 * @property {null|string} bio
 * @property {null|string} twitter_username
 * @property {number} public_repos
 * @property {number} public_gists
 * @property {number} followers
 * @property {number} following
 * @property {string} created_at
 * @property {string} updated_at
 */