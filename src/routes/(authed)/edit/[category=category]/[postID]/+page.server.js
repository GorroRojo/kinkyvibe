import { error, fail } from '@sveltejs/kit';
import { postFilePath } from '$lib/utils/postPaths.js';
import { withLineEnding } from '$lib/utils/lineEndings.js';
import { requireAdmin } from '$lib/server/auth';
import { editorData } from '$lib/server/admin/content.js';
import { featuredURL, getRepoClient, isMockMode, usesLocalRepo } from '$lib/server/eventos';
import {
	FileChangedError,
	PendingChangeError,
	readFile,
	UnreadableFileError
} from '$lib/server/eventos/github.js';
import {
	findAssetUsers,
	ownImageTarget,
	readUploadedImage,
	sharedAssetCommit
} from '$lib/server/eventos/images.js';
import { validateEventTags } from '$lib/utils/adminTags.js';
import { getDB } from '$lib/server/db';
import { salesByType, ticketsFileErrors } from '$lib/server/tickets/editor.js';
import { placeFileErrors } from '$lib/utils/eventPlace.js';
import {
	checkVenueChoice,
	createVenueForEventAction,
	saveVenueChoice,
	venueNotSavedWarning,
	venuePickerData
} from '$lib/server/amigues/eventFormVenue.js';
import { readVenueChoice } from '$lib/utils/venueChoice.js';
import { activeRoles, editorPersonas, personasFileErrors } from '$lib/server/personas/index.js';
import { MAX_IMAGE_BYTES, readEventFields, splitMarkdown } from '$lib/utils/eventDraft.js';
import { readDbEventFile } from '$lib/server/contenido/repo.js';
import { panelSavesToDb } from '$lib/server/contenido/saving.js';
import { commitSavedToDb } from '$lib/admin/saveCopy.js';
import {
	featuredOf,
	isSafeAssetName,
	isSharedAsset,
	nextMediaNumber,
	setFeatured,
	uploadScope
} from '$lib/utils/sharedImage.js';

/**
 * @param {{category: string, postID: string}} params
 */
function postPath(params) {
	const path = postFilePath(params.category, params.postID);
	if (!path) throw error(400, 'Dirección de publicación inválida.');
	return path;
}

/**
 * Los eventos se editan en el panel (/admin/eventos/<slug>/editar, que usa este mismo código con
 * `_editLoad` y `_editActions`); acá quedan las demás categorías. Sin redirección: la página de
 * los eventos se mudó.
 * @param {{category: string, postID: string}} params
 */
function rejectEvents(params) {
	if (params.category === 'calendario') {
		throw error(404, `Los eventos se editan en el panel: /admin/eventos/${params.postID}/editar`);
	}
}

/** @type {import("./$types").PageServerLoad} */
export async function load(event) {
	postPath(event.params); // 400 para direcciones inválidas, antes que nada
	rejectEvents(event.params);
	return _editLoad(event);
}

/**
 * El load del editor, para cualquier categoría (también la usa la pestaña Editar del panel).
 * @param {{ locals: App.Locals, params: {category: string, postID: string}, url: URL, platform?: App.Platform }} event
 */
export async function _editLoad({ locals, params, url, platform }) {
	// Server loads run in parallel with the layout load, so guard here too.
	requireAdmin(locals, url);
	const post = await getFileContent(locals.user_token, postPath(params));
	const isEvent = params.category === 'calendario';
	// Entradas ya vendidas o reservadas por tipo: el editor no deja romper esas compras.
	const sales = isEvent ? await salesByType(getDB(platform), params.postID) : null;
	return {
		sales,
		// «Lugar» del formulario: los lugares y el elegido (en `event_venues`, no en el archivo).
		venuePicker: isEvent ? await venuePickerData(getDB(platform), params.postID) : null,
		salesUnavailable: isEvent && sales === null,
		post,
		// Tag usage, amigues profiles and past authors for the pickers.
		...(await editorData(params.category)),
		// Personas con rol: roles y perfiles públicos (interruptor personas_eventos; apagado, null).
		personas: params.category === 'amigues' ? null : await editorPersonas(platform),
		image:
			params.category === 'calendario'
				? await imageInfo(locals.user_token, params.postID, post.raw)
				: null,
		maxImageBytes: MAX_IMAGE_BYTES,
		// Interruptor `contenido_db`: este post se guarda en la base (se ve enseguida).
		savesToDb: await panelSavesToDb(platform, params.category, params.postID),
		mock: isMockMode()
	};
}

/**
 * The event's current image, and the number a new "solo esta" image would get.
 * @param {string} token
 * @param {string} slug
 * @param {string} raw
 */
