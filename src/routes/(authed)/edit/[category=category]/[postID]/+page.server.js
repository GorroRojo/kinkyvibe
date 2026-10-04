import { error, fail } from '@sveltejs/kit';
import { postFilePath } from '$lib/utils/postPaths.js';
import { withLineEnding } from '$lib/utils/lineEndings.js';
import { requireAdmin } from '$lib/server/auth';
import { editorData } from '$lib/server/admin/content.js';
import { featuredURL, getRepoClient, isMockMode, usesLocalRepo } from '$lib/server/eventos';
import { findImage, imageOf } from '$lib/server/media/library.js';
import { readImageChoice } from '$lib/utils/imageChoice.js';
import { resolveEventSlug } from '$lib/server/contenido/posts.js';
import { PendingChangeError, readFile, UnreadableFileError } from '$lib/server/eventos/github.js';
import { validateEventTags } from '$lib/utils/adminTags.js';
import { getDB } from '$lib/server/db';
import { salesByType, ticketsFileErrors } from '$lib/server/tickets/editor.js';
import { transferReady } from '$lib/server/tickets/index.js';
import { placeFileErrors } from '$lib/utils/eventPlace.js';
import { linkFileErrors } from '$lib/utils/eventLink.js';
import {
	checkVenueChoice,
	createVenueForEventAction,
	editVenueForEventAction,
	saveVenueChoice,
	venueNotSavedWarning,
	venuePickerData
} from '$lib/server/amigues/eventFormVenue.js';
import { readVenueChoice } from '$lib/utils/venueChoice.js';
import { activeRoles, editorPersonas, personasFileErrors } from '$lib/server/personas/index.js';
import { readEventFields, splitMarkdown } from '$lib/utils/eventDraft.js';
import { postOfPath, readDbPostFile } from '$lib/server/contenido/repo.js';
import { panelSavesToDb } from '$lib/server/contenido/saving.js';
import { commitSavedToDb } from '$lib/admin/saveCopy.js';
import { featuredOf } from '$lib/utils/sharedImage.js';

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
		// «Lugar» del formulario: los lugares y el elegido (edge `lugar` del evento, no en el archivo).
		venuePicker: isEvent ? await venuePickerData(getDB(platform), params.postID) : null,
		salesUnavailable: isEvent && sales === null,
		// ¿Hay datos para transferir? Solo sí/no: el editor avisa si «Transferencia» no se ofrece.
		transferReady: isEvent ? await transferReady(getDB(platform)) : null,
		post,
		// Tag usage, amigues profiles and past authors for the pickers.
		...(await editorData(params.category)),
		// Personas con rol: roles y perfiles públicos (interruptor personas_eventos; apagado, null).
		personas: params.category === 'amigues' ? null : await editorPersonas(platform),
		image:
			params.category === 'calendario'
				? await eventImageInfo(getDB(platform), locals, params.postID, post.raw)
				: null,
		// Los eventos y el material se guardan en la base (se ve enseguida).
		savesToDb: await panelSavesToDb(platform, params.category, params.postID),
		mock: isMockMode()
	};
}

/**
 * La imagen del evento para el selector (docs/imagenes.md): la de la biblioteca (edge `portada`)
 * si tiene; si no, la vieja del repo (`featured`), que se sigue mostrando hasta importar.
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {App.Locals} locals
 * @param {string} slug
 * @param {string} raw
 */
async function eventImageInfo(db, locals, slug, raw) {
	const featured = featuredOf(raw);
	/** @type {import('$lib/server/media/library.js').PublicImage | null} */
	let current = null;
	if (db) {
		try {
			const ref = await resolveEventSlug(db, slug);
			if (ref) current = await imageOf(db, ref.id, 'portada', adminViewer(locals));
		} catch (e) {
			// Sin la imagen de la biblioteca, se muestra la del repo.
		}
	}
	return {
		current,
		legacyUrl: current ? null : (featuredURL(slug, featured) ?? null),
		target: `evento:${slug}`
	};
}

