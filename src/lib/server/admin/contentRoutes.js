/**
 * Loads and form actions shared by /admin/material/** and /admin/amigues/** (list, nuevo,
 * [slug]). Each route file is a thin wrapper that picks the category.
 *
 * Every load calls requireAdmin (loads run in parallel with the layout's) and every action checks
 * the admin itself (actions don't run the layout load). Writes go through the same GitHub commit
 * path as the event editor (getRepoClient: dev mock / demo layer / GitHub) and leave an audit
 * entry after the commit.
 */
import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from './audit.js';
import { editorData } from './content.js';
import { contentImageURL, listContent, takenContentSlugs } from './contentList.js';
import {
	contentCommitMessage,
	contentMediaDir,
	contentPath,
	gitBlobSha,
	readContentPost,
	saveContentPost
} from './posts.js';
import { getEventAdmin, getRepoClient, isMockMode } from '$lib/server/eventos';
import { FileChangedError, PathExistsError } from '$lib/server/eventos/github.js';
import { readUploadedImage } from '$lib/server/eventos/images.js';
import {
	contentProblems,
	readContentForm,
	setUnlistedFlag,
	validateContentSlug
} from '$lib/utils/contentPosts.js';
import { MAX_IMAGE_BYTES, todayInArgentina } from '$lib/utils/eventDraft.js';
import materialTemplate from '$lib/posts/material/_post_template.md?raw';
import amiguesTemplate from '$lib/posts/amigues/_profile_template.md?raw';

/** @type {Record<string, string>} */
const TEMPLATES = { material: materialTemplate, amigues: amiguesTemplate };

const NO_PERMISSION =
	'No tenés permiso para editar contenido. Probá cerrar sesión y volver a entrar.';

/** @param {unknown} e */
const describe = (e) => (e instanceof Error ? e.message : String(e));

/** What the section is called in messages. */
export const SECTION = Object.freeze({
	material: { one: 'material', label: 'Material' },
	amigues: { one: 'perfil', label: 'Amigues' }
});

/* ------------------------------------------------------------------------------------------ */
/*  List                                                                                       */
/* ------------------------------------------------------------------------------------------ */

/**
 * @param {'material'|'amigues'} category
 * @returns {import('@sveltejs/kit').ServerLoad}
 */
export function listLoad(category) {
	return async ({ locals, url }) => {
		requireAdmin(locals, url);
		return { category, rows: await listContent(category), mock: isMockMode() };
	};
}

/**
 * `?/visibilidad`: list or unlist a post (force_unlisted) in one commit.
 * @param {'material'|'amigues'} category
 * @returns {import('@sveltejs/kit').Action}
 */
export function visibilityAction(category) {
	return async ({ locals, request, url, platform }) => {
		requireAdmin(locals, url);
		const admin = getEventAdmin(locals);
		if (!admin) return fail(403, { error: NO_PERMISSION });
		const data = await request.formData();
		const slug = String(data.get('slug') ?? '');
		const unlisted = data.get('unlisted') === '1';
		if (!contentPath(category, slug)) return fail(400, { error: 'Publicación inválida.' });
		const client = await getRepoClient();
		let post;
		try {
			post = await readContentPost(client, admin.token, category, slug);
		} catch (e) {
			return fail(502, { error: 'No pudimos leer la publicación desde GitHub: ' + describe(e) });
		}
		if (!post) return fail(404, { error: 'Esa publicación no existe (¿la borraron?).' });
		let content;
		try {
			content = setUnlistedFlag(post.raw, unlisted);
		} catch (e) {
			return fail(400, { error: describe(e) });
		}
		if (content === post.raw) return { visibility: { slug, unlisted, unchanged: true } };
		try {
			const r = await saveContentPost(client, admin.token, {
				category,
				slug,
				content,
				isNew: false,
				baseSha: post.sha,
				message: contentCommitMessage({
					who: admin.name,
					verb: unlisted ? 'unlisted' : 'listed',
					category,
					slug
				})
			});
			await logAdminAction(getDB(platform), locals, {
				action: `${category}.${unlisted ? 'unlist' : 'list'}`,
				targetType: 'post',
				targetId: `${category}/${slug}`,
				summary: `${unlisted ? 'Ocultó de las listas' : 'Volvió a listar'} ${category}/${slug}`,
				detail: { commit: r.commit.url }
			});
		} catch (e) {
			if (e instanceof FileChangedError)
				return fail(409, {
					error: 'La publicación cambió en GitHub mientras tanto. Recargá y probá de nuevo.'
				});
			return fail(502, { error: 'No se pudo guardar: ' + describe(e) });
		}
		return { visibility: { slug, unlisted } };
	};
}