async function imageInfo(token, slug, raw) {
	const featured = featuredOf(raw);
	let nextNumber = 1;
	try {
		const client = await getRepoClient();
		nextNumber = nextMediaNumber((await client.listDir(token, mediaDir(slug))).map((f) => f.name));
	} catch (e) {
		// Only a preview: the save action looks again.
	}
	return {
		featured,
		url: featuredURL(slug, featured),
		shared: isSharedAsset(featured),
		nextNumber,
		folder: `calendario/media/${slug}/`
	};
}

/** @param {string} slug */
const mediaDir = (slug) => `src/lib/posts/calendario/media/${slug}`;

/**
 * Las acciones del editor, para cualquier categoría (también las usa la pestaña Editar del panel).
 * @type {Record<string, (event: any) => Promise<any>>}
 */
export const _editActions = {
	// Form actions do not run the (authed) layout load: each one must check auth.
	save: async ({ params, locals, request, url, platform }) => {
		const user = requireAdmin(locals, url);
		const data = await request.formData();
		const rawContent = data.get('content');
		const sha = data.get('sha');
		if (typeof rawContent !== 'string' || typeof sha !== 'string' || sha === '') {
			return fail(400, {
				error: 'Faltan datos para guardar. Recargá la página y volvé a intentar.'
			});
		}
		// Same line endings as the file that was opened (the textarea sends CRLF).
		const fileContent = withLineEnding(rawContent, data.get('eol'));
		// Events follow the same tag rules as /admin/eventos/nuevo (one language, one place).
		const tagError = params.category === 'calendario' ? eventTagError(fileContent) : null;
		if (tagError) return fail(400, { error: tagError });
		// Personas con rol (interruptor personas_eventos): perfiles y roles válidos.
		const roles = params.category === 'amigues' ? null : await activeRoles(platform);
		if (roles) {
			const personasError = await newFileErrors(locals.user_token, params, fileContent, (c) =>
				personasFileErrors(c, roles)
			);
			if (personasError) return fail(400, { error: personasError });
		}
		if (params.category === 'calendario') {
			const ticketError = await newTicketsError(
				locals.user_token,
				params,
				fileContent,
				await salesByType(getDB(platform), params.postID)
			);
			if (ticketError) return fail(400, { error: ticketError });
			// «Dónde»: el link al mapa, si está, https de OpenStreetMap o Google Maps.
			const placeError = await newFileErrors(locals.user_token, params, fileContent, (c) =>
				placeFileErrors(c)
			);
			if (placeError) return fail(400, { error: placeError });
		}
		// «Lugar» (solo eventos): va a `event_venues`, no al archivo. Se revisa antes de guardar y se
		// guarda después, solo si el archivo se guardó.
		const venue = params.category === 'calendario' ? readVenueChoice(data) : null;
		const venueCheck = await checkVenueChoice(getDB(platform), venue);
		if (!venueCheck.ok) return fail(400, { error: venueCheck.message });
		/** @param {any} result lo que devuelve guardar el archivo (o un fail) */
		const withVenue = async (result) => {
			if (!venue || !result || !('save' in result)) return result;
			const r = await saveVenueChoice(getDB(platform), locals, {
				eventSlug: params.postID,
				choice: venue,
				by: user.login
			});
			return r.ok
				? { ...result, venueSaved: r.changed }
				: { ...result, warnings: [venueNotSavedWarning(r.message)] };
		};
		// Solo cambió el «Lugar»: el archivo queda como está (ni la fecha de «Actualizado»).
		if (venue && data.get('soloLugar') === '1') {
			return withVenue({ save: 'Guardado', venueOnly: true, publish: null, savedToDb: false });
		}
		// Commit author label from the verified GitHub user; `name` is null for
		// accounts without a display name, so fall back to the login.
		const userName = user.name || user.login || 'admin';
		const image = data.get('image');
		if (params.category === 'calendario' && image instanceof File && image.size > 0) {
			return withVenue(
				await saveWithImage({
					token: locals.user_token,
					params,
					content: fileContent,
					sha,
					userName,
					image,
					asked: String(data.get('imageScope') ?? ''),
					actor: user.login
				})
			);
		}
		let commit;
		try {
			commit = await saveFileContent(
				locals.user_token,
				postPath(params),
				fileContent,
				sha,
				userName,
				params.category,
				params.postID,
				user.login
			);
		} catch (e) {
			console.log(e);
			if (e instanceof PendingChangeError) return fail(409, { error: e.message + '.' });
			return fail(502, {
				error:
					'No se pudo guardar. Puede que otra persona haya editado esta publicación: copiá tus cambios, recargá la página y volvé a intentar.'
			});
		}
		return withVenue({
			save: 'Guardado',
			publish: commit.pr ?? null,
			commitUrl: commit.url,
			savedToDb: commitSavedToDb(commit)
		});
	},
	/** «+ Crear lugar» desde el «Lugar» del formulario (solo eventos). */
	crearLugar: createVenueForEventAction,
	/** Events that show a shared image, for the "todas las ediciones" option. */
	afectados: async ({ locals, request, url }) => {
		requireAdmin(locals, url);
		const name = String((await request.formData()).get('asset') ?? '');
		if (!isSafeAssetName(name)) return fail(400, { error: 'Imagen inválida.' });
		try {
			const client = await getRepoClient();
			return { affected: await findAssetUsers(client, locals.user_token, name) };
		} catch (e) {
			return fail(502, { error: 'No pudimos consultar GitHub.' });
		}
	}
};
/**
 *
 * @param {string} token
 * @param {string} path
 * @returns {Promise<*>}
 */
