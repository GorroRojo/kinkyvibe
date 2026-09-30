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
 *   commitUrl?: string
 * }} AgendaSaveResult
 */

/**
 * @param {{
 *   client: Pick<typeof import('./github.js'), 'getFile' | 'commitFiles'>,
 *   token: string,
 *   author: string,
 *   slug: string,
 *   before: Record<string, unknown>,
 *   after: Record<string, unknown>,
 *   places: string[]
 * }} input
 * @returns {Promise<AgendaSaveResult>}
 */
export async function saveAgendaRow({ client, token, author, slug, before, after, places }) {
	if (validateSlug(slug)) return { status: 400, ok: false, message: 'Evento inválido.' };
	const b = readAgendaValues(before);
	const a = readAgendaValues(after);
	if (!changedAgendaFields(b, a).length) {
		return { status: 200, ok: true, message: 'No había cambios.', changed: [] };
	}
	const errors = validateAgendaRow(a, { places, allowEmptyPlace: b.place === '' });
	if (Object.keys(errors).length) {
		return { status: 400, ok: false, message: 'Revisá los campos marcados.', errors };
	}
	const path = `${POSTS_DIR}/${slug}.md`;
	let raw;
	try {
		raw = await client.getFile(token, path);
	} catch (e) {
		return {
			status: 502,
			ok: false,
			message: 'No pudimos leer el evento: ' + (e instanceof Error ? e.message : String(e))
		};
	}
	if (raw === null) return { status: 404, ok: false, message: 'No encontramos ese evento.' };
	/** @type {ReturnType<typeof applyAgendaChange>} */
	let result;
	try {
		result = applyAgendaChange(raw, { before: b, after: a });
	} catch (e) {
		return {
			status: 422,
			ok: false,
			message:
				'Las propiedades de este evento tienen un formato que la agenda no entiende: editalo desde su ficha.'
		};
	}
	if (result.conflicts.length) {
		return {
			status: 409,
			ok: false,
			message: `Alguien cambió ${result.conflicts
				.map((f) => AGENDA_FIELD_LABELS[f].toLowerCase())
				.join(
					', '
				)} de este evento mientras tanto. Actualizamos la fila con lo último: revisala y volvé a guardar.`,
			current: { ...result.current, slug }
		};
	}
	if (!result.changed.length) {
		return {
			status: 200,
			ok: true,
			message: 'Ya estaba así.',
			changed: [],
			current: { ...result.current, slug }
		};
	}
	const labels = result.changed.map((f) => AGENDA_FIELD_LABELS[f].toLowerCase()).join(', ');
	try {
		const commit = await client.commitFiles(token, {
			files: [{ path, content: result.content }],
			message: `[admin] ${author} editó calendario/${slug} desde la agenda (${labels})`,
			unchanged: [{ path, sha: await gitBlobSha(raw) }]
		});
		return {
			status: 200,
			ok: true,
			message: `Guardado (${labels}).`,
			changed: result.changed,
			commitUrl: commit.url
		};
	} catch (e) {
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
}
