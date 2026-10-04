/**
 * Loads and form actions shared by /admin/contenido/material/** and /admin/comunidad/perfiles/**
 * (list, nuevo, [slug]; URLs from `contentAdminHref` in nav.js). Each route file is a thin wrapper
 * that picks the category.
 *
 * Every load calls requireAdmin (loads run in parallel with the layout's) and every action checks
 * the admin itself (actions don't run the layout load). Writes go through the same GitHub commit
 * path as the event editor (getRepoClient: dev mock / demo layer / GitHub) and leave an audit
 * entry after the commit.
 */
import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import { withLineEnding } from '$lib/utils/lineEndings.js';
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
import {
	FileChangedError,
	PathExistsError,
	PendingChangeError
} from '$lib/server/eventos/github.js';
import { readUploadedImage } from '$lib/server/eventos/images.js';
import { findImage, imageOf } from '$lib/server/media/library.js';
import { resolveContentSlug } from '$lib/server/contenido/posts.js';
import { readImageChoice } from '$lib/utils/imageChoice.js';
import {
	contentProblems,
	readContentForm,
	setUnlistedFlag,
	validateContentSlug
} from '$lib/utils/contentPosts.js';
import { MAX_IMAGE_BYTES, todayInArgentina } from '$lib/utils/eventDraft.js';
import { contentAdminHref } from '$lib/admin/nav.js';
import { commitSavedToDb, pathExistsMessage, saveCopy } from '$lib/admin/saveCopy.js';
import { panelSavesToDb } from '$lib/server/contenido/saving.js';
import { activeRoles, editorPersonas, personasFileErrors } from '$lib/server/personas/index.js';
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

/** @param {App.Locals} locals */
const adminViewer = (locals) =>
	/** @type {import('$lib/server/objects/visibility.js').Viewer} */ ({
		role: 'admin',
		id: locals.user?.login ?? 'panel'
	});

/**
 * La imagen del material para el selector (docs/imagenes.md): la de la biblioteca (edge
 * `portada`) si tiene; si no, la vieja del repo. Solo material: las fichas de amigues siguen
 * subiendo su imagen al repo (no son de la base).
 * @param {App.Platform | undefined} platform
 * @param {App.Locals} locals
 * @param {string} slug '' = una publicación nueva
 * @param {string | undefined} legacyUrl
 */
async function materialImage(platform, locals, slug, legacyUrl) {
	const db = getDB(platform);
	/** @type {import('$lib/server/media/library.js').PublicImage | null} */
	let current = null;
	if (db && slug) {
		try {
			const ref = await resolveContentSlug(db, 'material', slug);
			if (ref) current = await imageOf(db, ref.id, 'portada', adminViewer(locals));
		} catch {
			// Sin la de la biblioteca, se muestra la del repo.
		}
	}
	return {
		current,
		legacyUrl: current ? null : (legacyUrl ?? null),
		target: slug ? `material:${slug}` : null
	};
}

/* ------------------------------------------------------------------------------------------ */
/*  List                                                                                       */
/* ------------------------------------------------------------------------------------------ */

/**
 * @param {'material'|'amigues'} category
 */
export function listLoad(category) {
	/** @param {{locals: App.Locals, url: URL}} event */
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
		/** @type {import('$lib/server/eventos/github.js').PublishResult | null} */
		let publish = null;
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
				}),
				pr: { action: unlisted ? 'oculta' : 'vuelve a listar', who: admin.name }
			});
			publish = r.commit.pr ?? null;
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
			if (e instanceof PendingChangeError) return fail(409, { error: e.message + '.' });
			return fail(502, { error: 'No se pudo guardar: ' + describe(e) });
		}
		return { visibility: { slug, unlisted, publish } };
	};
}

/* ------------------------------------------------------------------------------------------ */
/*  Editor                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/**
 * <contentAdminHref(category)>/nuevo[?desde=slug]
 * @param {'material'|'amigues'} category
 */