async function getFileContent(token, path) {
	// Interruptor `contenido_db`: un evento de la base se edita en la base (el sha es el de su
	// texto, para avisar si alguien guardó en el medio; ver $lib/server/contenido/repo.js).
	const fromDb = await readDbEventFile(path);
	if (fromDb && 'deleted' in fromDb) throw error(404, 'No se encontró la publicación');
	if (fromDb) return { raw: fromDb.raw, sha: fromDb.sha, path };
	if (usesLocalRepo()) {
		// `npm run dev:admin` (reads the local checkout, see $lib/server/eventos/mock.js) or a
		// preview deploy (demo mode: the demo layer in D1, then the deployed files).
		const raw = await (await getRepoClient()).getFile(token, path);
		if (raw === null) throw error(404, 'No se encontró la publicación');
		return { raw, sha: 'dev-mock', path };
	}
	// Main, or the branch of this post's content PR that is still waiting to be published (so
	// saving again builds on the last save; see commitFiles).
	const file = await readFile(token, path).catch((e) => {
		if (e instanceof UnreadableFileError)
			throw error(502, 'GitHub no devolvió el contenido de la publicación.');
		throw e;
	});
	if (!file) throw error(404, 'No se encontró la publicación');
	return { raw: file.raw, sha: file.sha, path };
}

/**
 * Saves a post: a content PR on GitHub (see commitFiles), or the dev mock / demo layer.
 *
 * @param {string} token - The admin's GitHub token.
 * @param {string} path - The path to the file in the repository.
 * @param {string} content - The new content of the file.
 * @param {string} sha - The blob sha the editor read (the save fails if it changed meanwhile).
 * @param {string} userName - The user's name
 * @param {string} category - The category of the post
 * @param {string} postID - The post ID
 * @param {string} [actor] login of who saves (events stored in the database record it)
 */
async function saveFileContent(token, path, content, sha, userName, category, postID, actor) {
	const client = await getRepoClient();
	// The mock's sha is not a blob sha; the mock and the demo layer ignore `unchanged` anyway.
	return await client.commitFiles(token, {
		files: [{ path, content }],
		message: `[admin] ${userName} updated ${category}/${postID}`,
		actor,
		// Un evento de la base se compara siempre (su sha es el del texto que se abrió).
		unchanged: usesLocalRepo() && !sha.match(/^[0-9a-f]{40}$/) ? [] : [{ path, sha }],
		pr: { action: 'edita', who: userName }
	});
}

/**
 * The tag-rule problems of an event file, or null. A file whose properties can't be read is
 * left to save as before (the editor shows the problem).
 * @param {string} content
 */
function eventTagError(content) {
	let tags;
	try {
		tags = readEventFields(splitMarkdown(content).frontmatter).tags;
	} catch (e) {
		return null;
	}
	const errors = validateEventTags(tags);
	return errors.length ? errors.join(' ') : null;
}

/**
 * Problemas de la venta de entradas que agrega este guardado, o null. Los que el archivo ya tenía
 * (por ejemplo, cargado a mano) no bloquean guardar otros cambios; los que rompen compras hechas
 * (borrar un tipo con ventas, bajar el cupo por debajo de lo vendido, apagar la venta) sí, porque
 * se comparan con las ventas de la base.
 * @param {string} token
 * @param {{category: string, postID: string}} params
 * @param {string} content
 * @param {import('$lib/utils/ticketsEditor.js').SalesByType | null} sales
 */
async function newTicketsError(token, params, content, sales) {
	return newFileErrors(token, params, content, (c) => ticketsFileErrors(c, { sales }));
}

/**
 * Los problemas que agrega este guardado (según `errorsOf`), o null. Los que el archivo ya tenía
 * no bloquean guardar otros cambios; para saberlo se lee el archivo actual solo si hay alguno.
 * @param {string} token
 * @param {{category: string, postID: string}} params
 * @param {string} content
 * @param {(content: string) => string[]} errorsOf
 */
