// Datos de demo (INVENTADOS) para probar amigues y lugares en la base D1 LOCAL:
// - un lugar en cada nivel de privacidad (pública, solo el nombre, solo el barrio, oculta),
//   cada uno vinculado a un evento del repo (edge `lugar`: el evento tiene que estar importado en
//   la base local, Contenido → En la base; si no, se avisa y se saltea);
// - un proyecto con un integrante que se muestra;
// - una cuenta con un pedido "Es mi perfil" pendiente;
// - un perfil nuevo de una cuenta, esperando que une admin lo apruebe.
//
//   node scripts/demo/n3-amigues.js
//   npm run dev:admin
//
// Se puede correr más de una vez (no duplica). Escribe los perfiles con saveObject(). Nunca toca
// una base remota (ver scripts/local-d1.js). Para importar también las fichas reales:
// `npm run amigues:import`.
import { readdir, readFile } from 'node:fs/promises';
import { saveObject, slugify } from '../../src/lib/server/objects/save.js';
import { approveNewStatement } from '../../src/lib/server/amigues/approvals.js';
import { parseFrontmatter, splitMarkdown } from '../../src/lib/server/amigues/importer.js';
import { openLocalD1 } from '../local-d1.js';

const ACTOR = 'demo-n3';

/** Lugares inventados (las coordenadas son de lugares públicos conocidos, no de nadie). */
const VENUES = [
	{
		title: 'Casa Demo Pública',
		data: {
			address: 'Calle Inventada 100',
			area: 'Barrio Demo',
			city: 'Ciudad Demo',
			lat: -34.6037,
			lng: -58.3816,
			how_to_get_there: 'Subte inventado, estación Demo. Timbre "Demo".',
			accessibility: 'Planta baja, sin escalones. Baño accesible.',
			venue_privacy: 'public'
		}
	},
	{
		title: 'Sótano Demo Solo Nombre',
		data: {
			address: 'Pasaje Ficticio 200',
			area: 'Barrio Ficticio',
			city: 'Ciudad Demo',
			venue_privacy: 'name'
		}
	},
	{
		title: 'Galpón Demo Solo Barrio',
		data: {
			address: 'Avenida Imaginaria 300',
			area: 'Barrio Imaginario',
			city: 'Ciudad Demo',
			venue_privacy: 'area'
		}
	},
	{
		title: 'Refugio Demo Oculto',
		data: {
			address: 'Calle Secreta 400',
			area: 'Barrio Secreto',
			city: 'Ciudad Demo',
			venue_privacy: 'hidden'
		}
	}
];

/**
 * Crea el perfil si no existe (por su dirección) y lo aprueba. Devuelve su id.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ title: string, slug: string, data: Record<string, unknown>, approved?: boolean, actor?: string }} p
 */
async function ensureProfile(db, { title, slug, data, approved = true, actor = ACTOR }) {
	const found = await db
		.prepare("SELECT id FROM objects WHERE type = 'perfil' AND slug = ?1")
		.bind(slug)
		.first();
	if (found) return Number(found.id);
	const now = Date.now();
	const saved = await saveObject(
		db,
		{ type: 'perfil', title, slug, data },
		{ actor, now, also: (self) => (approved ? [approveNewStatement(db, self, ACTOR, now)] : []) }
	);
	return saved.id;
}

/**
 * Una cuenta inventada (con el permiso de perfiles). Devuelve su id.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} email
 */
