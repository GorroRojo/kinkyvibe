// Pronouns next to @mentions in post content. Kept apart from $lib/utils/index.js
// so detail pages don't pull in that module's lookup tables for every post.

/**
 * The short pronoun shown after a mention/name, or undefined when there's none to show.
 * `pronoun` is either plain text or a pronouns.page URL (the last path segment is used,
 * e.g. ".../elle&ella" -> "elle/ella"); "evitar" means don't show one.
 * @param {unknown} pronoun
 * @returns {string|undefined}
 */
export function pronounLabel(pronoun) {
	if (!pronoun) return undefined;
	const last = (pronoun + '').split('/').pop();
	if (!last || last == 'evitar') return undefined;
	return last.split(',')[0].replaceAll('&', '/');
}

/**
 * Svelte action: appends `<small class="p-pronoun">` to each `a.mention` in `node`.
 * @param {HTMLElement} node
 * @param {(name: string) => string|undefined|Promise<string|undefined>} lookup
 *   pronoun label for an amigues postID (the mention without the "@")
 */
export function addMentionPronouns(node, lookup) {
	node.querySelectorAll('a.mention').forEach(async (el) => {
		const name = el.textContent?.slice(1);
		if (!name) return;
		let label;
		try {
			label = await lookup(name);
		} catch (e) {
			return;
		}
		if (!label) return;
		const small = document.createElement('small');
		small.className = 'p-pronoun';
		small.textContent = ' ' + label;
		el.appendChild(small);
	});
}
