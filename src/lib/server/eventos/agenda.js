/**
 * Guardar una fila de la agenda (/admin/eventos/agenda): lee el archivo del evento del repo
 * (GitHub, o la capa demo en los previews: siempre por `getRepoClient()`), aplica solo los campos
 * que cambiaron y hace un commit, igual que el editor de eventos.
 */
import { FileChangedError } from './github.js';
import { POSTS_DIR } from './images.js';
import {
	AGENDA_FIELD_LABELS,
	applyAgendaChange,
	changedAgendaFields,
	readAgendaValues,
	validateAgendaRow
} from '$lib/utils/agenda.js';
import { validateSlug } from '$lib/utils/eventDraft.js';

/**
 * sha del blob de git de un texto (el que GitHub devuelve para el archivo): así el commit
 * comprueba que nadie lo cambió entre la lectura y el guardado.
 * @param {string} text
 */
export async function gitBlobSha(text) {
	const bytes = new TextEncoder().encode(text);
	const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
	const all = new Uint8Array(header.length + bytes.length);
	all.set(header);
	all.set(bytes, header.length);
	const digest = await crypto.subtle.digest('SHA-1', all);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @typedef {{
 *   status: number,
 *   ok: boolean,
 *   message: string,
 *   errors?: Partial<Record<import('$lib/utils/agenda.js').AgendaField, string>>,
 *   current?: import('$lib/utils/agenda.js').AgendaRow,
 *   changed?: import('$lib/utils/agenda.js').AgendaField[],
 *   commitUrl?: string,
 *   publish?: import('./github.js').PublishResult | null
 * }} AgendaSaveResult
 */

/**
 * What happens next with a save that went to a content PR (nothing for the mock / demo modes).
 * @param {import('./github.js').PublishResult | undefined} pr
 */
export function publishNote(pr) {
	if (!pr) return '';
	if (pr.state === 'merged') return ` Publicado (PR #${pr.number}).`;
	if (pr.state === 'open')
		return ` Quedó en el PR #${pr.number} sin publicarse solo${pr.problem ? `: ${pr.problem}` : ''}.`;
	return ` Se publica cuando pasen las pruebas (PR #${pr.number}).`;
}

/**
 * @typedef {{
 *   client: Pick<typeof import('./github.js'), 'getFile' | 'commitFiles'>,
 *   token: string,
 *   slug: string,
 *   before: Record<string, unknown>,
 *   after: Record<string, unknown>,
 *   places: string[]
 * }} AgendaRowInput
 */

/**
 * Todo lo de guardar una fila menos el commit: valida, lee el archivo, aplica el cambio y detecta
 * conflictos. Devuelve el resultado final (un error, o "no había cambios") o lo que hay que
 * commitear. Lo usan `saveAgendaRow` (una fila, un commit) y `saveAgendaRows` (varias, un commit).
 * @param {AgendaRowInput} input
 * @returns {Promise<{ done: AgendaSaveResult } | { done?: undefined, path: string, raw: string, content: string, changed: import('$lib/utils/agenda.js').AgendaField[] }>}
 */
async function prepareAgendaRow({ client, token, slug, before, after, places }) {
	if (validateSlug(slug)) return { done: { status: 400, ok: false, message: 'Evento inválido.' } };
	const b = readAgendaValues(before);
	const a = readAgendaValues(after);
	if (!changedAgendaFields(b, a).length) {
		return { done: { status: 200, ok: true, message: 'No había cambios.', changed: [] } };
	}
	const errors = validateAgendaRow(a, { places, allowEmptyPlace: b.place === '' });
	if (Object.keys(errors).length) {
		return { done: { status: 400, ok: false, message: 'Revisá los campos marcados.', errors } };
	}
	const path = `${POSTS_DIR}/${slug}.md`;
	let raw;
	try {
		raw = await client.getFile(token, path);
	} catch (e) {
		return {
			done: {
				status: 502,
				ok: false,
				message: 'No pudimos leer el evento: ' + (e instanceof Error ? e.message : String(e))
			}
		};
	}
	if (raw === null)
		return { done: { status: 404, ok: false, message: 'No encontramos ese evento.' } };
	/** @type {ReturnType<typeof applyAgendaChange>} */
	let result;
	try {
		result = applyAgendaChange(raw, { before: b, after: a });
	} catch (e) {
		return {
			done: {
				status: 422,
				ok: false,
				message:
					'Las propiedades de este evento tienen un formato que la agenda no entiende: editalo desde su ficha.'
			}
		};
	}
	if (result.conflicts.length) {
		return {
			done: {
				status: 409,
				ok: false,
				message: `Alguien cambió ${result.conflicts
					.map((f) => AGENDA_FIELD_LABELS[f].toLowerCase())
					.join(
						', '
					)} de este evento mientras tanto. Actualizamos la fila con lo último: revisala y volvé a guardar.`,
				current: { ...result.current, slug }
			}
		};
	}
	if (!result.changed.length) {
		return {
			done: {
				status: 200,
				ok: true,
				message: 'Ya estaba así.',
				changed: [],
				current: { ...result.current, slug }
			}
		};
	}
	return { path, raw, content: result.content, changed: result.changed };
}

/** @param {import('$lib/utils/agenda.js').AgendaField[]} changed */
const fieldLabels = (changed) =>
	changed.map((f) => AGENDA_FIELD_LABELS[f].toLowerCase()).join(', ');

/** @param {unknown} e @returns {AgendaSaveResult} */
function commitError(e) {
	if (e instanceof FileChangedError) {
		return {
			status: 409,
			ok: false,
			message: 'El evento cambió justo mientras guardabas. Probá de nuevo.'
		};
	}
	return {
		status: 502,
		ok: false,
		message: 'No se pudo guardar: ' + (e instanceof Error ? e.message : String(e))
	};
}

/**
 * @param {AgendaRowInput & { author: string }} input
 * @returns {Promise<AgendaSaveResult>}
 */
export async function saveAgendaRow({ client, token, author, slug, before, after, places }) {
	const prep = await prepareAgendaRow({ client, token, slug, before, after, places });
	if (prep.done) return prep.done;
	const { path, raw, content, changed } = prep;
	const labels = fieldLabels(changed);
	try {
		const commit = await client.commitFiles(token, {
			files: [{ path, content }],
			message: `[admin] ${author} editó calendario/${slug} desde la agenda (${labels})`,
			unchanged: [{ path, sha: await gitBlobSha(raw) }],
			pr: { action: 'edita desde la agenda', who: author }
		});
		return {
			status: 200,
			ok: true,
			message: `Guardado (${labels}).${publishNote(commit.pr)}`,
			changed,
			commitUrl: commit.url,
			publish: commit.pr ?? null
		};
	} catch (e) {
		return commitError(e);
	}
}

/** Máximo de filas en un guardado de varias (la planilla entera de un año entra de sobra). */
export const AGENDA_BATCH_MAX = 100;

/**
 * @typedef {{
 *   status: number,
 *   ok: boolean,
 *   message: string,
 *   results: Array<AgendaSaveResult & { slug: string }>,
 *   commitUrl?: string,
 *   publish?: import('./github.js').PublishResult | null
 * }} AgendaBatchResult
 * `ok`: se guardaron todas. `results`: una por fila, en el mismo orden.
 */

/**
 * Guardar varias filas de la agenda (los "Guardar N filas" de la planilla y el "Guardar cambios"
 * del calendario) en un solo commit, con la misma validación y la misma detección de conflictos que
 * `saveAgendaRow`, fila por fila. Las que fallan (inválidas, conflicto, no existen) no frenan a las
 * demás: se guardan las que se pueden, cada una con su resultado. Si el commit falla, no se guardó
 * ninguna.
 * @param {{
 *   client: AgendaRowInput['client'],
 *   token: string,
 *   author: string,
 *   rows: Array<{ slug: string, before: Record<string, unknown>, after: Record<string, unknown> }>,
 *   places: string[]
 * }} input
 * @returns {Promise<AgendaBatchResult>}
 */
export async function saveAgendaRows({ client, token, author, rows, places }) {
	if (!rows.length) return { status: 200, ok: true, message: 'No había cambios.', results: [] };
	if (rows.length > AGENDA_BATCH_MAX) {
		return {
			status: 400,
			ok: false,
			message: `Son demasiados cambios juntos (máximo ${AGENDA_BATCH_MAX}). Guardalos en partes.`,
			results: []
		};
	}
	const seen = new Set();
	/** @type {Array<AgendaSaveResult & { slug: string }>} */
	const results = [];
	/** @type {Array<{ index: number, slug: string, path: string, raw: string, content: string, changed: import('$lib/utils/agenda.js').AgendaField[] }>} */
	const ready = [];
	for (const [index, row] of rows.entries()) {
		const slug = row.slug;
		if (seen.has(slug)) {
			results.push({ slug, status: 400, ok: false, message: 'Ese evento está dos veces.' });
			continue;
		}
		seen.add(slug);
		const prep = await prepareAgendaRow({ client, token, places, ...row });
		if (prep.done) {
			results.push({ ...prep.done, slug });
			continue;
		}
		results.push({ slug, status: 0, ok: false, message: '' }); // se completa después del commit
		ready.push({ index, slug, ...prep });
	}

	/** @type {{ url: string, pr?: import('./github.js').PublishResult } | null} */
	let commit = null;
	if (ready.length) {
		const message =
			ready.length === 1
				? `[admin] ${author} editó calendario/${ready[0].slug} desde la agenda (${fieldLabels(ready[0].changed)})`
				: `[admin] ${author} editó ${ready.length} eventos desde la agenda (${ready.map((r) => `calendario/${r.slug}`).join(', ')})`;
		try {
			commit = await client.commitFiles(token, {
				files: ready.map((r) => ({ path: r.path, content: r.content })),
				message: message.length > 300 ? `${message.slice(0, 297)}...` : message,
				unchanged: await Promise.all(
					ready.map(async (r) => ({ path: r.path, sha: await gitBlobSha(r.raw) }))
				),
				pr: { action: 'edita desde la agenda', who: author }
			});
		} catch (e) {
			const err = commitError(e);
			const culprit = e instanceof FileChangedError ? e.path : null;
			for (const r of ready) {
				results[r.index] =
					culprit && r.path !== culprit
						? {
								slug: r.slug,
								status: 409,
								ok: false,
								message: 'No se guardó porque otro evento cambió mientras tanto. Probá de nuevo.'
							}
						: { ...err, slug: r.slug };
			}
		}
		if (commit) {
			for (const r of ready) {
				results[r.index] = {
					slug: r.slug,
					status: 200,
					ok: true,
					message: `Guardado (${fieldLabels(r.changed)}).`,
					changed: r.changed,
					commitUrl: commit.url
				};
			}
		}
	}

	const failed = results.filter((r) => !r.ok);
	const saved = commit ? ready.length : 0;
	const note = commit ? publishNote(commit.pr) : '';
	let message;
	if (!failed.length) {
		message = saved
			? `${saved === 1 ? 'Se guardó 1 cambio' : `Se guardaron ${saved} cambios`} en un commit.${note}`
			: 'No había cambios.';
	} else {
		message = `${saved ? `Se ${saved === 1 ? 'guardó 1 cambio' : `guardaron ${saved} cambios`}.${note} ` : ''}${failed.length === 1 ? 'Uno no se pudo guardar' : `${failed.length} no se pudieron guardar`}: revisá los marcados.`;
	}
	return {
		status: failed.length ? failed[0].status || 409 : 200,
		ok: !failed.length,
		message,
		results,
		...(commit ? { commitUrl: commit.url, publish: commit.pr ?? null } : {})
	};
}
