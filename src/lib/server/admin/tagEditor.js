/**
 * Server side of /admin/etiquetas: reads the tag tree and the posts through the repo client
 * (GitHub, the `npm run dev:admin` mock or the preview demo layer), plans a change with
 * $lib/utils/tagConfig.js and commits it as ONE commit. No SvelteKit imports: tested with a fake
 * client in tagEditor.test.js.
 */
import { gitBlobSha } from './posts.js';
import { lineDiff, planTagChange } from '$lib/utils/tagConfig.js';

export const TAGS_PATH = 'src/lib/utils/hardcodedTags.js';
export const POST_DIRS = Object.freeze(
	['calendario', 'material', 'amigues', 'wiki'].map((c) => `src/lib/posts/${c}`)
);

/**
 * @typedef {Pick<typeof import('../eventos/github.js'), 'getFile' | 'getDirTexts' | 'commitFiles'>} TagClient
 */

/**
 * The tag file as it is on the repo now, with its blob sha. When the client doesn't have it (the
 * preview demo layer only holds posts), the copy bundled in this deploy is used.
 * @param {TagClient} client
 * @param {string} token
 * @param {string} bundled
 */
export async function readTagSource(client, token, bundled) {
	const text = await client.getFile(token, TAGS_PATH);
	if (text === null) return { source: bundled, sha: undefined, fromRepo: false };
	return { source: text, sha: await gitBlobSha(text), fromRepo: true };
}

/** @param {import('$lib/utils/tagConfig.js').TagOp[]} ops */
export const touchesPosts = (ops) => ops.some((o) => o.type === 'rename' || o.type === 'merge');

/**
 * Plans the change: the tag file plus, for rename/merge, every post (4 folders, one request each).
 * @param {TagClient} client
 * @param {string} token
 * @param {import('$lib/utils/tagConfig.js').TagOp[]} ops
 * @param {string} bundled
 */
export async function planTagEdit(client, token, ops, bundled) {
	const { source, sha } = await readTagSource(client, token, bundled);
	const posts = touchesPosts(ops)
		? (await Promise.all(POST_DIRS.map((d) => client.getDirTexts(token, d))))
				.flat()
				.filter((f) => f.path.endsWith('.md') && !f.path.split('/').pop()?.startsWith('_'))
		: [];
	return planTagChange({ source, sourceSha: sha, sourcePath: TAGS_PATH, posts, ops });
}

/**
 * What the preview shows: per file, its diff hunks (capped) and +/- counts.
 * @param {ReturnType<typeof planTagChange>} plan
 * @param {{maxFiles?: number, maxHunks?: number}} [opts]
 */
export function previewOf(plan, { maxFiles = 60, maxHunks = 12 } = {}) {
	return {
		summary: plan.summary,
		total: plan.files.length,
		files: plan.files.slice(0, maxFiles).map((f) => {
			const hunks = lineDiff(f.before, f.after, 2);
			const lines = hunks.flatMap((h) => h.lines);
			return {
				path: f.path,
				added: lines.filter((l) => l.t === '+').length,
				removed: lines.filter((l) => l.t === '-').length,
				hunks: hunks.slice(0, maxHunks),
				more: Math.max(0, hunks.length - maxHunks)
			};
		})
	};
}

/**
 * Commit message: first line with the first operation, the rest listed below.
 * @param {string} who
 * @param {string[]} summary
 * @param {number} files
 */
export function tagCommitMessage(who, summary, files) {
	const head = `[admin] ${who}: etiquetas: ${summary[0] ?? 'cambios'}${summary.length > 1 ? ` (+${summary.length - 1})` : ''}`;
	return [head, '', ...summary.map((s) => `- ${s}`), '', `${files} archivo(s).`].join('\n');
}

/**
 * Commits a plan: every changed file in one commit, each guarded by the sha it was read at.
 * @param {TagClient} client
 * @param {string} token
 * @param {ReturnType<typeof planTagChange>} plan
 * @param {string} who
 */
export async function commitTagEdit(client, token, plan, who) {
	if (!plan.files.length) throw new Error('Estos cambios no modifican ningún archivo.');
	return await client.commitFiles(token, {
		files: plan.files.map((f) => ({ path: f.path, content: f.after })),
		message: tagCommitMessage(who, plan.summary, plan.files.length),
		unchanged: plan.files.flatMap((f) => (f.sha ? [{ path: f.path, sha: f.sha }] : []))
	});
}