async function ensureAccount(db, email) {
	const found = await db.prepare('SELECT id FROM accounts WHERE email = ?1').bind(email).first();
	if (found) return String(found.id);
	const id = crypto.randomUUID();
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO accounts (id, email, email_verified_at, created_at, updated_at, can_have_profiles)
			VALUES (?1, ?2, ?3, ?3, ?3, 1)`
		)
		.bind(id, email, now)
		.run();
	return id;
}

const { db, dispose } = await openLocalD1();
try {
	// Los eventos con la fecha más nueva del repo: uno por lugar.
	const dir = 'src/lib/posts/calendario';
	const dated = [];
	for (const f of await readdir(dir)) {
		if (!f.endsWith('.md') || f.startsWith('_')) continue;
		try {
			const raw = await readFile(`${dir}/${f}`, 'utf8');
			const meta = parseFrontmatter(splitMarkdown(raw).frontmatter);
			if (!meta.force_unpublished)
				dated.push({ slug: f.slice(0, -3), start: String(meta.start ?? '') });
		} catch {
			// un frontmatter que el parser estricto no lee: ese evento no se usa para la demo
		}
	}
	const events = dated
		.sort((a, b) => b.start.localeCompare(a.start))
		.slice(0, VENUES.length)
		.map((e) => e.slug);
	for (const [i, v] of VENUES.entries()) {
		const slug = slugify(v.title);
		const id = await ensureProfile(db, {
			title: v.title,
			slug,
			data: { kind: 'lugar', ...v.data }
		});
		if (events[i]) {
			// «Sucede en» es el edge `lugar` del evento (docs/amigues.md), con saveObject(). Sin
			// pisar el lugar que ya tenga.
			const ev = await db
				.prepare(
					`SELECT o.id, o.version, EXISTS (SELECT 1 FROM edges e WHERE e.from_id = o.id
						AND e.kind = 'lugar') AS has_venue
					FROM objects o LEFT JOIN content_sources s ON s.object_id = o.id AND s.category = 'calendario'
					WHERE o.type = 'evento' AND (s.legacy_slug = ?1 OR (s.legacy_slug IS NULL AND o.slug = ?1))`
				)
				.bind(events[i])
				.first();
			if (!ev) {
				console.log(`evento ${events[i]} no está en la base local: «${v.title}» queda sin evento`);
			} else if (!ev.has_venue) {
				await saveObject(
					db,
					{
						id: Number(ev.id),
						type: 'evento',
						version: Number(ev.version),
						edges: { lugar: [id] }
					},
					{ actor: ACTOR }
				);
				console.log(`lugar «${v.title}» (${v.data.venue_privacy}) → evento ${events[i]}`);
			}
		}
	}

	// Un proyecto que muestra a su integrante.
	const group = await ensureProfile(db, {
		title: 'Colectivo Demo',
		slug: 'colectivo-demo',
		data: { kind: 'proyecto', bio: 'Un colectivo inventado para la demo.', show_members: true }
	});
	const member = await ensureProfile(db, {
		title: 'Persona Demo Integrante',
		slug: 'persona-demo-integrante',
		data: { kind: 'persona', bio: 'Integrante inventade del Colectivo Demo.', pronouns: 'elle' }
	});
	const row = await db.prepare('SELECT version FROM objects WHERE id = ?1').bind(member).first();
	await saveObject(
		db,
		{
			id: member,
			type: 'perfil',
			version: Number(row?.version),
			edges: { es_integrante_de: [group] }
		},
		{ actor: ACTOR }
	);
	console.log('proyecto «Colectivo Demo» con «Persona Demo Integrante»');

	// Un pedido "Es mi perfil" pendiente.
	const claimed = await ensureProfile(db, {
		title: 'Ficha Demo Sin Dueñe',
		slug: 'ficha-demo-sin-duene',
		data: { kind: 'persona', bio: 'Una ficha inventada que alguien dice que es suya.' }
	});
	const claimer = await ensureAccount(db, 'demo-reclama@example.com');
	await db
		.prepare(
			`INSERT INTO profile_claims (profile_id, account_id, message, status, created_at)
			VALUES (?1, ?2, 'Soy yo (pedido de demo)', 'pending', ?3)
			ON CONFLICT (profile_id, account_id) WHERE status = 'pending' DO NOTHING`
		)
		.bind(claimed, claimer, Date.now())
		.run();
	console.log('pedido «Es mi perfil» de demo-reclama@example.com sobre «Ficha Demo Sin Dueñe»');

	// Un perfil nuevo de una cuenta, sin aprobar.
	const creator = await ensureAccount(db, 'demo-crea@example.com');
	const fresh = await ensureProfile(db, {
		title: 'Perfil Demo Nuevo',
		slug: 'perfil-demo-nuevo',
		data: { kind: 'persona', bio: 'Creado desde Mi rincón (demo): espera la aprobación.' },
		approved: false,
		actor: `cuenta:${creator}`
	});
	await db
		.prepare(
			`INSERT INTO profile_managers (profile_id, account_id, role, created_at) VALUES (?1, ?2, 'owner', ?3)
			ON CONFLICT (profile_id, account_id) DO NOTHING`
		)
		.bind(fresh, creator, Date.now())
		.run();
	console.log('perfil «Perfil Demo Nuevo» de demo-crea@example.com, sin aprobar');
	console.log('\nListo. Miralo con: npm run dev:admin');
} finally {
	await dispose();
}
