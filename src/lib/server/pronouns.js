import { dev } from '$app/environment';
import { pronounLabel } from '$lib/utils/mentions';

const profiles = import.meta.glob('/src/lib/posts/amigues/*.md', { import: 'metadata' });

/** @type {Promise<Record<string, string>>|undefined} */
let cached;

/**
 * Pronoun labels of every published amigues profile, by postID, for the @mentions in a
 * post's content (see addMentionPronouns). Small (a few dozen entries), so pages get the
 * whole map instead of the client importing each mentioned profile.
 * @returns {Promise<Record<string, string>>}
 */
export function mentionPronouns() {
	if (dev) return build();
	return (cached ??= build().catch((e) => {
		cached = undefined;
		throw e;
	}));
}

async function build() {
	/** @type {Record<string, string>} */
	const out = {};
	for (const [path, load] of Object.entries(profiles)) {
		const id = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
		if (!id || id.startsWith('_')) continue;
		const meta = /** @type {Record<string, any>|undefined} */ (await load());
		if (!meta || meta.force_unpublished) continue;
		const label = pronounLabel(meta.pronoun);
		if (label) out[id] = label;
	}
	return out;
}
