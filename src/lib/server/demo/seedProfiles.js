/**
 * Perfiles de prueba del modo demo (Noche 3: amigues como perfiles #137 y personas en eventos
 * #139), para `reloadDemoData` (src/lib/server/demo/seed.js). Solo para la base de un preview.
 *
 * Los perfiles son objetos: se escriben con saveObject() (el único camino para `objects` y
 * `edges`), así que no van en el batch de SQL del seed. Es idempotente sin borrar: si el perfil
 * ya existe (por su dirección), queda como está; si no, se crea (y se aprueba para /amigues en la
 * misma tanda, como los que carga une admin). Las filas de apoyo que dependen de estos perfiles
 * (lugares de los eventos, pedidos «Es mi perfil») las pone el seed, con sus ids.
 *
 * Todo inventado: lugares de mentira (las coordenadas son del centro de Buenos Aires, un lugar
 * público), cuentas `@example.invalid`.
 *
 * Solo imports relativos (corre también en Node, como los scripts de scripts/demo/).
 */
import { saveObject } from '../objects/save.js';
import { approveNewStatement } from '../amigues/approvals.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Quién "carga" los perfiles de prueba (como une admin: nacen aprobados). */
export const PROFILES_BY = 'seed-demo';

/** Cuentas inventadas (ids con forma de UUID, armados acá; mails que no existen). */
export const DEMO_ACCOUNTS = Object.freeze({
	claimer: {
		id: '5eed0000-0000-4000-8000-000000000001',
		email: 'demo.reclama@example.invalid'
	},
	creator: {
		id: '5eed0000-0000-4000-8000-000000000002',
		email: 'demo.crea@example.invalid'
	}
});

/**
 * Los lugares, uno por nivel de privacidad. `event` dice a qué evento de prueba se vincula (la
 * serie del evento en src/lib/server/demo/seed.js; el seed elige la próxima fecha).
 */
export const DEMO_VENUES = Object.freeze([
	{
		slug: 'casa-demo-publica',
		title: 'Casa Demo Pública',
		event: 'noche-latex',
		data: {
			address: 'Calle Inventada 100',
			area: 'Barrio Demo',
			city: 'Ciudad Demo',
			lat: -34.6037,
			lng: -58.3816,
			how_to_get_there: 'Subte inventado, estación Demo. Timbre «Demo».',
			accessibility: 'Planta baja, sin escalones. Baño accesible.',
			venue_privacy: 'public'
		}
	},
	{
		slug: 'sotano-demo-solo-nombre',
		title: 'Sótano Demo Solo Nombre',
		event: 'munch-martes',
		data: {
			address: 'Pasaje Ficticio 200',
			area: 'Barrio Ficticio',
			city: 'Ciudad Demo',
			venue_privacy: 'name'
		}
	},
	{
		slug: 'galpon-demo-solo-barrio',
		title: 'Galpón Demo Solo Barrio',
		event: 'taller-cuerdas-1',
		data: {
			address: 'Avenida Imaginaria 300',
			area: 'Barrio Imaginario',
			city: 'Ciudad Demo',
			venue_privacy: 'area'
		}
	},
	{
		slug: 'refugio-demo-oculto',
		title: 'Refugio Demo Oculto',
		event: 'fiesta-preventas',
		data: {
			address: 'Calle Secreta 400',
			area: 'Barrio Secreto',
			city: 'Ciudad Demo',
			venue_privacy: 'hidden'
		}
	}
]);

/** Las demás fichas de prueba (personas, grupo, la que alguien reclama, la nueva de una cuenta). */
export const DEMO_PROFILES = Object.freeze([
	{
		slug: 'colectivo-demo',
		title: 'Colectivo Demo',
		data: { kind: 'grupo', bio: 'Un colectivo inventado para la demo.', show_members: true }
	},
	{
		slug: 'persona-demo-integrante',
		title: 'Persona Demo Integrante',
		data: { kind: 'persona', bio: 'Integrante inventade del Colectivo Demo.', pronouns: 'elle' },
		memberOf: 'colectivo-demo'
	},
	{
		slug: 'ficha-demo-sin-duene',
		title: 'Ficha Demo Sin Dueñe',
		data: { kind: 'persona', bio: 'Una ficha inventada que alguien dice que es suya.' }
	},
	{
		slug: 'perfil-demo-nuevo',
		title: 'Perfil Demo Nuevo',
		data: { kind: 'persona', bio: 'Creado desde Mi rincón (demo): espera la aprobación.' },
		by: 'creator'
	}
]);