/** @param {App.Locals} locals */
const adminViewer = (locals) =>
	/** @type {import('$lib/server/objects/visibility.js').Viewer} */ ({
		role: 'admin',
		id: locals.user?.login ?? 'panel'
	});

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
			// Link de inscripción: web, mail (mailto:) o página del sitio; nunca javascript:. Como el
			// mapa, solo frena un problema nuevo (no uno que el archivo ya tenía).
			const linkError = await newFileErrors(locals.user_token, params, fileContent, (c) =>
				linkFileErrors(c)
			);
			if (linkError) return fail(400, { error: linkError });
		}
		// «Lugar» (solo eventos): va al edge `lugar` del evento, no al archivo. Se revisa antes de
		// guardar y se guarda después, solo si el archivo se guardó.
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
		// Commit author label from the verified GitHub user; `name` is null for
		// accounts without a display name, so fall back to the login.
		const userName = user.name || user.login || 'admin';
		// La imagen elegida en el selector (edge `portada`, en el mismo guardado; docs/imagenes.md).
		/** @type {Record<string, number[]> | undefined} */
		let edges;
		if (params.category === 'calendario') {
			const choice = readImageChoice(data.get('imageId'));
			if (choice.action === 'remove') edges = { portada: [] };
			if (choice.action === 'set') {
				const db = getDB(platform);
				const image = db ? await findImage(db, choice.id, adminViewer(locals)) : null;
				if (!image)
					return fail(400, {
						error: 'La imagen elegida ya no está en la biblioteca. Elegí otra.'
					});
				edges = { portada: [image.id] };
			}
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
				user.login,
				edges
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
	/** Edición rápida del lugar elegido en el «Lugar» del formulario (solo eventos). */
	editarLugar: editVenueForEventAction
};
/**
 *
 * @param {string} token
 * @param {string} path
 * @returns {Promise<*>}
 */
async function getFileContent(token, path) {
	// Los eventos y el material se editan solo en la base (el sha es el de su texto, para avisar si
	// alguien guardó en el medio; ver $lib/server/contenido/repo.js). Si la base no lo tiene, no
	// existe (aunque su .md siga en el repo).
	if (postOfPath(path)) {
		const fromDb = await readDbPostFile(path);
		if (!fromDb || 'deleted' in fromDb) throw error(404, 'No se encontró la publicación');
		return { raw: fromDb.raw, sha: fromDb.sha, path };
	}
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
 * @param {Record<string, number[]>} [edges] relaciones del post que cambian en el mismo guardado
 *   (la imagen: `{ portada: [id] }`)
 */
async function saveFileContent(
	token,
	path,
	content,
	sha,
	userName,
	category,
	postID,
	actor,
	edges
) {
	const client = await getRepoClient();
	// The mock's sha is not a blob sha; the mock and the demo layer ignore `unchanged` anyway.
	return await client.commitFiles(token, {
		files: [{ path, content }],
		message: `[admin] ${userName} updated ${category}/${postID}`,
		actor,
		// Un evento de la base se compara siempre (su sha es el del texto que se abrió).
		unchanged: usesLocalRepo() && !sha.match(/^[0-9a-f]{40}$/) ? [] : [{ path, sha }],
		pr: { action: 'edita', who: userName },
		...(edges ? { edges: { [path]: edges } } : {})
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

/** @type {import("./$types").Actions} */
export const actions = {
	..._editActions,
	// Guardar un evento se hace desde el panel.
	save: (event) => {
		rejectEvents(event.params);
		return _editActions.save(event);
	},
	crearLugar: (event) => {
		rejectEvents(event.params);
		return _editActions.crearLugar(event);
	},
	editarLugar: (event) => {
		rejectEvents(event.params);
		return _editActions.editarLugar(event);
	}
};