export function newLoad(category) {
	/** @param {{locals: App.Locals, url: URL, platform?: App.Platform}} event */
	return async ({ locals, url, platform }) => {
		requireAdmin(locals, url);
		const admin = getEventAdmin(locals);
		if (!admin) throw error(403, NO_PERMISSION);
		// Lo nuevo de material va a la base (se ve enseguida).
		const savesToDb = await panelSavesToDb(platform, category);
		const desde = url.searchParams.get('desde') ?? '';
		/** @type {null | {slug: string, raw: string, title: string}} */
		let source = null;
		if (desde) {
			if (!contentPath(category, desde)) throw error(400, 'Esa publicación no existe.');
			let post;
			try {
				post = await readContentPost(await getRepoClient(), admin.token, category, desde);
			} catch (e) {
				throw error(502, saveCopy(savesToDb).postReadFailed + describe(e));
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
			// Material: el selector de imágenes (docs/imagenes.md).
			image: category === 'material' ? await materialImage(platform, locals, '', undefined) : null,
			today: todayInArgentina(),
			maxImageBytes: MAX_IMAGE_BYTES,
			savesToDb,
			mock: isMockMode(),
			...(await editorData(category)),
			// Personas con rol en el material (sin base, null).
			personas: category === 'material' ? await editorPersonas(platform) : null
		};
	};
}

/**
 * <contentAdminHref(category)>/[slug]
 * @param {'material'|'amigues'} category
 */
export function editLoad(category) {
	/** @param {{locals: App.Locals, url: URL, params: Record<string, string>, platform?: App.Platform}} event */
	return async ({ locals, url, params, platform }) => {
		requireAdmin(locals, url);
		const admin = getEventAdmin(locals);
		if (!admin) throw error(403, NO_PERMISSION);
		const slug = params.slug ?? '';
		if (!contentPath(category, slug) || slug.startsWith('_'))
			throw error(404, 'Esa publicación no existe.');
		// El material se guarda en la base (se ve enseguida); amigues, con un PR.
		const savesToDb = await panelSavesToDb(platform, category, slug);
		let post;
		try {
			post = await readContentPost(await getRepoClient(), admin.token, category, slug);
		} catch (e) {
			throw error(502, saveCopy(savesToDb).postReadFailed + describe(e));
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
			// Material: el selector de imágenes (docs/imagenes.md).
			image:
				category === 'material'
					? await materialImage(
							platform,
							locals,
							slug,
							contentImageURL(category, slug, featured) ?? undefined
						)
					: null,
			today: todayInArgentina(),
			maxImageBytes: MAX_IMAGE_BYTES,
			savesToDb,
			mock: isMockMode(),
			...(await editorData(category)),
			// Personas con rol en el material (sin base, null).
			personas: category === 'material' ? await editorPersonas(platform) : null
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
		direccion: async ({ locals, request, url, platform }) => {
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
						error: found.length ? saveCopy(await panelSavesToDb(platform, category)).slugTaken : ''
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
			// Same line endings as the file that was opened (the textarea sends CRLF).
			const content = withLineEnding(String(data.get('content') ?? ''), data.get('eol'));
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
			// Personas con rol: perfiles (o nombres) y roles válidos.
			// Como en el editor de publicaciones, lo que el archivo ya tenía mal no bloquea.
			const roles = category === 'material' ? await activeRoles(platform) : null;
			if (roles) {
				let added = personasFileErrors(content, roles);
				if (added.length && !isNew) {
					try {
						const current = await readContentPost(
							await getRepoClient(),
							admin.token,
							category,
							slug
						);
						const before = current ? personasFileErrors(current.raw, roles) : [];
						added = added.filter((e) => !before.includes(e));
					} catch {
						// Sin el archivo actual, todo cuenta como nuevo.
					}
				}
				if (added.length) return fail(400, { error: added.join(' ') });
			}

			// Material: la imagen elegida en el selector va como edge `portada` en el mismo guardado
			// (docs/imagenes.md). Amigues: el archivo subido va al repo, como antes.
			/** @type {Record<string, number[]> | undefined} */
			let edges;
			if (category === 'material') {
				const choice = readImageChoice(data.get('imageId'));
				if (choice.action === 'remove') edges = { portada: [] };
				if (choice.action === 'set') {
					const db = getDB(platform);
					const picked = db ? await findImage(db, choice.id, adminViewer(locals)) : null;
					if (!picked)
						return fail(400, {
							error: 'La imagen elegida ya no está en la biblioteca. Elegí otra.'
						});
					edges = { portada: [picked.id] };
				}
			}
			/** @type {{base64: string, ext: 'jpg'|'png'|'webp'} | null} */
			let image = null;
			const file = category === 'material' ? null : data.get('image');
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
					}),
					pr: { action: !isNew ? 'edita' : from ? 'duplica' : 'crea', who: admin.name },
					...(edges ? { edges } : {})
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
				if (isNew) {
					const pr = r.commit.pr ? `&pr=${r.commit.pr.number}&estado=${r.commit.pr.state}` : '';
					throw redirect(
						303,
						`${contentAdminHref(category)}/${slug}?guardado=${from ? 'duplicado' : 'creado'}${pr}`
					);
				}
				return {
					saved: {
						at: Date.now(),
						sha: await gitBlobSha(r.content),
						content: r.content,
						imagePath: r.imagePath,
						commit: r.commit.url,
						publish: r.commit.pr ?? null,
						// Se guardó en la base (ya se ve).
						savedToDb: commitSavedToDb(r.commit)
					}
				};
			} catch (e) {
				if (isRedirect(e)) throw e;
				const toDb = await panelSavesToDb(platform, category, isNew ? '' : slug).catch(() => false);
				if (e instanceof PathExistsError)
					return fail(409, { error: pathExistsMessage(toDb, e.path) });
				if (e instanceof PendingChangeError) return fail(409, { error: e.message + '.' });
				if (e instanceof FileChangedError)
					return fail(409, { error: saveCopy(toDb).changedMeanwhile });
				console.log(e);
				return fail(502, { error: 'No se pudo guardar: ' + describe(e) + '. Probá de nuevo.' });
			}
		}
	};
}