/**
 * Crea (si faltan) las cuentas y los perfiles de prueba. Devuelve el id de cada perfil por
 * dirección. Sin las tablas de #137 (o de cuentas), no hace nada y devuelve un mapa vacío.
 *
 * @param {D1Database} db
 * @param {{ now?: number, tables: Set<string> }} opts
 * @returns {Promise<Map<string, number>>}
 */
export async function ensureDemoProfiles(db, { now = Date.now(), tables }) {
	/** @type {Map<string, number>} */
	const ids = new Map();
	const needed = ['objects', 'accounts', 'profile_managers', 'profile_approvals'];
	if (!needed.every((t) => tables.has(t))) return ids;

	for (const a of Object.values(DEMO_ACCOUNTS)) {
		await db
			.prepare(
				`INSERT OR IGNORE INTO accounts (id, email, email_verified_at, created_at, updated_at, can_have_profiles)
				VALUES (?1, ?2, ?3, ?3, ?3, 1)`
			)
			.bind(a.id, a.email, now)
			.run();
	}

	/**
	 * @param {{ slug: string, title: string, data: Record<string, unknown> }} p
	 * @param {{ approved?: boolean, actor?: string }} [o]
	 */
	const ensure = async (p, { approved = true, actor = PROFILES_BY } = {}) => {
		const found = await db
			.prepare("SELECT id FROM objects WHERE type = 'perfil' AND slug = ?1")
			.bind(p.slug)
			.first();
		if (found) return Number(found.id);
		const saved = await saveObject(
			db,
			{ type: 'perfil', title: p.title, slug: p.slug, data: p.data },
			{
				actor,
				now,
				also: (self) => (approved ? [approveNewStatement(db, self, PROFILES_BY, now)] : [])
			}
		);
		return saved.id;
	};

	for (const v of DEMO_VENUES) {
		ids.set(
			v.slug,
			await ensure({ slug: v.slug, title: v.title, data: { kind: 'lugar', ...v.data } })
		);
	}
	for (const p of DEMO_PROFILES) {
		const account = p.by ? DEMO_ACCOUNTS[/** @type {'creator'} */ (p.by)] : null;
		const id = await ensure(p, {
			approved: !account,
			actor: account ? `cuenta:${account.id}` : PROFILES_BY
		});
		ids.set(p.slug, id);
		if (account) {
			await db
				.prepare(
					`INSERT OR IGNORE INTO profile_managers (profile_id, account_id, role, created_at)
					VALUES (?1, ?2, 'owner', ?3)`
				)
				.bind(id, account.id, now)
				.run();
		}
	}
	// Integrante del grupo (solo si todavía no lo es: no cambia la versión en cada recarga).
	for (const p of DEMO_PROFILES) {
		if (!p.memberOf) continue;
		const id = /** @type {number} */ (ids.get(p.slug));
		const group = /** @type {number} */ (ids.get(p.memberOf));
		const edge = await db
			.prepare(
				"SELECT 1 AS x FROM edges WHERE from_id = ?1 AND kind = 'es_integrante_de' AND to_id = ?2"
			)
			.bind(id, group)
			.first();
		if (edge) continue;
		const row = await db.prepare('SELECT version FROM objects WHERE id = ?1').bind(id).first();
		await saveObject(
			db,
			{ id, type: 'perfil', version: Number(row?.version), edges: { es_integrante_de: [group] } },
			{ actor: PROFILES_BY, now }
		);
	}
	return ids;
}
