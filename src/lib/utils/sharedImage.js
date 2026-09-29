/**
 * Pure helpers for replacing an event's image from the admin pages (/admin/eventos/nuevo and
 * /edit/calendario/...).
 *
 * An event's `featured` is either a number (an image in the event's own folder,
 * src/lib/posts/calendario/media/<slug>/<n>.<ext>) or a file name in src/lib/assets, shared by
 * every edition of a recurring event (`featured: picantearla-miniatura.webp`). When someone
 * uploads a new image for an event that uses a shared one, they choose:
 *  - "todas": the shared file itself is replaced, so every edition (past ones too) shows the new
 *    image. If the new image has another extension, the file is renamed and every event that
 *    pointed to the old name is updated, all in the same commit.
 *  - "esta": the image is saved in the event's own folder and only that event changes.
 *
 * No Svelte / SvelteKit imports: runs in the browser, on the server and in vitest.
 */
import {
	applyFrontmatterChanges,
	isNumericFeatured,
	joinMarkdown,
	readEventFields,
	splitMarkdown
} from './eventDraft.js';

export const ASSETS_DIR = 'src/lib/assets';

/** @typedef {'todas'|'esta'} ImageScope */

/**
 * Does `featured` name a shared file in src/lib/assets (instead of a numbered image of the
 * event's own folder)?
 * @param {string|number|undefined|null} featured
 */
export function isSharedAsset(featured) {
	const f = String(featured ?? '').trim();
	return f !== '' && !isNumericFeatured(f);
}

/**
 * A plain file name of src/lib/assets (no folders, an image extension). Anything else is not
 * touched by the "todas las ediciones" option.
 * @param {string} name
 */
export function isSafeAssetName(name) {
	return (
		/^[A-Za-z0-9][\w.-]*\.(jpe?g|jfif|png|webp)$/i.test(String(name ?? '')) && !name.includes('..')
	);
}

/** `picantearla-miniatura.webp` → `picantearla-miniatura` @param {string} name */
export function assetBasename(name) {
	return String(name).replace(/\.[^./]+$/, '');
}

/**
 * Name of the shared file after uploading an image with extension `ext`: same base name, the new
 * extension. `('x-miniatura.webp', 'png')` → `x-miniatura.png`.
 * @param {string} oldName
 * @param {string} ext
 */
export function replacementAssetName(oldName, ext) {
	return `${assetBasename(oldName)}.${ext}`;
}

/**
 * The `featured` of an event file, or '' if it has none or can't be read.
 * @param {string} raw
 */
export function featuredOf(raw) {
	try {
		return readEventFields(splitMarkdown(raw).frontmatter).featured.trim();
	} catch (e) {
		return '';
	}
}

/**
 * Sets `featured` in an event file changing only that line (the rest of the file stays byte for
 * byte the same, which matters when many past events are updated at once). A commented-out or
 * missing `featured` goes through applyFrontmatterChanges.
 * @param {string} raw
 * @param {string|number} value
 */
export function setFeatured(raw, value) {
	const text = String(raw ?? '');
	// Line by line on the original text, so CRLF files keep their line endings.
	const lines = text.split(/(?<=\n)/);
	const re = /^([ \t]*)featured:[ \t]*(?:'[^'\n]*'|"[^"\n]*"|[^#\r\n]*?)([ \t]+#[^\r\n]*)?[ \t]*(\r?\n)?$/;
	if (/^---[ \t]*\r?\n$/.test(lines[0] ?? '')) {
		for (let i = 1; i < lines.length; i++) {
			if (/^---[ \t]*(\r?\n)?$/.test(lines[i])) break;
			const m = re.exec(lines[i]);
			if (m) {
				lines[i] = `${m[1]}featured: ${value}${m[2] ?? ''}${m[3] ?? ''}`;
				return lines.join('');
			}
		}
	}
	const { frontmatter, body } = splitMarkdown(text);
	return joinMarkdown(applyFrontmatterChanges(frontmatter, { featured: value }), body);
}

/**
 * Next free image number in an event's media folder: `['1.webp', '2.png', 'logo.svg']` → 3.
 * @param {string[]} names file names in the folder
 */
