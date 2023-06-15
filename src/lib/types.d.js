/**@typedef Group
 * @prop {string} name
 * @prop {string[]} members
 * @prop {Group[]} sub
 * @prop {string} [color]
 */

/** @typedef TagProps
 * @prop {string} [aliasOf]
 * @prop {string} [color]
 */

/**@typedef List
 * @prop {string[]|Group[]} items
 * @prop {string} classname
 * @prop {boolean} visible
 * */

/** @typedef PostData
 * @prop {string} title
 * @prop {string} summary
 * @prop {string[]|string} tags
 * @prop {'material'|'calendario'|'amigues'} category
 * @prop {string[]|string} authors
 * @prop {number | string} [featured]
 * @prop {Date} [published_date]
 * @prop {Date} [update_date] 
 * @prop {boolean} [force_unlisted]
 * @prop {boolean} [force_unpublished]
 */
/** @typedef {PostData & {
 * 		type: 'descargable' | 'link' | 'contenido',
 * 		link: URL,
 * 		access_date: Date,
 * 		original_published_date: Date
 * }} MaterialPostData
 */
/** @typedef {PostData & {
 *		status: 'abierto' | 'anunciado' | 'lleno',
 * 		start: string,
 * 		end?: string,
 * 		duration?: Date,
 * 		location?: string,
 * 		link?: URL
 * 		link_text?: string
 * }} CalendarioPostData */
/** @typedef {PostData & {
 * 		pronoun: string | URL,
 * 		link: URL,
 * 		logo?: URL | number,
 * 		photo?: URL | number,
 * 		email?: string,
 * 		location?: string,
 * 		tel?: string,
 * 		job_title?: string,
 * 		job_role?: string,
 * 		gender_identity?: string | URL,
 * 		bday?: Date,
 * }} AmiguesPostData */
// TODO affiliation, education, experience, skill
/** @typedef {AmiguesPostData & MaterialPostData & CalendarioPostData} AnyPostData */


