/** @typedef {string} TagID */
/** @typedef {string} postID */
/**
 * @typedef {Object} Tag
 * @prop {TagID} id
 * @prop {string} [visible_name]
 * @prop {string} [color]
 * @prop {string[]} [allChildren]
 * @prop {string} [description]
 * @prop {Array<{line: string, type: "text"|"link"|"mark", href?: string}>} [parsedDescription]
 * @prop {string} [cleanDescription]
 * @prop {TagID[]} [related]
 * @prop {string[]} [aka]
 * @prop {TagID} [aliasOf]
 * @prop {TagID[]} [children]
 * @prop {TagID[]} [parents]
 * @prop {postID} [entry]
 */
/**@type Array<Tag> */

import hardcodedTags from './hardcodedTags';
/**
 *
 *
 * @param {Array<Tag>} [rawTags=hardcodedTags]
 * @return {*}
 */
export function tagsFactory(rawTags = hardcodedTags) {
	/** @type Array<Tag> */
	/**@type Map<TagID, Tag> */
	let tagsMap = new Map([...rawTags].map((t) => [t.id, t]));
	let missingTags = [];
	let tags = {
		[Symbol.iterator]() {
			return tagsMap.entries();
		},
		entries(){ 
			return tagsMap.entries()
		},
		/**
		 * @param {TagID} id
		 */
		get(id) {
			let tag = tagsMap.get(id);
			if (tag?.aliasOf !== undefined) {
				return tagsMap.get(tag?.aliasOf);
			} else {
				return tag;
			}
		},
		/**
		 * @param {TagID} id
		 * @param {Tag} value
		 */
		set(id, value) {
			return tagsMap.set(id, value);
		}
	};
	// add parents prop to all tags
	for (let [id, tag] of tags) {
		for (let childID of tag?.children ?? []) {
			let child = tags.get(childID);

			if (child !== undefined) {
				child.parents = child.parents ? [...child.parents, id] : [id];
			} else {
				tags.set(childID, {
					id: childID,
					parents: [id]
				});
			}
		}
		// generate alias tags from "aka"
		if (tag.aka && tag.aka.length > 0) {
			for (let aliasOfThis of tag?.aka ?? []) {
				tags.set(aliasOfThis, {
					id: aliasOfThis,
					aliasOf: id
				});
			}
		}
		// backlink related tags
		if (tag.related && tag.related.length > 0) {
			for (let relatedToThis of tag.related) {
				let r = tags.get(relatedToThis);
				if (r !== undefined) {
					if (r.related && r.related.length > 0) {
						if (!r.related.includes(tag.id)) {
							r.related.push(tag.id);
						}
					} else r.related = [tag.id];
				} else {
					missingTags.push(relatedToThis);
				}
			}
		}
		let rawColor = tag.color;
		// Object.defineProperty(tag, 'color', {
		// 	get: function () {
		// 		if (rawColor !== undefined) {
		// 			return rawColor;
		// 		}
		// 		let queue = [tag.id];
		// 		while (queue.length > 0) {
		// 			let currID = queue.pop();
		// 			if (currID === undefined) return undefined;
		// 			let curr = tags.get(currID);
		// 			if (curr == undefined) {
		// 				continue;
		// 			}
		// 			if (currID != tag.id && curr.color) {
		// 				return curr.color;
		// 			} else {
		// 				if (curr.parents) {
		// 					queue.push(...curr.parents);
		// 				} else {
		// 					return undefined;
		// 				}
		// 			}
		// 		}
		// 		return undefined;
		// 	}
		// });
		// Object.defineProperty(tag, 'allChildren', {
		// 	get: function () {
		// 		let res = [];
		// 		let queue = [tag.id];
		// 		while (queue.length > 0) {
		// 			let currID = queue.pop();
		// 			if (currID === undefined) return res;
		// 			let curr = tags.get(currID);
		// 			if (curr === undefined || curr.children === undefined) continue;
		// 			queue.push(...curr.children);
		// 			res.push(...curr.children);
		// 		}
		// 		return res;
		// 	}
		// });
		if (tag.description !== undefined) {
			tag.parsedDescription = parseDescription(tag.description, '').map((l) => {
				if (l.type == 'link') {
					if (tags.get(l.line) === undefined) {
						missingTags.push(l.line);
						return { type: 'text', line: l.line };
					} else return l;
				} else return l;
			});
		}
	}

	// link related and wikilinks

	return { ...tags, missingTags: [...new Set(missingTags)] };
}
export default tagsFactory;

/**
 * Normalizes a string by converting it to lowercase and replacing
 * accented characters with their non-accented counterparts.
 *
 * @param {string} s - The string to be normalized.
 * @return {string} The normalized string.
 */
const normalize = (s) =>
	(s + '')
		.toLowerCase()
		.replaceAll('á', 'a')
		.replaceAll('é', 'e')
		.replaceAll('í', 'i')
		.replaceAll('ó', 'o')
		.replaceAll('ú', 'u');
/**
 * Determines if a normalized version of array `a` includes a normalized version of query `q`.
 *
 * @param {string} a - The array to search in.
 * @param {string} q - The query value to search for.
 * @return {boolean} Returns `true` if the query value is found in the array; otherwise, returns `false`.
 */
function includesNormalized(a, q) {
	return normalize(a).includes(normalize(q));
}

/**
 * Parses the given description and extracts links based on the provided query.
 *
 * @param {string} description - The description to parse.
 * @param {string} query - The query to search for in the description.
 * @return {Array<{ line: string, type: "text"|"link", href?: string }>} - An array of lines with their types and optional href.
 */
function parseDescription(description, query) {
	const regex = /\[\[([^\]]*)\]\]/g;
	const nQuery = normalize(query);
	const lines = description
		.split(regex)
		.map((line, index) => ({
			line,
			/**@type {"text"|"link"}*/ type: index % 2 == 0 ? 'text' : 'link'
		}))
		.map(({ line, /**@type {"text"|"link"}*/ type }) => {
			if (type == 'link') {
				if (line.includes(':')) {
					let [href, newStr] = line.split(':');
					return {
						line: newStr,
						type,
						href
					};
				} else {
					return {
						line,
						type,
						href: line
					};
				}
			} else return { line, type };
		})
		.map(({ line, type }) => {
			const nLine = normalize(line);
			if (query != '' && nLine.includes(nQuery)) {
				let nParts = nLine.split(nQuery);
				let k = 0;
				let parts = nParts.map((p, i) => {
					k += p.length;
					let end = k;
					if (i != 0 && i % 2 != 0) {
						k += nQuery.length;
						end = k + nQuery.length;
					}
					return line.slice(k - p.length, end);
				});
				return parts
					.map((p, i) =>
						i % 2 == 0
							? [
									{ line: p, type },
									{ line: query, type: 'mark' }
							  ]
							: { line: p, type }
					)
					.flat();
			} else return { line, type };
		})
		.flat()
		.filter(({ line }) => line !== '');
	// @ts-ignore
	return lines.length > 0 ? lines : [];
}