/* ------------------------------------------------------------------------------------------ */
/*  Editor                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/**
 * /admin/<category>/nuevo[?desde=slug]
 * @param {'material'|'amigues'} category
 * @returns {import('@sveltejs/kit').ServerLoad}
 */
export function newLoad(category) {
	return async ({ locals, url }) => {
		requireAdmin(locals, url);
		const admin = getEventAdmin(locals);
		if (!admin) throw error(403, NO_PERMISSION);
		const desde = url.searchParams.get('desde') ?? '';
		/** @type {null | {slug: string, raw: string, title: string}} */
		let source = null;
		if (desde) {
			if (!contentPath(category, desde)) throw error(400, 'Esa publicación no existe.');
			let post;
			try {
				post = await readContentPost(await getRepoClient(), admin.token, category, desde);
			} catch (e) {
				throw error(502, 'No pudimos leer la publicación desde GitHub: ' + describe(e));
			}
			if (!post) throw error(404, 'Esa publicación no existe.');
			let title = desde;
			try {
				title = String(readContentForm(category, post.raw).values.title || desde);
			} catch (e) {
				throw error(400, 'Esa publicación tiene las propiedades mal escritas: ' + describe(e));
			}
			source = { slug: desde, raw: post.raw, title };
		}
		return {
			category,
			mode: /** @type {'nuevo'} */ ('nuevo'),
			raw: source?.raw ?? TEMPLATES[category],
			sha: '',
			slug: '',
			source: source && { slug: source.slug, title: source.title },
			fromTemplate: !source,
			taken: await takenContentSlugs(category),
			imageUrl: null,
			today: todayInArgentina(),
			maxImageBytes: MAX_IMAGE_BYTES,
			mock: isMockMode(),
			...(await editorData(category))
		};
	};
}

/**
 * /admin/<category>/[slug]
 * @param {'material'|'amigues'} category
 * @returns {import('@sveltejs/kit').ServerLoad}
 */
export function editLoad(category) {
	return async ({ locals, url, params }) => {
		requireAdmin(locals, url);
		const admin = getEventAdmin(locals);
		if (!admin) throw error(403, NO_PERMISSION);
		const slug = params.slug ?? '';
		if (!contentPath(category, slug) || slug.startsWith('_'))
			throw error(404, 'Esa publicación no existe.');
		let post;
		try {
			post = await readContentPost(await getRepoClient(), admin.token, category, slug);
		} catch (e) {
			throw error(502, 'No pudimos leer la publicación desde GitHub: ' + describe(e));
		}
		if (!post) throw error(404, 'Esa publicación no existe.');
		let featured = '';
		try {
			featured = readContentForm(category, post.raw).featured;
		} catch (e) {
			// The editor shows the problem and offers the raw text.
		}
		return {
			category,
			mode: /** @type {'editar'} */ ('editar'),
			raw: post.raw,
			sha: post.sha,
			slug,
			source: null,
			fromTemplate: false,
			taken: [],
			imageUrl: contentImageURL(category, slug, featured) ?? null,
			today: todayInArgentina(),
			maxImageBytes: MAX_IMAGE_BYTES,
			mock: isMockMode(),
			...(await editorData(category))
		};
	};
}

/**
 * The editor's actions: `?/guardar` (create, duplicate or edit) and `?/direccion` (is this slug
 * free on GitHub?).
 * @param {'material'|'amigues'} category
 * @returns {import('@sveltejs/kit').Actions}
 */
