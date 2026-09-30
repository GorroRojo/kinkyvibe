import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB } from '$lib/server/db';
import {
	POSTS_DIR,
	getEventAdmin,
	getRepoClient,
	isMockMode,
	featuredURL,
	takenSlugsInBundle
} from '$lib/server/eventos';
import {
	FileChangedError,
	GitHubError,
	PathExistsError,
	PendingChangeError
} from '$lib/server/eventos/github.js';
import {
	findAssetUsers,
	readUploadedImage,
	sharedAssetCommit
} from '$lib/server/eventos/images.js';
import {
	isSafeAssetName,
	isSharedAsset,
	replacementAssetName,
	uploadScope
} from '$lib/utils/sharedImage.js';
import { editorData } from '$lib/server/admin/content.js';
import { validateEventTags } from '$lib/utils/adminTags.js';
import { ticketsFileErrors } from '$lib/server/tickets/editor.js';
// The owner's own starting point for new events; NEW_EVENT_TEMPLATE is only a fallback.
import eventTemplate from '$lib/posts/calendario/_event_template.md?raw';
import {
	MAX_IMAGE_BYTES,
	NEW_EVENT_TEMPLATE,
	applyFrontmatterChanges,
	isNumericFeatured,
	joinMarkdown,
	readEventFields,
	splitMarkdown,
	todayInArgentina,
	validateSlug
} from '$lib/utils/eventDraft.js';

const NO_PERMISSION =
	'No tenés permiso para cargar eventos. Probá cerrar sesión y volver a entrar.';

/** @param {string} slug */
const eventPath = (slug) => `${POSTS_DIR}/${slug}.md`;
/** @param {string} slug */
const mediaPath = (slug) => `${POSTS_DIR}/media/${slug}`;

/** @param {unknown} e */
function describeError(e) {
	return e instanceof Error ? e.message : String(e);
}

/** @param {string} raw */
function usableTemplate(raw) {
	try {
		readEventFields(splitMarkdown(raw).frontmatter);
		return raw;
	} catch (e) {
		return null;
	}
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url }) {
	requireAdmin(locals, url);
	const admin = getEventAdmin(locals);
	if (!admin) throw error(403, NO_PERMISSION);
	const desde = url.searchParams.get('desde');
	/** @type {null | {slug: string, raw: string, title: string, featured: string, featuredUrl?: string}} */
	let source = null;
	if (desde) {
		if (validateSlug(desde)) throw error(400, 'Ese evento no existe.');
		const client = await getRepoClient();
		let raw;
		try {
			raw = await client.getFile(admin.token, eventPath(desde));
		} catch (e) {
			throw error(502, 'No pudimos leer el evento desde GitHub: ' + describeError(e));
		}
		if (raw === null) throw error(404, `No encontramos el evento “${desde}”.`);
		let fields;
		try {
			fields = readEventFields(splitMarkdown(raw).frontmatter);
		} catch (e) {
			throw error(
				422,
				`El archivo de “${desde}” tiene un formato que esta página no entiende (${describeError(
					e
				)}). Probá duplicar otro evento o crear uno desde cero.`
			);
		}
		source = {
			slug: desde,
			raw,
			title: fields.title,
			featured: fields.featured,
			featuredUrl: featuredURL(desde, fields.featured)
		};
	}
	return {
		source,
		// Tag usage, amigues profiles and past organizers for the pickers.
		...(await editorData('calendario')),
		template: usableTemplate(eventTemplate) ?? NEW_EVENT_TEMPLATE,
		today: todayInArgentina(),
		takenSlugs: takenSlugsInBundle(),
		maxImageBytes: MAX_IMAGE_BYTES,
		mock: isMockMode()
	};
}

/**
 * Is the slug free on GitHub (no event file and no media folder)?
 * @param {Awaited<ReturnType<typeof getRepoClient>>} client
 * @param {string} token
 * @param {string} slug
 */
async function slugIsFree(client, token, slug) {
	const [md, media] = await Promise.all([
		client.pathExists(token, eventPath(slug)),
		client.pathExists(token, mediaPath(slug))
	]);
	return !md && !media;
}

/**
 * @param {Awaited<ReturnType<typeof getRepoClient>>} client
 * @param {string} token
 * @param {string} slug
 */
async function suggestFreeSlug(client, token, slug) {
	for (let i = 2; i < 10; i++) {
		const candidate = `${slug}-${i}`;
		if (await slugIsFree(client, token, candidate)) return candidate;
	}
	return undefined;
}