async function newFileErrors(token, params, content, errorsOf) {
	const errors = errorsOf(content);
	if (!errors.length) return null;
	/** @type {string[]} */
	let before = [];
	try {
		const current = await getFileContent(token, postPath(params));
		before = errorsOf(current.raw);
	} catch (e) {
		// Sin el archivo actual, todo cuenta como nuevo.
	}
	const added = errors.filter((e) => !before.includes(e));
	return added.length ? added.join(' ') : null;
}

/**
 * Saves an event together with a new image, in one commit (see $lib/utils/sharedImage.js):
 * - "todas": replaces the shared image in src/lib/assets (renaming it and updating every event
 *   that uses it if the extension changes);
 * - "esta" (or an event without a shared image): the next free number of the event's own folder.
 * @param {{token: string, params: {category: string, postID: string}, content: string, sha: string, userName: string, image: File, asked: string, actor?: string}} opts
 */
async function saveWithImage({ token, params, content, sha, userName, image, asked, actor }) {
	const read = await readUploadedImage(image);
	if ('error' in read) return fail(400, { error: read.error });
	const path = postPath(params);
	const client = await getRepoClient();
	// The image the event uses on GitHub now (the form's content already has the new `featured`).
	let current;
	try {
		current = featuredOf((await client.getFile(token, path)) ?? '');
	} catch (e) {
		return fail(502, { error: 'No pudimos leer el evento desde GitHub. Probá de nuevo.' });
	}
	if (isSharedAsset(current) && asked !== 'todas' && asked !== 'esta') {
		return fail(400, {
			error:
				'¿La imagen nueva es para todas las ediciones de este evento o solo para esta? Elegí una opción.'
		});
	}
	const scope = uploadScope(current, asked);
	if (scope === 'todas' && !isSafeAssetName(current)) {
		return fail(400, {
			error: `La imagen compartida «${current}» tiene un nombre raro y no se puede reemplazar desde acá. Elegí «Solo esta».`
		});
	}
	try {
		/** @type {import('$lib/server/eventos/github.js').CommitFile[]} */
		let files;
		/** @type {string[]} */
		let mustNotExist = [];
		/** @type {Array<{path: string, sha: string}>} */
		let unchanged;
		/** @type {import('$lib/utils/sharedImage.js').AffectedEvent[]} */
		let affected = [];
		let message;
		if (scope === 'todas') {
			const shared = await sharedAssetCommit(client, token, {
				oldName: current,
				ext: read.ext,
				base64: read.base64,
				override: { [path]: { text: content, sha } }
			});
			files = shared.commitFiles;
			mustNotExist = shared.mustNotExist;
			unchanged = shared.unchanged;
			affected = shared.affected;
			message =
				`[admin] ${userName} updated ${params.category}/${params.postID} ` +
				`y cambió la imagen compartida ${current} para todas las ediciones (${affected.length} eventos más)`;
		} else {
			const target = await ownImageTarget(client, token, params.postID, read.ext);
			files = [
				{ path, content: setFeatured(content, target.featured) },
				{ path: target.path, base64: read.base64 }
			];
			mustNotExist = [target.path];
			unchanged = [{ path, sha }];
			message = `[admin] ${userName} updated ${params.category}/${params.postID} (imagen nueva)`;
		}
		// The mock's sha is not a blob sha; its commitFiles ignores `unchanged` anyway.
		const commit = await client.commitFiles(token, {
			files,
			message,
			mustNotExist,
			unchanged,
			actor,
			pr: {
				action: scope === 'todas' ? 'edita (imagen de todas las ediciones)' : 'edita',
				who: userName
			}
		});
		return {
			save: 'Guardado',
			publish: commit.pr ?? null,
			commitUrl: commit.url,
			savedToDb: commitSavedToDb(commit),
			imageScope: scope,
			affected,
			files: files.filter((f) => !f.delete).map((f) => f.path),
			deleted: files.filter((f) => f.delete).map((f) => f.path)
		};
	} catch (e) {
		console.log(e);
		if (e instanceof PendingChangeError) return fail(409, { error: e.message + '.' });
		if (e instanceof FileChangedError) {
			return fail(409, {
				error:
					'Alguien cambió este evento u otro que usa la misma imagen mientras tanto. Copiá tus cambios, recargá la página y volvé a intentar.'
			});
		}
		return fail(502, {
			error:
				'No se pudo guardar: ' +
				(e instanceof Error ? e.message : String(e)) +
				'. Copiá tus cambios, recargá la página y volvé a intentar.'
		});
	}
}

/** @type {import("./$types").Actions} */
export const actions = {
	..._editActions,
	// Guardar un evento (o ver qué eventos usan su imagen) se hace desde el panel.
	save: (event) => {
		rejectEvents(event.params);
		return _editActions.save(event);
	},
	afectados: (event) => {
		rejectEvents(event.params);
		return _editActions.afectados(event);
	},
	crearLugar: (event) => {
		rejectEvents(event.params);
		return _editActions.crearLugar(event);
	}
};
