/**
 * Panel: importar las fichas de amigues desde el deploy y revisar su clasificación.
 *
 * - {@link bundledAmigueFiles}: los .md de amigues tal como están en este deploy (texto), para
 *   correr la importación desde el panel contra la base de ese entorno (preview o producción). Es
 *   la forma de importar en las bases remotas sin tocar la terminal.
 * - {@link classificationRows}: la lista de revisión (lo que propuso la heurística, por qué, y si
 *   ya está confirmado), también en CSV.
 */
import { PROFILE_TYPE, profileKind } from '$lib/server/cuentas/perfiles.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** @type {Record<string, () => Promise<string>>} */
const sources = /** @type {any} */ (
	import.meta.glob('/src/lib/posts/amigues/*.md', { query: '?raw', import: 'default' })
);

/**
 * Las fichas de este deploy, como las pide `importAmigues`.
 *
 * @returns {Promise<{ legacySlug: string, raw: string }[]>}
 */
export async function bundledAmigueFiles() {
	const out = [];
	for (const [path, load] of Object.entries(sources)) {
		const legacySlug = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
		out.push({ legacySlug, raw: await load() });
	}
	return out;
}

/**
 * @typedef {{
 *   profileId: number, legacySlug: string, slug: string, title: string,
 *   kind: 'persona' | 'grupo' | 'lugar', suggested: string, reason: string,
 *   confirmedAt: number | null, confirmedBy: string | null, deleted: boolean, visibility: string,
 *   version: number
 * }} ClassificationRow
 */

/**
 * La lista de revisión de la clasificación: una fila por ficha importada.
 *
 * @param {D1Database} db
 * @returns {Promise<ClassificationRow[]>}
 */
export async function classificationRows(db) {
	const { results } = await db
		.prepare(
			`SELECT s.profile_id, s.legacy_slug, s.suggested_kind, s.kind_reason, s.kind_confirmed_at,
				s.kind_confirmed_by, o.slug, o.title, o.data, o.deleted_at, o.visibility, o.version
			FROM profile_sources s JOIN objects o ON o.id = s.profile_id
			WHERE o.type = ?1 ORDER BY s.kind_confirmed_at IS NOT NULL, o.title COLLATE NOCASE`
		)
		.bind(PROFILE_TYPE)
		.all();
	return results.map((r) => {
		/** @type {Record<string, unknown>} */
		let data = {};
		try {
			data = JSON.parse(String(r.data));
		} catch {
			data = {};
		}
		return {
			profileId: Number(r.profile_id),
			legacySlug: String(r.legacy_slug),
			slug: String(r.slug),
			title: String(r.title),
			kind: profileKind(data),
			suggested: String(r.suggested_kind),
			reason: String(r.kind_reason ?? ''),
			confirmedAt: r.kind_confirmed_at == null ? null : Number(r.kind_confirmed_at),
			confirmedBy: r.kind_confirmed_by == null ? null : String(r.kind_confirmed_by),
			deleted: r.deleted_at != null,
			visibility: String(r.visibility),
			version: Number(r.version)
		};
	});
}

/** Columnas del CSV de revisión. */
export const CLASSIFICATION_CSV = Object.freeze(
	/** @type {import('$lib/admin/csv.js').CsvColumn<ClassificationRow>[]} */ ([
		{ label: 'Ficha', key: 'legacySlug' },
		{ label: 'Nombre', key: 'title' },
		{ label: 'Tipo', key: 'kind' },
		{ label: 'Propuesto', key: 'suggested' },
		{ label: 'Por qué', key: 'reason' },
		{ label: 'Estado', value: (r) => (r.confirmedAt ? 'confirmado' : 'a confirmar') },
		{ label: 'Confirmó', value: (r) => r.confirmedBy ?? '' },
		{ label: 'Página', value: (r) => `/amigues/${r.legacySlug}` }
	])
);