export function editorActions(category) {
	return {
		direccion: async ({ locals, request, url }) => {
			requireAdmin(locals, url);
			const admin = getEventAdmin(locals);
			if (!admin) return fail(403, { error: NO_PERMISSION });
			const slug = String((await request.formData()).get('slug') ?? '');
			const problem = validateContentSlug(slug, category, await takenContentSlugs(category));
			if (problem) return { slugCheck: { slug, error: problem } };
			try {
				const client = await getRepoClient();
				const path = contentPath(category, slug);
				const found = await client.existingPaths(admin.token, [
					/** @type {string} */ (path),
					contentMediaDir(category, slug)
				]);
				return {
					slugCheck: {
						slug,
						error: found.length
							? 'Ya existe una publicación (o su carpeta de imágenes) con esa dirección en GitHub.'
							: ''
					}
				};
			} catch (e) {
				return { slugCheck: { slug, error: '', unverified: true } };
			}
		},

		guardar: async ({ locals, request, url, platform }) => {
			requireAdmin(locals, url);
			const admin = getEventAdmin(locals);
			if (!admin) return fail(403, { error: NO_PERMISSION });
			const data = await request.formData();
			const mode = data.get('mode') === 'editar' ? 'editar' : 'nuevo';
			const slug = String(data.get('slug') ?? '').trim();
			const content = String(data.get('content') ?? '');
			const baseSha = String(data.get('sha') ?? '');
			const from = String(data.get('desde') ?? '');
			const isNew = mode === 'nuevo';

			if (!content) return fail(400, { error: 'Faltan datos para guardar. Recargá la página.' });
			if (isNew) {
				const problem = validateContentSlug(slug, category, await takenContentSlugs(category));
				if (problem) return fail(400, { error: problem });
			} else if (!contentPath(category, slug) || !baseSha) {
				return fail(400, { error: 'Faltan datos para guardar. Recargá la página.' });
			}
			// Same checks as the form, on what actually gets written.
			let problems;
			try {
				problems = contentProblems(category, readContentForm(category, content));
			} catch (e) {
				return fail(400, { error: describe(e) });
			}
			if (problems.length) return fail(400, { error: problems.join(' ') });

			/** @type {{base64: string, ext: 'jpg'|'png'|'webp'} | null} */
			let image = null;
			const file = data.get('image');
			if (file instanceof File && file.size > 0) {
				const read = await readUploadedImage(file);
				if ('error' in read) return fail(400, { error: read.error });
				image = { base64: read.base64, ext: read.ext };
			}
			const verb = !isNew ? 'updated' : from ? 'duplicated' : 'created';
			try {
				const client = await getRepoClient();
				const r = await saveContentPost(client, admin.token, {
					category,
					slug,
					content,
					isNew,
					baseSha,
					image,
					message: contentCommitMessage({
						who: admin.name,
						verb,
						category,
						slug,
						from: isNew && from ? from : undefined,
						image: Boolean(image)
					})
				});
				await logAdminAction(getDB(platform), locals, {
					action: `${category}.${isNew ? (from ? 'duplicate' : 'create') : 'update'}`,
					targetType: 'post',
					targetId: `${category}/${slug}`,
					summary:
						(isNew ? (from ? 'Duplicó ' : 'Creó ') : 'Editó ') +
						`${category}/${slug}` +
						(isNew && from ? ` (copia de ${from})` : '') +
						(image ? ' con imagen nueva' : ''),
					detail: { commit: r.commit.url, image: r.imagePath }
				});
				if (isNew)
					throw redirect(
						303,
						`/admin/${category}/${slug}?guardado=${from ? 'duplicado' : 'creado'}`
					);
				return {
					saved: {
						at: Date.now(),
						sha: await gitBlobSha(r.content),
						content: r.content,
						imagePath: r.imagePath,
						commit: r.commit.url
					}
				};
			} catch (e) {
				if (isRedirect(e)) throw e;
				if (e instanceof PathExistsError)
					return fail(409, { error: `Ya existe ${e.path} en GitHub. Elegí otra dirección.` });
				if (e instanceof FileChangedError)
					return fail(409, {
						error:
							'Alguien cambió esta publicación en GitHub mientras la editabas. Copiá tus cambios, recargá la página y volvé a intentar.'
					});
				console.log(e);
				return fail(502, { error: 'No se pudo guardar: ' + describe(e) + '. Probá de nuevo.' });
			}
		}
	};
}
