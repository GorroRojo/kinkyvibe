import { error, fail } from '@sveltejs/kit';
import { Buffer } from 'buffer';
import { requireAdmin } from '$lib/server/auth';
import {
	POSTS_DIR,
	getEventAdmin,
	getRepoClient,
	isMockMode,
	featuredURL,
	takenSlugsInBundle
} from '$lib/server/eventos';
import { GitHubError, PathExistsError } from '$lib/server/eventos/github.js';
// The owner's own starting point for new events; NEW_EVENT_TEMPLATE is only a fallback.
import eventTemplate from '$lib/posts/calendario/_event_template.md?raw';
import {
	MAX_IMAGE_BYTES,
	NEW_EVENT_TEMPLATE,
	applyFrontmatterChanges,
	detectImageType,
	isNumericFeatured,
	joinMarkdown,
	readEventFields,
	splitMarkdown,
	todayInArgentina,
	validateSlug
} from '$lib/utils/eventDraft.js';

const NO_PERMISSION = 'No tenés permiso para cargar eventos. Probá cerrar sesión y volver a entrar.';

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
	if (!admin) error(403, NO_PERMISSION);
	const desde = url.searchParams.get('desde');
	/** @type {null | {slug: string, raw: string, title: string, featured: string, featuredUrl?: string}} */
	let source = null;
	if (desde) {
		if (validateSlug(desde)) error(400, 'Ese evento no existe.');
		const client = await getRepoClient();
		let raw;
		try {
			raw = await client.getFile(admin.token, eventPath(desde));
		} catch (e) {
			error(502, 'No pudimos leer el evento desde GitHub: ' + describeError(e));
		}
		if (raw === null) error(404, `No encontramos el evento “${desde}”.`);
		let fields;
		try {
			fields = readEventFields(splitMarkdown(raw).frontmatter);
		} catch (e) {
			error(
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
		const slug = String((await request.formData()).get('slug') ?? '').trim();
		const invalid = validateSlug(slug);
		if (invalid) return fail(400, { slugError: invalid });
		const client = await getRepoClient();
		try {
			if (await slugIsFree(client, admin.token, slug)) return { slugOk: slug };
			return fail(409, {
				slugError: 'Ya existe un evento con esa dirección.',
				suggestion: await suggestFreeSlug(client, admin.token, slug)
			});
		} catch (e) {
			return fail(502, { error: 'No pudimos consultar GitHub: ' + describeError(e) });
		}
	},

	publicar: async ({ locals, request }) => {
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

		// Validate the generated file and apply the listed/unlisted choice.
		let content;
		let fields;
		try {
			const { frontmatter, body } = splitMarkdown(String(data.get('content') ?? ''));
			fields = readEventFields(frontmatter);
			if (fields.category !== 'calendario') throw new Error('El evento tiene que tener category: calendario.');
			if (!fields.title) throw new Error('Falta el título.');
			if (!fields.start) throw new Error('Falta la fecha de inicio.');
			/** @type {Record<string, any>} */
			const changes = {
				force_unlisted: mode === 'borrador' ? true : fields.force_unlisted ? null : undefined
			};
			if (featuredMode === 'upload') changes.featured = 1;
			content = joinMarkdown(applyFrontmatterChanges(frontmatter, changes), body);
		} catch (e) {
			return fail(400, { error: describeError(e) });
		}

		/** @type {import('$lib/server/eventos/github.js').CommitFile[]} */
		const files = [{ path: eventPath(slug), content }];
		/** @type {string[]} */
		const warnings = [];
		const client = await getRepoClient();

		try {
			if (featuredMode === 'upload') {
				const image = data.get('image');
				if (!(image instanceof File) || image.size === 0) {
					return fail(400, { error: 'Elegiste subir una imagen pero no llegó ningún archivo. Volvé a elegirla.' });
				}
				if (image.size > MAX_IMAGE_BYTES) {
					return fail(400, { error: 'La imagen pesa más de 5 MB. Probá con una más liviana.' });
				}
				const bytes = new Uint8Array(await image.arrayBuffer());
				const ext = detectImageType(bytes);
				if (!ext) return fail(400, { error: 'La imagen tiene que ser JPG, PNG o WEBP.' });
				files.push({
					path: `${mediaPath(slug)}/1.${ext}`,
					base64: Buffer.from(bytes).toString('base64')
				});
			} else if (featuredMode === 'keep' && source && isNumericFeatured(fields.featured)) {
				// The image lives in the source event's media folder; copy it (GitHub reuses the
				// existing blob, nothing is re-uploaded) so the new event is self-contained.
				const list = await client.listDir(admin.token, mediaPath(source));
				const id = String(fields.featured).trim();
				const hit = ['jpeg', 'jfif', 'jpg', 'png', 'webp']
					.map((f) => list.find((item) => item.name === `${id}.${f}`))
					.find(Boolean);
				if (hit) files.push({ path: `${mediaPath(slug)}/${hit.name}`, sha: hit.sha });
				else warnings.push('No encontramos la imagen del evento original, así que el evento quedó sin imagen.');
			}

			const what = mode === 'borrador' ? 'cargó (no listado)' : 'publicó';
			const message =
				`[admin] ${admin.name} ${what} calendario/${slug}` + (source ? ` (copia de ${source})` : '');
			const commit = await client.commitFiles(admin.token, {
				files,
				message,
				mustNotExist: [eventPath(slug), mediaPath(slug)]
			});
			return {
				success: true,
				slug,
				mode,
				commitUrl: commit.url,
				eventUrl: `/calendario/${slug}`,
				files: files.map((f) => f.path),
				content,
				warnings,
				mock: isMockMode()
			};
		} catch (e) {
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