export function nextMediaNumber(names) {
	let max = 0;
	for (const n of names) {
		const m = /^(\d+)\.[a-z0-9]+$/i.exec(n);
		if (m) max = Math.max(max, Number(m[1]));
	}
	return max + 1;
}

/**
 * Which case an uploaded image falls into.
 * - `todas`: the event used a shared image and the person chose "todas las ediciones".
 * - `esta`: everything else (own numbered image, no image, or "solo esta").
 * @param {string} currentFeatured featured of the event being duplicated / edited
 * @param {string} scope what the person chose ('' if they weren't asked)
 * @returns {ImageScope}
 */
export function uploadScope(currentFeatured, scope) {
	return isSharedAsset(currentFeatured) && scope === 'todas' ? 'todas' : 'esta';
}

/**
 * @typedef {object} RepoText
 * @prop {string} path repo path
 * @prop {string} sha blob sha it was read at
 * @prop {string} text
 */

/**
 * @typedef {object} AffectedEvent
 * @prop {string} slug
 * @prop {string} title
 * @prop {string} start
 * @prop {boolean} fileChanges true when its file is rewritten (the shared image changed name)
 */

/**
 * Events (of `files`, the calendario folder) whose `featured` is `name`, newest first.
 * @param {RepoText[]} files
 * @param {string} name
 */
export function eventsUsingAsset(files, name) {
	return files
		.filter(
			(f) => f.path.endsWith('.md') && !/\/_[^/]*$/.test(f.path) && featuredOf(f.text) === name
		)
		.map((f) => {
			/** @type {{title: string, start: string}} */
			let fields = { title: '', start: '' };
			try {
				fields = readEventFields(splitMarkdown(f.text).frontmatter);
			} catch (e) {
				// featuredOf already read it; keep the defaults
			}
			return {
				...f,
				slug: f.path.split('/').pop()?.replace(/\.md$/, '') ?? f.path,
				title: fields.title,
				start: fields.start
			};
		})
		.sort((a, b) => String(b.start).localeCompare(String(a.start)));
}

/**
 * Everything a "todas las ediciones" upload changes, except the image bytes themselves.
 *
 * @param {object} opts
 * @param {string} opts.oldName current shared file name (the events' `featured`)
 * @param {string} opts.ext extension of the uploaded image (jpg | png | webp)
 * @param {RepoText[]} opts.files the calendario folder as read from GitHub
 * @param {Record<string, {text: string, sha?: string}>} [opts.override] event files whose new
 *   content comes from the form instead of GitHub (the event being edited in /edit): its
 *   `featured` is set to the new name whatever it says, and `sha` (if given) is the one checked.
 * @returns {{
 *   newName: string,
 *   renamed: boolean,
 *   assetPath: string,
 *   oldAssetPath: string,
 *   files: Array<{path: string, content: string}>,
 *   unchanged: Array<{path: string, sha: string}>,
 *   affected: AffectedEvent[]
 * }}
 */
export function planSharedAssetReplace({ oldName, ext, files, override = {} }) {
	const newName = replacementAssetName(oldName, ext);
	const renamed = newName !== oldName;
	const users = eventsUsingAsset(files, oldName);
	/** @type {Array<{path: string, content: string}>} */
	const changed = [];
	/** @type {Array<{path: string, sha: string}>} */
	const unchanged = [];
	/** @type {AffectedEvent[]} */
	const affected = [];
	for (const u of users) {
		if (override[u.path]) continue;
		affected.push({ slug: u.slug, title: u.title, start: u.start, fileChanges: renamed });
		if (!renamed) continue;
		changed.push({ path: u.path, content: setFeatured(u.text, newName) });
		unchanged.push({ path: u.path, sha: u.sha });
	}
	for (const [path, o] of Object.entries(override)) {
		changed.push({ path, content: setFeatured(o.text, newName) });
		if (o.sha) unchanged.push({ path, sha: o.sha });
	}
	return {
		newName,
		renamed,
		assetPath: `${ASSETS_DIR}/${newName}`,
		oldAssetPath: `${ASSETS_DIR}/${oldName}`,
		files: changed,
		unchanged,
		affected
	};
}
