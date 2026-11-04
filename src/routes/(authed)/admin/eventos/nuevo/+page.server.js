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
import { FileChangedError, PathExistsError } from '$lib/server/contenido/cliente.js';
import { legacyNumberedURL } from '$lib/utils/legacyMedia.js';
import { findImage } from '$lib/server/media/library.js';
import { readImageChoice } from '$lib/utils/imageChoice.js';
import { libraryCoverOf } from '$lib/server/contenido/posts.js';
import { EVENT_CATEGORY } from '$lib/server/contenido/eventos.js';
import { editorData } from '$lib/server/admin/content.js';
import { validateEventTags } from '$lib/utils/adminTags.js';
import { ticketsFileErrors } from '$lib/server/tickets/editor.js';
import { linkFileErrors, placeFileErrors } from '$lib/server/eventos/fileErrors.js';
import { transferReady } from '$lib/server/tickets/index.js';
import { activeRoles, editorPersonas, personasFileErrors } from '$lib/server/personas/index.js';
import { saveCopy } from '$lib/admin/saveCopy.js';
import { siteTags, tagExists } from '$lib/server/series/index.js';
import { gitBlobSha } from '$lib/server/admin/posts.js';
import { seriesTagIds } from '$lib/utils/series.js';
import { readSeriesChoice, seriesCreateOps, seriesPromptFor } from '$lib/utils/seriesAdmin.js';
import { addTagToPost } from '$lib/utils/tagConfig.js';
import { NEEDS_IMPORT, dbTagsForAdmin, saveTagOpsToDb } from '$lib/server/etiquetas/panel.js';
import { planDbTagEdit } from '$lib/server/etiquetas/editor.js';
import { readNewEventPrefill } from '$lib/utils/calendario.js';
import {
	checkVenueChoice,
	createVenueAction,
	editVenueAction,
	saveVenueChoice,
	venueNotSavedWarning,
	venuePickerData
} from '$lib/server/amigues/eventFormVenue.js';
import { readVenueChoice } from '$lib/utils/venueChoice.js';
import { duplicableEvents } from '$lib/server/eventos/drafts.js';
import { inOrder } from '$lib/utils/inOrder.js';
// The owner's own starting point for new events; NEW_EVENT_TEMPLATE is only a fallback.
import eventTemplate from '$lib/admin/plantillas/evento.md?raw';
import {
	NEW_EVENT_TEMPLATE,
	applyFrontmatterChanges,
	isNumericFeatured,
	joinMarkdown,
	readEventFields,
	splitMarkdown,
	todayInArgentina,
	validateSlug
} from '$lib/utils/eventDraft.js';

const NO_PERMISSION = 'No tenés permiso para cargar eventos. Probá salir y volver a entrar.';

