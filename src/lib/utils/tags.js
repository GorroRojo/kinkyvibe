/**@type Array<RawTag> */
import hardcodedTags from './hardcodedTags';

/**
 *
 *
 * @param {Array<ProcessedTag>} [rawTags=hardcodedTags]
 * @return {TagManager}
 */
// @ts-ignore
export function tagsFactory(rawTags = hardcodedTags) {
	/** @type Array<ProcessedTag> */
	/**@type Map<TagID, ProcessedTag> */
	let tagsMap = new Map([...rawTags].map((t) => [t.id, t]));
	let missingTags = [];
	let tagManager = {
		[Symbol.iterator]() {
			return tagsMap.entries();
		},
		entries() {
			return [...tagsMap.entries()];
		},
		tags() {
			return [...tagsMap.keys()];
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
		 * @param {RawTag} value
		 */
		set(id, value) {
			// @ts-ignore
			tagsMap.set(id, value);
			return;
		}
	};
	// add parents prop to all tags
	for (let [id, tag] of tagManager) {
		for (let childID of tag?.children ?? []) {
			let child = tagManager.get(childID);

			if (child !== undefined) {
				child.parents =
					child.parents && !child.parents.includes(id) ? [...child.parents, id] : [id];
			} else {
				tagManager.set(childID, {
					id: childID,
					// @ts-ignore
					parents: [id]
				});
			}
		}
		// generate alias tags from "aka"
		if (tag.aka && tag.aka.length > 0) {
			for (let aliasOfThis of tag?.aka ?? []) {
				tagManager.set(aliasOfThis, {
					id: aliasOfThis,
					aliasOf: id
				});
			}
		}
		// backlink related tags
		if (tag.related && tag.related.length > 0) {
			for (let relatedToThis of tag.related) {
				let r = tagManager.get(relatedToThis);
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
		tag.getColor = () => {
			if (tag.color !== undefined) {
				return tag.color;
			}
			let queue = [tag.id];
			while (queue.length > 0) {
				let currID = queue.pop();
				if (currID === undefined) return undefined;
				let curr = tagManager.get(currID);
				if (curr == undefined) {
					continue;
				}
				if (currID != tag.id && curr.color) {
					return curr.color;
				} else {
					if (curr.parents) {
						queue.push(...curr.parents);
					} else {
						return undefined;
					}
				}
			}
			return undefined;
		};
		tag.getAllChildren = () => {
			let res = [];
			let queue = [tag.id];
			while (queue.length > 0) {
				let currID = queue.pop();
				if (currID === undefined) return res;
				let curr = tagManager.get(currID);
				if (curr === undefined || curr.children === undefined) continue;
				queue.push(...curr.children);
				res.push(...curr.children);
			}
			return res;
		};
		tag.getAllParents = () => {
			let res = [];
			let queue = [tag.id];
			while (queue.length > 0) {
				let currID = queue.pop();
				if (currID === undefined) return res;
				let curr = tagManager.get(currID);
				if (curr === undefined || curr.parents === undefined) continue;
				queue.push(...(curr.parents));
				res.push(...(curr.parents));
			}
			return res;
		};
		if (tag.description !== undefined) {
			tag.parsedDescription = parseDescription(tag.description, '').map((l) => {
				if (l.type == 'link') {
					if (tagManager.get(l.line) === undefined) {
						missingTags.push(l.line);
						return { type: 'text', line: l.line };
					} else return l;
				} else return l;
			});
		}
		tag.visible_name = tag.visible_name ?? tag.id;
	}

	// link related and wikilinks

	// @ts-ignore
	return { ...tagManager, missingTags: [...new Set(missingTags)] };
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