/** @type {import('./$types').Actions} */
export const actions = {
	/** Checks the slug against GitHub right before showing the preview. */
	verificar: async ({ locals, request }) => {
		const admin = getEventAdmin(locals);
		if (!admin) return fail(403, { error: NO_PERMISSION });
		const data = await request.formData();
		const slug = String(data.get('slug') ?? '').trim();
		// Set when the new image replaces a shared one for every edition: the review step lists
		// the events that will show it.
		const sharedAsset = String(data.get('sharedAsset') ?? '').trim();
		const invalid = validateSlug(slug);
		if (invalid) return fail(400, { slugError: invalid });
		const client = await getRepoClient();
		try {
			if (await slugIsFree(client, admin.token, slug)) {
				const affected =
					sharedAsset && isSafeAssetName(sharedAsset)
						? await findAssetUsers(client, admin.token, sharedAsset)
						: undefined;
				return { slugOk: slug, affected };
			}
			return fail(409, {
				slugError: 'Ya existe un evento con esa dirección.',
				suggestion: await suggestFreeSlug(client, admin.token, slug)
			});
		} catch (e) {
			return fail(502, { error: 'No pudimos consultar GitHub: ' + describeError(e) });
		}
	},

	publicar: async ({ locals, request, platform }) => {
		const admin = getEventAdmin(locals);
		if (!admin) return fail(403, { error: NO_PERMISSION });
		const data = await request.formData();
		const slug = String(data.get('slug') ?? '').trim();
		const mode = data.get('mode') === 'borrador' ? 'borrador' : 'publicar';
		const featuredMode = String(data.get('featuredMode') ?? 'keep');
		let source = String(data.get('source') ?? '').trim();
		if (source && validateSlug(source)) source = '';

		const slugError = validateSlug(slug);
		if (slugError) return fail(400, { error: slugError, slugError });

		const client = await getRepoClient();

		/* The uploaded image, and where it goes (see $lib/utils/sharedImage.js). */
		/** @type {null | {ext: 'jpg'|'png'|'webp', base64: string}} */
		let upload = null;
		/** @type {'todas'|'esta'} */
		let scope = 'esta';
		let sharedName = '';
		if (featuredMode === 'upload') {
			const read = await readUploadedImage(data.get('image'));
			if ('error' in read) return fail(400, { error: read.error });
			upload = read;
			if (source) {
				// What the source event uses right now on GitHub, not what the form says.
				let sourceRaw;
				try {
					sourceRaw = await client.getFile(admin.token, eventPath(source));
				} catch (e) {
					return fail(502, { error: 'No pudimos leer el evento original: ' + describeError(e) });
				}
				const sourceFeatured = sourceRaw
					? readEventFields(splitMarkdown(sourceRaw).frontmatter).featured
					: '';
				const asked = String(data.get('imageScope') ?? '');
				if (isSharedAsset(sourceFeatured)) {
					if (asked !== 'todas' && asked !== 'esta')
						return fail(400, {
							error:
								'¿La imagen nueva es para todas las ediciones de este evento o solo para esta? Elegí una opción.'
						});
					if (asked === 'todas' && !isSafeAssetName(sourceFeatured))
						return fail(400, {
							error: `La imagen compartida «${sourceFeatured}» tiene un nombre raro y no se puede reemplazar desde acá. Elegí «Solo esta».`
						});
				}
				scope = uploadScope(sourceFeatured, asked);
				sharedName = scope === 'todas' ? sourceFeatured.trim() : '';
			}
		}

		// Validate the generated file and apply the listed/unlisted choice.
		let content;
		let fields;
		try {
			const { frontmatter, body } = splitMarkdown(String(data.get('content') ?? ''));
			fields = readEventFields(frontmatter);
			if (fields.category !== 'calendario')
				throw new Error('El evento tiene que tener category: calendario.');
			if (!fields.title) throw new Error('Falta el título.');
			if (!fields.start) throw new Error('Falta la fecha de inicio.');
			// Same rules as the form: one language, one place (see $lib/utils/adminTags.js).
			const tagErrors = validateEventTags(fields.tags);
			if (tagErrors.length) throw new Error(tagErrors.join(' '));
			// Venta de entradas: las mismas reglas que el formulario y que la venta.
			const ticketErrors = ticketsFileErrors(String(data.get('content') ?? ''));
			if (ticketErrors.length) throw new Error(ticketErrors.join(' '));
			/** @type {Record<string, any>} */
			const changes = {
				force_unlisted: mode === 'borrador' ? true : fields.force_unlisted ? null : undefined
			};
			if (upload)
				changes.featured = scope === 'todas' ? replacementAssetName(sharedName, upload.ext) : 1;
			content = joinMarkdown(applyFrontmatterChanges(frontmatter, changes), body);
		} catch (e) {
			return fail(400, { error: describeError(e) });
		}

		/** @type {import('$lib/server/eventos/github.js').CommitFile[]} */
		const files = [{ path: eventPath(slug), content }];
		/** @type {string[]} */
		const warnings = [];
		/** @type {string[]} */
		const mustNotExist = [eventPath(slug), mediaPath(slug)];
		/** @type {Array<{path: string, sha: string}>} */
		let unchanged = [];
		/** @type {import('$lib/utils/sharedImage.js').AffectedEvent[]} */
		let affected = [];
		/** @type {string[]} */
		let deleted = [];

		try {
			if (upload && scope === 'todas') {
				// Replace the shared image itself: every edition shows the new one.
				const shared = await sharedAssetCommit(client, admin.token, {
					oldName: sharedName,
					ext: upload.ext,
					base64: upload.base64
				});
				files.push(...shared.commitFiles);
				deleted = shared.commitFiles.filter((f) => f.delete).map((f) => f.path);
				mustNotExist.push(...shared.mustNotExist);
				unchanged = shared.unchanged;
				affected = shared.affected;
			} else if (upload) {
				files.push({ path: `${mediaPath(slug)}/1.${upload.ext}`, base64: upload.base64 });
			} else if (featuredMode === 'keep' && source && isNumericFeatured(fields.featured)) {
				// The image lives in the source event's media folder; copy it (GitHub reuses the
				// existing blob, nothing is re-uploaded) so the new event is self-contained.
				const list = await client.listDir(admin.token, mediaPath(source));
				const id = String(fields.featured).trim();
				const hit = ['jpeg', 'jfif', 'jpg', 'png', 'webp']
					.map((f) => list.find((item) => item.name === `${id}.${f}`))
					.find(Boolean);
				if (hit) files.push({ path: `${mediaPath(slug)}/${hit.name}`, sha: hit.sha });
				else
					warnings.push(
						'No encontramos la imagen del evento original, así que el evento quedó sin imagen.'
					);
			}

			const what = mode === 'borrador' ? 'cargó (no listado)' : 'publicó';
			const message =
				`[admin] ${admin.name} ${what} calendario/${slug}` +
				(source ? ` (copia de ${source})` : '') +
				(scope === 'todas'
					? ` y cambió la imagen compartida ${sharedName} para todas las ediciones (${affected.length} eventos más)`
					: '');
			const commit = await client.commitFiles(admin.token, {
				files,
				message,
				mustNotExist,
				unchanged,
				pr: {
					action: mode === 'borrador' ? 'carga (no listado)' : source ? 'duplica' : 'publica',
					who: admin.name
				}
			});
			await logAdminAction(getDB(platform), locals, {
				action: mode === 'borrador' ? 'event.draft' : 'event.publish',
				targetType: 'event',
				targetId: slug,
				summary:
					(mode === 'borrador' ? 'Cargó como no listado ' : 'Publicó ') +
					`calendario/${slug}` +
					(source ? ` (copia de ${source})` : ''),
				detail: { source: source || null, commit: commit.url, imageScope: upload ? scope : null }
			});
			return {
				success: true,
				slug,
				mode,
				commitUrl: commit.url,
				publish: commit.pr ?? null,
				eventUrl: `/calendario/${slug}`,
				files: files.filter((f) => !f.delete).map((f) => f.path),
				deleted,
				imageScope: upload ? scope : undefined,
				affected,
				content,
				warnings,
				mock: isMockMode()
			};
		} catch (e) {
			if (e instanceof PendingChangeError) return fail(409, { error: e.message + '.' });
			if (e instanceof FileChangedError) {
				return fail(409, {
					error:
						'Alguien cambió otro evento que usa esta imagen mientras tanto. Volvé a «Revisar» y probá de nuevo.'
				});
			}
			if (e instanceof PathExistsError) {
				return fail(409, {
					error: 'Ya existe un evento con esa dirección. Elegí otra.',
					slugError: 'Ya existe un evento con esa dirección.',
					suggestion: await suggestFreeSlug(client, admin.token, slug).catch(() => undefined)
				});
			}
			const hint =
				e instanceof GitHubError && (e.status === 401 || e.status === 403)
					? ' Probá cerrar sesión y volver a entrar.'
					: '';
			return fail(502, { error: 'No se pudo guardar en GitHub: ' + describeError(e) + hint });
		}
	}
};