/** @param {string} slug */
const eventPath = (slug) => `${POSTS_DIR}/${slug}.md`;

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
export async function load({ locals, url, platform }) {
	requireAdmin(locals, url);
	const admin = getEventAdmin(locals);
	if (!admin) throw error(403, NO_PERMISSION);
	const desde = url.searchParams.get('desde');
	/** @type {null | {slug: string, raw: string, title: string, featured: string, featuredUrl?: string, image: import('$lib/server/media/library.js').PublicImage | null}} */
	let source = null;
	/** @type {ReturnType<typeof seriesPromptFor>} */
	let seriesPrompt = null;
	if (desde && validateSlug(desde)) throw error(400, 'Ese evento no existe.');
	const db = getDB(platform);
	// Lo que no depende del archivo del original sale a la par de él (cada lectura en fila es una
	// ida); se espera después, así que sus errores (404, 422, 502) salen primero, como antes. Si hay
	// `desde`, al llegar abajo el original existe (si no, ya salió el error): su lugar, su imagen y
	// sin «¿Es otra edición…?».
	const imageP = desde ? sourceImage(db, locals, desde) : null;
	const rest = inOrder([
		// Tag usage, amigues profiles and past organizers for the pickers.
		editorData('calendario'),
		// Personas con rol: roles y perfiles públicos (sin base, null).
		editorPersonas(platform),
		// «¿Es otra edición de un evento que ya existe?» (solo al cargar uno de cero)
		desde ? [] : duplicableEvents(),
		// «Lugar»: los lugares para elegir; al duplicar, el del evento original (su edge `lugar`).
		venuePickerData(db, desde || null),
		// ¿Hay datos para transferir? Solo sí/no: el editor avisa si «Transferencia» no se ofrece.
		transferReady(db)
	]);
	rest.catch(() => {});
	if (desde) {
		const client = await getRepoClient();
		let raw;
		try {
			raw = await client.getFile(admin.token, eventPath(desde));
		} catch (e) {
			throw error(502, saveCopy().eventReadFailed + describeError(e));
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
		// La imagen de la biblioteca del original (edge `portada`), si tiene; si no, la del repo.
		const image = await imageP;
		source = {
			slug: desde,
			raw,
			title: fields.title,
			featured: fields.featured,
			featuredUrl: image ? image.url : featuredURL(desde, fields.featured),
			image
		};
		// Si el original no está en una serie, «¿Es parte de una serie?».
		seriesPrompt = seriesPromptFor(fields, seriesTagIds(siteTags()));
	}
	const [editor, personas, duplicables, venuePicker, transfer] = await rest;
	return {
		source,
		seriesPrompt,
		...editor,
		personas,
		template: usableTemplate(eventTemplate) ?? NEW_EVENT_TEMPLATE,
		today: todayInArgentina(),
		// ?fecha=&hora=&hasta= (tocar un día en el calendario de la agenda)
		prefill: readNewEventPrefill(url.searchParams),
		duplicables,
		venuePicker,
		transferReady: transfer,
		takenSlugs: takenSlugsInBundle(),
		// Todo se guarda en la base (decisión 0032); la clave queda mientras el formulario la lea.
		savesToDb: true,
		mock: isMockMode()
	};
}

/** @param {App.Locals} locals */
const adminViewer = (locals) =>
	/** @type {import('$lib/server/objects/visibility.js').Viewer} */ ({
		role: 'admin',
		id: locals.user?.login ?? 'panel'
	});

/**
 * La imagen de la biblioteca de un evento (edge `portada`), o null.
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {App.Locals} locals
 * @param {string} slug
 */
function sourceImage(db, locals, slug) {
	return libraryCoverOf(db, EVENT_CATEGORY, slug, adminViewer(locals));
}

/**
 * Is the slug free (no event in the database, not even a deleted one, and not an old media
 * folder: its images are still in the library under that name)?
 * @param {Awaited<ReturnType<typeof getRepoClient>>} client
 * @param {string} token
 * @param {string} slug
 */
async function slugIsFree(client, token, slug) {
	if (takenSlugsInBundle().includes(slug)) return false;
	return !(await client.pathExists(token, eventPath(slug)));
}

/**
 * El id del objeto `imagen` (vivo) de una dirección de la biblioteca (`…/media/img/<sha>.<ext>`), o
 * null.
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 * @param {string | undefined} url
 * @returns {Promise<number | null>}
 */
async function legacyLibraryImage(db, url) {
	const sha = url ? /\/media\/img\/([0-9a-f]{64})\.[a-z]+$/.exec(url)?.[1] : undefined;
	if (!db || !sha) return null;
	const row = await db
		.prepare("SELECT id FROM objects WHERE type = 'imagen' AND slug = ?1 AND deleted_at IS NULL")
		.bind(sha)
		.first();
	return row ? Number(row.id) : null;
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
	/** Checks the slug right before showing the preview. */
	verificar: async ({ locals, request }) => {
		const admin = getEventAdmin(locals);
		if (!admin) return fail(403, { error: NO_PERMISSION });
		const data = await request.formData();
		const slug = String(data.get('slug') ?? '').trim();
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
			return fail(502, { error: saveCopy().slugCheckFailed + describeError(e) });
		}
	},

	/** «+ Crear lugar» desde el «Lugar» del formulario (solo admins, como Eventos → Lugares). */
	crearLugar: createVenueAction,
	/** Edición rápida del lugar elegido (nombre, dirección, barrio y ciudad). */
	editarLugar: editVenueAction,

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

		/* La imagen (docs/imagenes.md): una de la biblioteca (edge `portada`), la del original o
		   ninguna. */
		/** @type {number[] | undefined} */
		let portada;
		if (featuredMode === 'library') {
			const choice = readImageChoice(data.get('imageId'));
			const db = getDB(platform);
			const image =
				choice.action === 'set' && db ? await findImage(db, choice.id, adminViewer(locals)) : null;
			if (!image)
				return fail(400, { error: 'La imagen elegida ya no está en la biblioteca. Elegí otra.' });
			portada = [image.id];
		} else if (featuredMode === 'keep' && source) {
			const image = await sourceImage(getDB(platform), locals, source);
			if (image) portada = [image.id];
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
			// «Dónde»: el link al mapa, si está, https de OpenStreetMap o Google Maps.
			const placeErrors = placeFileErrors(String(data.get('content') ?? ''));
			if (placeErrors.length) throw new Error(placeErrors.join(' '));
			// Link de inscripción: web, mail (mailto:) o página del sitio; nunca javascript:.
			const linkErrors = linkFileErrors(String(data.get('content') ?? ''));
			if (linkErrors.length) throw new Error(linkErrors.join(' '));
			// Personas con rol: perfiles (o nombres) y roles válidos.
			const roles = await activeRoles(platform);
			const personasErrors = roles
				? personasFileErrors(String(data.get('content') ?? ''), roles)
				: [];
			if (personasErrors.length) throw new Error(personasErrors.join(' '));
			/** @type {Record<string, any>} */
			const changes = {
				force_unlisted: mode === 'borrador' ? true : fields.force_unlisted ? null : undefined
			};
			// Con una imagen de la biblioteca, la vieja del repo no hace falta.
			if (featuredMode !== 'keep' || portada) changes.featured = null;
			content = joinMarkdown(applyFrontmatterChanges(frontmatter, changes), body);
		} catch (e) {
			return fail(400, { error: describeError(e) });
		}

		// «Lugar»: va al edge `lugar` del evento en la base (no al archivo), recién cuando el evento
		// se creó. Si el lugar ya no existe, no se crea nada.
		const venue = readVenueChoice(data);
		const venueCheck = await checkVenueChoice(getDB(platform), venue);
		if (!venueCheck.ok) return fail(400, { error: venueCheck.message });

		// «¿Es parte de una serie?» (solo al duplicar).
		/** @type {import('$lib/utils/seriesAdmin.js').SeriesChoice} */
		let seriesChoice = { type: 'none' };
		if (source && data.has('seriesChoice')) {
			const read = readSeriesChoice(
				{
					choice: data.get('seriesChoice'),
					name: data.get('seriesName'),
					existing: data.get('seriesExisting'),
					markSource: data.get('seriesMarkSource')
				},
				{ seriesIds: seriesTagIds(siteTags()), exists: (n) => tagExists(n) }
			);
			if (!read.ok) return fail(400, { error: read.error });
			seriesChoice = read.choice;
			if (seriesChoice.type !== 'none') {
				const tagged = addTagToPost(content, seriesChoice.name);
				if (tagged === content && !(fields.tags ?? []).includes(seriesChoice.name))
					return fail(400, { error: 'No se pudo agregar la etiqueta de la serie al evento.' });
				content = tagged;
			}
		}

		/** @type {import('$lib/server/contenido/cliente.js').CommitFile[]} */
		const files = [{ path: eventPath(slug), content }];
		/** @type {string[]} */
		const warnings = [];
		/** @type {string[]} */
		const mustNotExist = [eventPath(slug)];
		/** @type {string[]} */
		const deleted = [];

		/** @type {Array<{path: string, sha: string}>} */
		const seriesUnchanged = [];
		// La serie nueva se crea en la base (después de guardar el evento): el mismo camino que
		// /admin/etiquetas. Ya no hay commits al archivo de etiquetas.
		/** @type {null | { fromDb: NonNullable<Awaited<ReturnType<typeof dbTagsForAdmin>>>, ops: import('$lib/utils/tagConfig.js').TagOp[] }} */
		let seriesToDb = null;
		try {
			if (seriesChoice.type === 'create') {
				// La etiqueta nueva, por el mismo camino que /admin/etiquetas.
				const planned = seriesCreateOps({ name: seriesChoice.name });
				if (!planned.ok) return fail(400, { error: planned.error });
				const fromDb = await dbTagsForAdmin(platform, admin.login);
				if (!fromDb) return fail(503, { error: 'Serie: ' + NEEDS_IMPORT });
				planDbTagEdit(fromDb.records, planned.ops); // valida antes de guardar (tira)
				seriesToDb = { fromDb, ops: planned.ops };
			}
			if (seriesChoice.type !== 'none' && seriesChoice.markSource) {
				const sourceRaw = await client.getFile(admin.token, eventPath(source));
				const marked = sourceRaw === null ? null : addTagToPost(sourceRaw, seriesChoice.name);
				if (sourceRaw !== null && marked !== null && marked !== sourceRaw) {
					files.push({ path: eventPath(source), content: marked });
					seriesUnchanged.push({ path: eventPath(source), sha: await gitBlobSha(sourceRaw) });
				}
			}
		} catch (e) {
			return fail(400, { error: 'Serie: ' + describeError(e) });
		}

		try {
			if (!portada && featuredMode === 'keep' && source && isNumericFeatured(fields.featured)) {
				// La imagen vieja numerada del original (de su carpeta del repo, que ya no existe): su
				// copia en la biblioteca ($lib/utils/legacyMedia.js) pasa a ser la portada del nuevo.
				const copy = await legacyLibraryImage(
					getDB(platform),
					legacyNumberedURL('calendario', source, String(fields.featured).trim())
				);
				if (copy) {
					portada = [copy];
					content = joinMarkdown(
						applyFrontmatterChanges(splitMarkdown(content).frontmatter, { featured: null }),
						splitMarkdown(content).body
					);
					files[0] = { path: eventPath(slug), content };
				} else
					warnings.push(
						'No encontramos la imagen del evento original, así que el evento quedó sin imagen.'
					);
			}

			const what = mode === 'borrador' ? 'cargó (no listado)' : 'publicó';
			const message =
				`[admin] ${admin.name} ${what} calendario/${slug}` +
				(source ? ` (copia de ${source})` : '');
			const commit = await client.commitFiles(admin.token, {
				files,
				message,
				mustNotExist,
				unchanged: seriesUnchanged,
				// La imagen de la biblioteca, en el mismo guardado del evento.
				...(portada ? { edges: { [eventPath(slug)]: { portada } } } : {}),
				// El evento nuevo va a la base (con su autoría).
				actor: admin.login,
				pr: {
					action: mode === 'borrador' ? 'carga (no listado)' : source ? 'duplica' : 'publica',
					who: admin.name
				}
			});
			if (seriesToDb) {
				const res = await saveTagOpsToDb(seriesToDb.fromDb, seriesToDb.ops, {
					locals,
					login: admin.login,
					label: 'Series',
					targetId: seriesChoice.type === 'none' ? null : seriesChoice.name.slice(0, 120)
				});
				if (!res.ok)
					warnings.push(
						`El evento se guardó, pero no se pudo crear la serie en la base: ${res.error} Creala desde Eventos → Series.`
					);
			}
			await logAdminAction(getDB(platform), locals, {
				action: mode === 'borrador' ? 'event.draft' : 'event.publish',
				targetType: 'event',
				targetId: slug,
				summary:
					(mode === 'borrador' ? 'Cargó como no listado ' : 'Publicó ') +
					`calendario/${slug}` +
					(source ? ` (copia de ${source})` : ''),
				detail: {
					source: source || null,
					commit: commit.url,
					image: portada ? portada[0] : null,
					series: seriesChoice.type === 'none' ? null : seriesChoice
				}
			});
			// El evento ya existe (con su dirección): ahora sí, el lugar.
			const venueSaved = await saveVenueChoice(getDB(platform), locals, {
				eventSlug: slug,
				choice: venue,
				by: admin.login
			});
			if (!venueSaved.ok) warnings.push(venueNotSavedWarning(venueSaved.message));
			return {
				success: true,
				slug,
				mode,
				venueSaved: venueSaved.ok && venueSaved.changed,
				commitUrl: commit.url,
				publish: commit.pr ?? null,
				// Todo se guarda en la base (ya se ve).
				savedToDb: true,
				eventUrl: `/calendario/${slug}`,
				files: files.filter((f) => !f.delete).map((f) => f.path),
				deleted,
				series: seriesChoice.type === 'none' ? null : seriesChoice,
				content,
				warnings,
				mock: isMockMode()
			};
		} catch (e) {
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
			return fail(502, { error: saveCopy().saveFailed + describeError(e) });
		}
	}
};
