/**
 * Comunidad › Perfiles (/admin/comunidad/perfiles): la única lista de perfiles del panel (decisión de
 * gorrite del 1/10: "Amigues" y "Cuentas › Perfiles" pasan a ser una sola lista). Acá, lo puro:
 * los filtros de la URL, de dónde vino cada perfil (origen) y en qué estado está, y los links que
 * conservan los filtros. Lo usan el servidor (src/lib/server/admin/cuentas.js arma el SQL con las
 * mismas reglas) y la página.
 */
import { profileHref } from './links.js';
import { VISIBILITY_LABELS } from './cuentas.js';
import { KIND_LABELS, ROLE_LABELS } from '$lib/utils/perfiles.js';

/** La URL de la lista. */
export const PROFILES_HREF = '/admin/comunidad/perfiles';

/** Tipo (`?tipo=`). */
export const PROFILE_KIND_FILTERS = Object.freeze({
	persona: 'Personas',
	proyecto: 'Proyectos',
	lugar: 'Lugares'
});

/** Origen (`?origen=`): de dónde salió el perfil. */
export const PROFILE_ORIGINS = Object.freeze({
	ficha: 'Importado de ficha',
	cuenta: 'Creado por una cuenta',
	panel: 'Creado en el panel'
});

/**
 * Estado (`?estado=`). Los cinco primeros son excluyentes (ver {@link profileState}); «Sin
 * revisar» es aparte: los creados por cuentas que ninguna admin miró todavía (el contador del
 * menú y la tarjeta del Inicio).
 */
export const PROFILE_STATES = Object.freeze({
	aprobado: 'Aprobado',
	'para-aprobar': 'Para aprobar',
	rechazado: 'Rechazado',
	oculto: 'Oculto',
	borrado: 'Borrado',
	'sin-revisar': 'Sin revisar (de cuentas)'
});

/** Vistas (`?vista=`) además de la lista: los pedidos y, con el interruptor apagado, los .md. */
export const PROFILE_VIEWS = Object.freeze({
	pedidos: 'Pedidos «Es mi perfil»',
	fichas: 'Fichas .md'
});

/** El viejo `?filtro=` de Cuentas › Perfiles, para que los links de antes filtren igual. */
const LEGACY_FILTERS = /** @type {Record<string, string>} */ ({
	'sin-revisar': 'sin-revisar',
	'sin-aprobar': 'para-aprobar',
	ocultos: 'oculto',
	borrados: 'borrado'
});

/** @typedef {{ q: string, kind: string, origin: string, state: string, view: string }} ProfileFilters */

/**
 * @param {string | null} value
 * @param {Readonly<Record<string, string>>} allowed
 */
const pick = (value, allowed) => (value && Object.hasOwn(allowed, value) ? value : '');

/**
 * Los filtros de la URL, limpios: lo desconocido se ignora.
 *
 * @param {URLSearchParams} params
 * @returns {ProfileFilters}
 */
export function parseProfileFilters(params) {
	const state =
		pick(params.get('estado'), PROFILE_STATES) ||
		pick(LEGACY_FILTERS[params.get('filtro') ?? ''] ?? null, PROFILE_STATES);
	return {
		q: (params.get('q') ?? '').trim().slice(0, 200),
		kind: pick(params.get('tipo'), PROFILE_KIND_FILTERS),
		origin: pick(params.get('origen'), PROFILE_ORIGINS),
		state,
		view: pick(params.get('vista'), PROFILE_VIEWS)
	};
}

/**
 * Link a la lista con estos filtros (los vacíos no van).
 *
 * @param {Partial<ProfileFilters>} filters
 */
export function profilesHref({ q = '', kind = '', origin = '', state = '', view = '' } = {}) {
	const p = new URLSearchParams();
	if (view) p.set('vista', view);
	if (q) p.set('q', q);
	if (kind) p.set('tipo', kind);
	if (origin) p.set('origen', origin);
	if (state) p.set('estado', state);
	const qs = p.toString();
	return qs ? `${PROFILES_HREF}?${qs}` : PROFILES_HREF;
}

/** ¿Hay algún filtro de la lista puesto? @param {Partial<ProfileFilters>} f */
export const hasProfileFilters = (f) => Boolean(f.q || f.kind || f.origin || f.state);

/**
 * De dónde salió un perfil: importado de una ficha .md (tiene fila en `profile_sources`), creado
 * por una cuenta (`created_by` = `cuenta:<id>`, también si la cuenta se borró después) o creado
 * en el panel (une admin).
 *
 * @param {{ imported: boolean, createdBy: string }} p
 * @returns {'ficha' | 'cuenta' | 'panel'}
 */
export function profileOrigin({ imported, createdBy }) {
	if (imported) return 'ficha';
	if (createdBy.startsWith('cuenta:')) return 'cuenta';
	return 'panel';
}

/**
 * El estado de un perfil, en este orden: borrado, oculto, aprobado (aparece en /amigues),
 * rechazado (un lugar de una cuenta que une admin rechazó) o, si no, para aprobar.
 *
 * @param {{ deletedAt: number | null, visibility: string, approved: boolean, rejected: boolean }} p
 * @returns {'borrado' | 'oculto' | 'aprobado' | 'rechazado' | 'para-aprobar'}
 */
export function profileState({ deletedAt, visibility, approved, rejected }) {
	if (deletedAt) return 'borrado';
	if (visibility === 'hidden') return 'oculto';
	if (approved) return 'aprobado';
	if (rejected) return 'rechazado';
	return 'para-aprobar';
}

/**
 * A dónde lleva cada fila: al editor del perfil (`/admin/comunidad/perfiles/<dirección>`, la vieja si vino
 * de una ficha; con el interruptor apagado ese editor abre el .md). Un perfil borrado no se edita:
 * va a su ficha (`/admin/comunidad/cuentas/perfiles/<id>`).
 *
 * @param {{ id: number, slug: string, legacySlug?: string | null, deletedAt: number | null }} p
 */
export function profileRowHref(p) {
	if (p.deletedAt) return profileHref(p.id);
	return `${PROFILES_HREF}/${encodeURIComponent(p.legacySlug || p.slug)}`;
}

/** @param {number | null | undefined} ms */
const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');

/**
 * @param {Readonly<Record<string, string>>} labels
 * @param {string} key
 */
const labelOf = (labels, key) => (Object.hasOwn(labels, key) ? labels[key] : key);

/**
 * Columnas del CSV de la lista (lo que se ve, con los filtros puestos). Las filas son
 * `AdminProfile` de src/lib/server/admin/cuentas.js.
 *
 * @type {readonly import('./csv.js').CsvColumn<any>[]}
 */
export const PROFILE_CSV_COLUMNS = Object.freeze([
	{ label: 'nombre', key: 'title' },
	{ label: 'direccion', value: (p) => p.legacySlug || p.slug },
	{ label: 'tipo', value: (p) => KIND_LABELS[p.kind] ?? p.kind },
	{ label: 'origen', value: (p) => labelOf(PROFILE_ORIGINS, p.origin) },
	{ label: 'estado', value: (p) => labelOf(PROFILE_STATES, profileState(p)) },
	{ label: 'visibilidad', value: (p) => VISIBILITY_LABELS[p.visibility] ?? p.visibility },
	{ label: 'creado', value: (p) => day(p.createdAt) },
	{
		label: 'lo_gestionan',
		value: (p) =>
			(p.managers ?? [])
				.map(
					(/** @type {any} */ m) =>
						`${m.email ?? 'cuenta borrada'} (${ROLE_LABELS[m.role] ?? m.role})`
				)
				.join(' / ')
	},
	{ label: 'borrado', value: (p) => day(p.deletedAt) }
]);
