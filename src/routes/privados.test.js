/**
 * Lo privado nunca sale en público (docs/objetos.md, «Un solo lugar decide quién ve qué»).
 *
 * Planta, con los mismos caminos que usa el panel, objetos de cada tipo en cada nivel que una
 * visita sin cuenta no puede ver (oculto, solo con cuenta, borrado, sin aprobar, no listado) y
 * revisa que no aparezcan en ninguna salida pública: las listas, la búsqueda, el sitemap, el RSS,
 * los .ics, los JSON, las imágenes para compartir y sus direcciones directas. Los lugares, además,
 * con cada nivel de privacidad de su dirección.
 *
 * Para sumar una salida pública nueva (un feed, un JSON, una imagen para compartir): una línea en
 * `LIST_OUTPUTS` (si lista cosas) o en `DIRECT_OUTPUTS` (si es la dirección de un objeto).
 *
 * D1 de miniflare; todo inventado (las marcas `fugazz` no aparecen en ningún dato real).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { stringify } from 'yaml';
import { createTestDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { importTags } from '$lib/server/etiquetas/importer.js';
import { createProfileFromPanel, emptyFormValues } from '$lib/server/amigues/editor.js';
import { makeAccount } from '$lib/server/amigues/testing.js';
import { solidPng, fakePdf } from '$lib/server/media/testing.js';

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// Sin interruptores ni secretos del entorno de quien corre las pruebas.
vi.mock('$env/dynamic/private', () => ({ env: {} }));

/** La serie pública que llevan todos los eventos y el material (su página, su .ics, su JSON). */
const PUBLIC_SERIES = 'fugazz serie publica';
const PUBLIC_SERIES_SLUG = 'fugazz-serie-publica';

/**
 * @typedef {{
 *   type: string,
 *   level: string,
 *   slug: string,
 *   secrets: string[],
 *   direct: boolean,
 *   path?: string,
 *   keys?: string[]
 * }} Planted
 *   `secrets`: textos que no pueden salir; `direct`: si su dirección directa se puede abrir (no
 *   listado sí; oculto, solo con cuenta, borrado y sin aprobar, no); `keys`: los secretos que son
 *   su nombre interno (la clave de una etiqueta), además de `slug`
 */

/** @type {Planted[]} */
const planted = [];
/** @type {Planted[]} */
const controls = [];
/** @type {Planted[]} */
const linked = [];

/** @param {string} type @param {string} level */
const slugOf = (type, level) => `fugazz-${type}-${level}`;
/** @param {string} type @param {string} level */
const titleOf = (type, level) => `Fugazz ${type} ${level}`.replaceAll('-', ' ');
/** @param {string} type @param {string} level */
const secretOf = (type, level) => `secreto-${type}-${level}-fugazz`;

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;

// ---------------------------------------------------------------------------------------------
// Cómo se planta cada cosa: por el camino del panel.
// ---------------------------------------------------------------------------------------------

/** El cliente del repo del panel (los .md de eventos y material van a la base). */
async function panelClient() {
	const repo = await import('$lib/server/contenido/repo.js');
	repo.setContentDB(t.db);
	// El repo de mentira: nada de lo que se guarda acá llega a él (todo va a la base).
	return repo.withContentDb(
		/** @type {any} */ ({ commitFiles: async () => ({ sha: 'repo', url: '/' }) })
	);
}

/** @param {Record<string, unknown>} meta @param {string} body */
const markdown = (meta, body) => `---\n${stringify(meta)}---\n\n${body}\n`;

/**
 * Un evento o un material guardado desde el panel (el editor guarda el .md en la base).
 *
 * @param {'calendario' | 'material'} category
 * @param {string} slug
 * @param {{ title: string, body: string, extra?: Record<string, unknown>, edges?: Record<string, number[]> }} o
 */
async function panelPost(category, slug, { title, body, extra = {}, edges }) {
	const client = await panelClient();
	const path = `src/lib/posts/${category}/${slug}.md`;
	const meta =
		category === 'calendario'
			? {
					title,
					summary: 'Un evento de prueba',
					layout: 'calendario',
					category: 'calendario',
					published_date: '2026-09-01T00:00-03:00',
					start: '2099-03-01T20:00-03:00',
					status: 'abierto',
					tags: [PUBLIC_SERIES],
					authors: ['KinkyVibe'],
					...extra
				}
			: {
					title,
					summary: 'Un material de prueba',
					layout: 'material',
					category: 'material',
					published_date: '2026-09-01T00:00-03:00',
					tags: [PUBLIC_SERIES],
					authors: ['KinkyVibe'],
					...extra
				};
	await client.commitFiles('token', {
		files: [{ path, content: markdown(meta, body) }],
		message: 'prueba',
		actor: 'admin-de-prueba',
		...(edges ? { edges: { [path]: edges } } : {})
	});
}

/** Borrar desde el panel. @param {'calendario' | 'material'} category @param {string} slug */
async function panelDelete(category, slug) {
	const client = await panelClient();
	await client.commitFiles('token', {
		files: [{ path: `src/lib/posts/${category}/${slug}.md`, delete: true }],
		message: 'prueba',
		actor: 'admin-de-prueba'
	});
}

/** @param {'evento' | 'material'} type @param {string} slug */
async function objectOf(type, slug) {
	const row = await t.db
		.prepare('SELECT id, version FROM objects WHERE type = ?1 AND slug = ?2')
		.bind(type, slug)
		.first();
	return /** @type {{ id: number, version: number }} */ (row);
}

/**
 * «Solo con cuenta»: el panel todavía no lo ofrece para eventos y material, pero la visibilidad
 * existe (`saveObject()`, el único camino de escritura).
 *
 * @param {'evento' | 'perfil' | 'material' | 'etiqueta'} type
 * @param {number} id
 * @param {'members' | 'hidden'} visibility
 */
async function setVisibility(type, id, visibility) {
	const row = /** @type {{ version: number }} */ (
		await t.db.prepare('SELECT version FROM objects WHERE id = ?1').bind(id).first()
	);
	await saveObject(
		t.db,
		{ id, type, version: row.version, visibility },
		{ actor: 'admin-de-prueba' }
	);
}

/** Borrar como el panel (borrado suave). @param {string} type @param {number} id */
async function softDelete(type, id) {
	const row = /** @type {{ version: number }} */ (
		await t.db.prepare('SELECT version FROM objects WHERE id = ?1').bind(id).first()
	);
	await saveObject(
		t.db,
		{ id, type, version: row.version, deleted: true },
		{ actor: 'admin-de-prueba' }
	);
}

/**
 * Un perfil creado desde el panel (nace aprobado).
 *
 * @param {string} title
 * @param {{ kind?: string, visibility?: string, text?: Record<string, string>, unlisted?: boolean, lat?: string, lng?: string, venue_privacy?: string }} [o]
 */
async function panelProfile(title, o = {}) {
	const values = emptyFormValues(o.kind ?? 'persona');
	values.title = title;
	if (o.visibility) values.visibility = o.visibility;
	Object.assign(values.text, o.text ?? {});
	values.unlisted = o.unlisted === true;
	values.lat = o.lat ?? '';
	values.lng = o.lng ?? '';
	values.venue_privacy = o.venue_privacy ?? '';
	const r = await createProfileFromPanel(t.db, values, { actor: 'admin-de-prueba' });
	if (!r.ok) throw new Error(`No se pudo crear ${title}: ${r.message}`);
	return r.profile;
}

/**
 * Eventos y material, en cada nivel.
 *
 * @param {'evento' | 'material'} type
 */
async function plantContent(type) {
	const category = type === 'evento' ? 'calendario' : 'material';
	const base = type === 'evento' ? '/calendario' : '/material';
	/** @param {string} level @param {Record<string, unknown>} [extra] */
	const post = async (level, extra) => {
		const slug = slugOf(type, level);
		await panelPost(category, slug, {
			title: titleOf(type, level),
			body: `Un texto con una palabra secreta: ${secretOf(type, level)}.`,
			extra
		});
		return slug;
	};
	/** @param {string} level @param {boolean} direct */
	const record = (level, direct) => {
		const item = {
			type,
			level,
			slug: slugOf(type, level),
			path: `${base}/${slugOf(type, level)}`,
			secrets: [slugOf(type, level), titleOf(type, level), secretOf(type, level)],
			direct
		};
		(level === 'publico' ? controls : planted).push(item);
	};

	await post('publico');
	record('publico', true);

	await post('oculto', { force_unpublished: true });
	record('oculto', false);

	await post('no-listado', { force_unlisted: true });
	record('no-listado', true);

	await post('solo-cuentas');
	await setVisibility(type, (await objectOf(type, slugOf(type, 'solo-cuentas'))).id, 'members');
	record('solo-cuentas', false);

	await post('borrado');
	await panelDelete(category, slugOf(type, 'borrado'));
	record('borrado', false);
}

/** Perfiles (personas, proyectos y lugares), en cada nivel. */
async function plantProfiles() {
	/**
	 * @param {string} kind
	 * @param {string} level
	 * @param {Parameters<typeof panelProfile>[1]} [o]
	 */
	const profile = async (kind, level, o = {}) => {
		const type = `perfil-${kind}`;
		const p = await panelProfile(titleOf(type, level), {
			kind,
			...o,
			text: {
				bio: `Una bio secreta: ${secretOf(type, level)}.`,
				...(kind === 'lugar' ? { address: `Calle ${level} fugazz 99` } : {}),
				...(o.text ?? {})
			}
		});
		if (p.slug !== slugOf(type, level)) throw new Error(`Dirección inesperada: ${p.slug}`);
		const item = {
			type,
			level,
			slug: String(p.slug),
			path: `/amigues/${p.slug}`,
			secrets: [
				String(p.slug),
				titleOf(type, level),
				secretOf(type, level),
				...(kind === 'lugar' && level !== 'publico' && level !== 'no-listado'
					? [`Calle ${level} fugazz 99`]
					: [])
			],
			direct: level === 'publico' || level === 'no-listado'
		};
		(level === 'publico' ? controls : planted).push(item);
		return p;
	};

	for (const kind of ['persona', 'proyecto', 'lugar']) {
		await profile(kind, 'publico');
		await profile(kind, 'oculto', { visibility: 'hidden' });
		await profile(kind, 'solo-cuentas', { visibility: 'members' });
		await profile(kind, 'no-listado', { unlisted: true });
		const gone = await profile(kind, 'borrado');
		await softDelete('perfil', gone.id);
	}

	// Sin aprobar: lo crea una cuenta desde Mi rincón y todavía no lo aprobó nadie.
	const { createProfile } = await import('$lib/server/cuentas/perfiles.js');
	for (const kind of ['persona', 'proyecto', 'lugar']) {
		const type = `perfil-${kind}`;
		const account = await makeAccount(t.db, `cuenta-fugazz-${kind}`);
		const r = await createProfile(t.db, account.id, {
			kind,
			title: titleOf(type, 'sin-aprobar'),
			bio: `Una bio secreta: ${secretOf(type, 'sin-aprobar')}.`,
			...(kind === 'lugar' ? { address: `Calle ${secretOf(type, 'sin-aprobar')} 1` } : {})
		});
		if (!r.ok) throw new Error(`No se pudo crear el perfil sin aprobar: ${r.message}`);
		planted.push({
			type,
			level: 'sin-aprobar',
			slug: String(r.profile.slug),
			path: `/amigues/${r.profile.slug}`,
			secrets: [
				String(r.profile.slug),
				titleOf(type, 'sin-aprobar'),
				secretOf(type, 'sin-aprobar')
			],
			direct: false
		});
	}
}

/** Etiquetas: una serie pública (control) y una etiqueta y una serie ocultas, con su wiki. */
async function plantTags() {
	/** @param {string} level */
	const wiki = (level) => ({
		name: slugOf('etiqueta', level),
		raw: `---\ntitle: ${titleOf('etiqueta', level)}\nwiki: ${titleOf('etiqueta', level).toLowerCase()}\nlayout: wiki\ncategory: wiki\n---\n\nTexto de la wiki: ${secretOf('etiqueta', level)}.\n`
	});
	await importTags(
		t.db,
		{
			rawTags: [
				{
					id: 'root',
					children: [
						'evento recurrente',
						...['publico', 'oculto'].map((l) => titleOf('etiqueta', l).toLowerCase())
					]
				},
				{ id: 'evento recurrente', children: [PUBLIC_SERIES, 'fugazz serie oculta'] },
				{ id: PUBLIC_SERIES, description: 'Una serie de prueba.' },
				{ id: 'fugazz serie oculta', description: `Descripción: ${secretOf('serie', 'oculta')}.` },
				{ id: titleOf('etiqueta', 'publico').toLowerCase() },
				{
					id: titleOf('etiqueta', 'oculto').toLowerCase(),
					description: `Descripción: ${secretOf('etiqueta', 'oculto')}.`
				}
			],
			wikiFiles: [wiki('publico'), wiki('oculto')]
		},
		{ actor: 'admin-de-prueba' }
	);
	/** @param {string} key */
	const idOf = async (key) =>
		Number(
			/** @type {{ id: number }} */ (
				await t.db
					.prepare(
						`SELECT id FROM objects WHERE type = 'etiqueta' AND json_extract(data, '$.key') = ?1`
					)
					.bind(key)
					.first()
			).id
		);
	await setVisibility(
		'etiqueta',
		await idOf(titleOf('etiqueta', 'oculto').toLowerCase()),
		'hidden'
	);
	await setVisibility('etiqueta', await idOf('fugazz serie oculta'), 'hidden');
	controls.push({
		type: 'etiqueta',
		level: 'publico',
		slug: slugOf('etiqueta', 'publico'),
		path: `/wiki/${slugOf('etiqueta', 'publico')}`,
		secrets: [`/wiki/${slugOf('etiqueta', 'publico')}`, secretOf('etiqueta', 'publico')],
		direct: true
	});
	controls.push({
		type: 'serie',
		level: 'publico',
		slug: PUBLIC_SERIES_SLUG,
		path: `/wiki/${PUBLIC_SERIES_SLUG}`,
		secrets: [PUBLIC_SERIES],
		direct: true
	});
	planted.push(
		{
			type: 'etiqueta',
			level: 'oculto',
			slug: slugOf('etiqueta', 'oculto'),
			path: `/wiki/${slugOf('etiqueta', 'oculto')}`,
			secrets: [titleOf('etiqueta', 'oculto').toLowerCase(), secretOf('etiqueta', 'oculto')],
			keys: [titleOf('etiqueta', 'oculto').toLowerCase()],
			direct: false
		},
		{
			type: 'serie',
			level: 'oculto',
			slug: 'fugazz-serie-oculta',
			path: '/wiki/fugazz-serie-oculta',
			secrets: ['fugazz serie oculta', secretOf('serie', 'oculta')],
			keys: ['fugazz serie oculta'],
			direct: false
		}
	);
}

/**
 * La biblioteca: una imagen y un documento borrados, y la portada de un evento oculto (la imagen
 * existe, pero solo la usa algo que no se ve: su dirección no puede salir en ninguna lista).
 */
async function plantMedia() {
	const { storeImage, storeFile } = await import('$lib/server/media/library.js');
	const bucket = /** @type {any} */ (t.env.MEDIA);
	const opts = { actor: 'admin-de-prueba' };

	const shown = await storeImage(
		t.db,
		bucket,
		{ bytes: solidPng(3, 3, [1, 2, 3]), name: 'a.png', alt: 'Una imagen' },
		opts
	);
	await panelPost('calendario', 'fugazz-evento-con-portada', {
		title: 'Fugazz evento con portada',
		body: 'Un evento público con portada.',
		edges: { portada: [shown.image.id] }
	});
	controls.push({
		type: 'imagen',
		level: 'publico',
		slug: shown.image.key,
		path: `/media/${shown.image.key}`,
		secrets: [shown.image.key],
		direct: true
	});

	const gone = await storeImage(
		t.db,
		bucket,
		{ bytes: solidPng(3, 3, [4, 5, 6]), name: 'b.png', alt: 'Otra imagen' },
		opts
	);
	await panelPost('calendario', 'fugazz-evento-portada-borrada', {
		title: 'Fugazz evento portada borrada',
		body: 'Un evento público cuya portada se borró.',
		edges: { portada: [gone.image.id] }
	});
	await softDelete('imagen', gone.image.id);
	planted.push({
		type: 'imagen',
		level: 'borrado',
		slug: gone.image.key,
		path: `/media/${gone.image.key}`,
		secrets: [gone.image.key],
		direct: false
	});

	const ofHidden = await storeImage(
		t.db,
		bucket,
		{ bytes: solidPng(3, 3, [7, 8, 9]), name: 'c.png', alt: 'Una portada' },
		opts
	);
	await panelPost('calendario', 'fugazz-evento-oculto-con-portada', {
		title: 'Fugazz evento oculto con portada',
		body: 'Un evento oculto con portada.',
		extra: { force_unpublished: true },
		edges: { portada: [ofHidden.image.id] }
	});
	planted.push({
		type: 'imagen',
		level: 'portada de algo oculto',
		slug: ofHidden.image.key,
		path: `/media/${ofHidden.image.key}`,
		secrets: [ofHidden.image.key, 'fugazz-evento-oculto-con-portada'],
		// la imagen se sigue sirviendo (la dirección es por contenido y no dice de qué es)
		direct: true
	});

	const file = await storeFile(
		t.db,
		bucket,
		{ bytes: fakePdf(400), title: 'Documento fugazz borrado' },
		opts
	);
	await softDelete('archivo', file.file.id);
	planted.push({
		type: 'archivo',
		level: 'borrado',
		slug: file.file.key,
		path: `/media/${file.file.key}`,
		secrets: [file.file.key],
		direct: false
	});
}

/**
 * Datos de personas que nunca son públicos: los mails de las cuentas (las que crearon perfiles
 * sin aprobar y una que gestiona un perfil público), una compra de un evento público (nombre,
 * mail, DNI y respuestas de inscripción) y una nota interna del panel sobre quien compró.
 *
 * @type {string[]}
 */
const personalSecrets = [];

async function plantPeople() {
	const { addManager } = await import('$lib/server/amigues/testing.js');
	const { addNote } = await import('$lib/server/admin/people.js');
	// Los mails de las cuentas que crearon los perfiles sin aprobar.
	for (const kind of ['persona', 'proyecto', 'lugar']) {
		personalSecrets.push(`cuenta-fugazz-${kind}@example.com`);
	}
	// Una cuenta que gestiona un perfil público.
	const manager = await makeAccount(t.db, 'gestore-fugazz');
	const shown = /** @type {{ id: number }} */ (
		await t.db
			.prepare(`SELECT id FROM objects WHERE type = 'perfil' AND slug = ?1`)
			.bind(slugOf('perfil-persona', 'publico'))
			.first()
	);
	await addManager(t.db, shown.id, manager.id);
	personalSecrets.push(manager.email);
	// Una compra de un evento público, con sus respuestas.
	const buyer = {
		name: 'Compradore Fugazz Secrete',
		email: 'compradore-fugazz@example.com',
		dni: '99000111'
	};
	const orderId = '00000000-0000-4000-9000-00000000f0f0';
	const now = Date.now();
	await t.db
		.prepare(
			`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, subtotal, total,
				buyer_name, buyer_email, buyer_dni, status, created_at, updated_at, expires_at)
			VALUES (?1, ?2, 'general', 1, 1000, 1000, 1000, ?3, ?4, ?5, 'approved', ?6, ?6, ?6)`
		)
		.bind(orderId, slugOf('evento', 'publico'), buyer.name, buyer.email, buyer.dni, now)
		.run();
	await t.db
		.prepare('INSERT INTO order_answers (order_id, answers, created_at) VALUES (?1, ?2, ?3)')
		.bind(orderId, JSON.stringify({ alergias: 'respuesta-fugazz-secreta' }), now)
		.run();
	await addNote(t.db, { email: buyer.email, body: 'nota-interna-fugazz', by: 'admin-de-prueba' });
	personalSecrets.push(
		buyer.name,
		buyer.email,
		buyer.dni,
		'respuesta-fugazz-secreta',
		'nota-interna-fugazz'
	);
}

// ---------------------------------------------------------------------------------------------
// Lugares: cada nivel de privacidad de la dirección, por defecto del lugar y propio del evento.
// ---------------------------------------------------------------------------------------------

const VENUE_LEVELS = /** @type {const} */ (['public', 'name', 'address', 'area', 'hidden']);

/** @param {string} level */
const venueOf = (level) => ({
	name: `Galpon Fugazz ${level}`,
	address: `Calle Fugazz ${level} 1234`,
	area: `Barrio Fugazz ${level}`,
	howTo: `Timbre fugazz ${level}`,
	access: `Rampa fugazz ${level}`,
	lat: `-34.6${VENUE_LEVELS.indexOf(/** @type {any} */ (level)) + 1}1234`,
	lng: `-58.4${VENUE_LEVELS.indexOf(/** @type {any} */ (level)) + 1}5678`
});

/**
 * @type {Array<{ event: string, level: typeof VENUE_LEVELS[number], venue: ReturnType<typeof venueOf>, from: 'lugar' | 'evento', venueSlug: string }>}
 */
const venueCases = [];

async function plantVenues() {
	const { setEventVenue } = await import('$lib/server/amigues/venues.js');
	/** @param {string} key @param {string} privacy */
	const venue = async (key, privacy) => {
		const v = venueOf(key);
		return panelProfile(v.name, {
			kind: 'lugar',
			text: {
				address: v.address,
				area: v.area,
				city: 'Ciudad Inventada',
				how_to_get_there: v.howTo,
				accessibility: v.access
			},
			lat: v.lat,
			lng: v.lng,
			venue_privacy: privacy
		});
	};
	// El nivel del lugar (el evento no elige: vale el del lugar).
	for (const level of VENUE_LEVELS) {
		const v = await venue(level, level);
		const event = `fugazz-en-lugar-${level}`;
		await panelPost('calendario', event, { title: `Fugazz en lugar ${level}`, body: 'Un evento.' });
		const r = await setEventVenue(t.db, {
			eventSlug: event,
			venueId: v.id,
			privacy: null,
			by: 'a'
		});
		if (!r.ok) throw new Error(r.message);
		venueCases.push({
			event,
			level,
			venue: venueOf(level),
			from: 'lugar',
			venueSlug: String(v.slug)
		});
	}
	// El nivel propio de cada evento, en un lugar público.
	const open = await venue('abierto', 'public');
	for (const level of VENUE_LEVELS) {
		const event = `fugazz-nivel-evento-${level}`;
		await panelPost('calendario', event, {
			title: `Fugazz nivel evento ${level}`,
			body: 'Un evento.'
		});
		const r = await setEventVenue(t.db, {
			eventSlug: event,
			venueId: open.id,
			privacy: level,
			by: 'a'
		});
		if (!r.ok) throw new Error(r.message);
		venueCases.push({
			event,
			level,
			venue: venueOf('abierto'),
			from: 'evento',
			venueSlug: String(open.slug)
		});
	}
}

/**
 * Lo público que apunta a lo privado: un evento y un material públicos con personas que son
 * perfiles ocultos, solo con cuenta, sin aprobar o borrados, con las etiquetas ocultas, y el
 * evento en un lugar oculto. Lo público se ve; lo privado sigue sin salir (lo revisan las mismas
 * pruebas de arriba, con los mismos textos).
 */
async function plantLinks() {
	const levels = ['oculto', 'solo-cuentas', 'sin-aprobar', 'borrado'];
	const personas = planted
		.filter((p) => p.type.startsWith('perfil-') && levels.includes(p.level))
		.map((p) => ({ perfil: p.slug, rol: 'Facilita' }));
	const tags = [PUBLIC_SERIES, titleOf('etiqueta', 'oculto').toLowerCase(), 'fugazz serie oculta'];
	for (const category of /** @type {const} */ (['calendario', 'material'])) {
		const type = category === 'calendario' ? 'evento' : 'material';
		const slug = slugOf(type, 'con-vinculos');
		await panelPost(category, slug, {
			title: titleOf(type, 'con vinculos'),
			body: `Un texto público: ${secretOf(type, 'con-vinculos')}.`,
			extra: { tags, personas }
		});
		linked.push({
			type,
			level: 'con vínculos a lo privado',
			slug,
			path: `/${category}/${slug}`,
			secrets: [slug, secretOf(type, 'con-vinculos')],
			direct: true
		});
	}
	const hiddenVenue = /** @type {Planted} */ (
		planted.find((p) => p.type === 'perfil-lugar' && p.level === 'oculto')
	);
	const { setEventVenue } = await import('$lib/server/amigues/venues.js');
	const row = /** @type {{ id: number }} */ (
		await t.db
			.prepare(`SELECT id FROM objects WHERE type = 'perfil' AND slug = ?1`)
			.bind(hiddenVenue.slug)
			.first()
	);
	const r = await setEventVenue(t.db, {
		eventSlug: slugOf('evento', 'con-vinculos'),
		venueId: row.id,
		privacy: 'public',
		by: 'a'
	});
	if (!r.ok) throw new Error(r.message);
}

// ---------------------------------------------------------------------------------------------
// Las salidas públicas. Para sumar una: una línea acá.
// ---------------------------------------------------------------------------------------------

/** @param {{ path?: string, params?: Record<string, string> }} [o] */
function anonEvent({ path = '/', params = {} } = {}) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	return /** @type {any} */ ({
		url,
		params,
		platform: t.platform,
		locals: { user: undefined, member: undefined, user_token: '' },
		setHeaders: () => {},
		fetch: async () => new Response('{}', { status: 503 }),
		request: new Request(url),
		parent: async () => ({ siteTags: null }),
		cookies: { get: () => undefined, set: () => {}, delete: () => {} }
	});
}

/** JSON de lo que sea (Map, Set, ciclos), para buscar texto adentro. @param {unknown} value */
function text(value) {
	const seen = new WeakSet();
	return JSON.stringify(value, (_k, v) => {
		if (v instanceof Map) return Object.fromEntries(v);
		if (v instanceof Set) return [...v];
		if (typeof v === 'object' && v !== null) {
			if (seen.has(v)) return undefined;
			seen.add(v);
		}
		return v;
	});
}

/** @param {Promise<{ load: Function }>} mod @param {any} event */
const load = async (mod, event) => text(await (await mod).load(event));
/** @param {Promise<{ GET: Function }>} mod @param {any} event */
const get = async (mod, event) => {
	const res = /** @type {Response} */ (await (await mod).GET(event));
	// las líneas largas del .ics se pliegan: se despliegan para buscar
	return (await res.text()).replace(/\r\n[ \t]/g, '');
};

/**
 * Lo que da `fn` el 15 de marzo de 2099, cuando los eventos plantados (del 1 de ese mes) ya pasaron:
 * para las salidas de los eventos pasados de un mes (/calendario). Solo cambia la fecha.
 * @template T @param {() => Promise<T>} fn
 */
async function whenPlantedEventsArePast(fn) {
	vi.useFakeTimers({ now: Date.parse('2099-03-15T12:00:00-03:00'), toFake: ['Date'] });
	try {
		return await fn();
	} finally {
		vi.useRealTimers();
	}
}

/** Los feeds Atom y JSON (imports fijos: Vite no resuelve `[term]` en un import armado). */
const FEEDS = {
	atom: {
		calendario: () => import('./(content)/calendario/feed.atom/+server.js'),
		material: () => import('./(content)/material/feed.atom/+server.js'),
		wiki: () => import('./(content)/wiki/[term]/feed.atom/+server.js')
	},
	json: {
		calendario: () => import('./(content)/calendario/feed.json/+server.js'),
		material: () => import('./(content)/material/feed.json/+server.js'),
		wiki: () => import('./(content)/wiki/[term]/feed.json/+server.js')
	}
};

/**
 * Lo que lista cosas: `[nombre, cómo se pide (como texto), qué controles públicos tiene que
 * mostrar]`. Los controles prueban que la salida no pasa por no mostrar nada.
 *
 * @type {Array<[string, () => Promise<string>, string[]]>}
 */
const LIST_OUTPUTS = [
	['/ (inicio)', () => load(import('./(content)/+page.server.js'), anonEvent()), ['evento']],
	[
		'/calendario',
		() =>
			load(import('./(content)/calendario/+page.server.js'), anonEvent({ path: '/calendario' })),
		['evento']
	],
	[
		'/calendario?viewdate=2099-03 (los pasados de ese mes)',
		() =>
			whenPlantedEventsArePast(() =>
				load(
					import('./(content)/calendario/+page.server.js'),
					anonEvent({ path: '/calendario?viewdate=2099-03' })
				)
			),
		['evento']
	],
	[
		'/api/calendario/pasados?mes=2099-03',
		() =>
			whenPlantedEventsArePast(() =>
				get(
					import('./api/calendario/pasados/+server.js'),
					anonEvent({ path: '/api/calendario/pasados?mes=2099-03' })
				)
			),
		['evento']
	],
	[
		'/api/calendario/pasados?mes=2099-03&enteros=1 (la lista con «Mostrar eventos pasados»)',
		() =>
			whenPlantedEventsArePast(() =>
				get(
					import('./api/calendario/pasados/+server.js'),
					anonEvent({ path: '/api/calendario/pasados?mes=2099-03&enteros=1' })
				)
			),
		['evento']
	],
	[
		'/material',
		() => load(import('./(content)/material/+page.server.js'), anonEvent({ path: '/material' })),
		['material']
	],
	[
		'/amigues',
		() => load(import('./(content)/amigues/+page.server.js'), anonEvent({ path: '/amigues' })),
		['perfil-persona', 'perfil-proyecto', 'perfil-lugar']
	],
	[
		'/todo',
		() => load(import('./(content)/todo/+page.server.js'), anonEvent({ path: '/todo' })),
		['evento']
	],
	[
		'/wiki',
		() => load(import('./(content)/wiki/+page.server.js'), anonEvent({ path: '/wiki' })),
		[]
	],
	[
		'layout (glosario y etiquetas de cada página)',
		() => load(import('./+layout.server.js'), anonEvent()),
		['etiqueta']
	],
	[
		`/wiki/${PUBLIC_SERIES_SLUG}`,
		() =>
			load(
				import('./(content)/wiki/[term]/+page.server.js'),
				anonEvent({ params: { term: PUBLIC_SERIES_SLUG } })
			),
		['evento']
	],
	[
		'/sitemap.xml',
		() => get(import('./(content)/sitemap.xml/+server.js'), anonEvent()),
		['evento', 'material', 'perfil-persona', 'etiqueta']
	],
	['/rss', () => get(import('./rss/+server.js'), anonEvent()), ['evento', 'material']],
	.../** @type {const} */ (['atom', 'json']).flatMap((format) => [
		/** @type {[string, () => Promise<string>, string[]]} */ ([
			`/calendario/feed.${format}`,
			() => get(FEEDS[format].calendario(), anonEvent()),
			['evento']
		]),
		/** @type {[string, () => Promise<string>, string[]]} */ ([
			`/material/feed.${format}`,
			() => get(FEEDS[format].material(), anonEvent()),
			['material']
		]),
		/** @type {[string, () => Promise<string>, string[]]} */ ([
			`/wiki/${PUBLIC_SERIES_SLUG}/feed.${format}`,
			() => get(FEEDS[format].wiki(), anonEvent({ params: { term: PUBLIC_SERIES_SLUG } })),
			['evento']
		])
	]),
	[
		// Lo que dibujan las imágenes `/og/<tarjeta>/<hash>.jpg` (las portadas de los eventos).
		'/og (imágenes para compartir del sitio)',
		async () =>
			text(await (await import('$lib/server/linkPreview.js')).linkPreviewState(t.platform)),
		['imagen']
	],
	[
		'/calendario.ics',
		() => get(import('./(content)/calendario.ics/+server.js'), anonEvent()),
		['evento']
	],
	[
		`/ics/etiqueta/${PUBLIC_SERIES_SLUG}.ics`,
		() =>
			get(
				import('./ics/etiqueta/[tag].ics/+server.js'),
				anonEvent({ params: { tag: PUBLIC_SERIES_SLUG } })
			),
		['evento']
	],
	[
		'/api/posts',
		() => get(import('./api/posts/+server.js'), anonEvent()),
		['evento', 'material', 'imagen']
	],
	[
		'/api/search-index.json',
		() => get(import('./api/search-index.json/+server.js'), anonEvent()),
		['evento', 'material', 'perfil-persona', 'etiqueta']
	],
	[
		`/api/series/${PUBLIC_SERIES_SLUG}`,
		() =>
			get(
				import('./api/series/[tag]/+server.js'),
				anonEvent({ params: { tag: PUBLIC_SERIES_SLUG } })
			),
		['evento']
	]
];

/**
 * La dirección de un objeto: `[nombre, cómo se pide]`. Si quien mira no lo puede ver, 404 (o, en
 * una etiqueta, una página sin nada de ella).
 *
 * @typedef {Array<[string, (p: Pick<Planted, 'slug'>) => Promise<string>]>} Direct
 */

/** @type {Direct} */
const evento = [
	[
		'/calendario/<evento>',
		(p) =>
			load(
				import('./(content)/calendario/[event]/+page.server.js'),
				anonEvent({ params: { event: p.slug } })
			)
	],
	[
		'/calendario/<evento>/compartir (imágenes para compartir)',
		(p) =>
			load(
				import('./(content)/calendario/[event]/compartir/+page.server.js'),
				anonEvent({ params: { event: p.slug } })
			)
	],
	[
		'/calendario/<evento>/entradas',
		(p) =>
			load(
				import('./(content)/calendario/[event]/entradas/+page.server.js'),
				anonEvent({ params: { event: p.slug } })
			)
	]
];
/** @type {Direct} */
const perfil = [
	[
		'/amigues/<perfil>',
		(p) =>
			load(
				import('./(content)/amigues/[profile]/+page.server.js'),
				anonEvent({ params: { profile: p.slug } })
			)
	]
];
/** @type {Direct} */
const etiqueta = [
	[
		'/wiki/<etiqueta>',
		(p) =>
			load(
				import('./(content)/wiki/[term]/+page.server.js'),
				anonEvent({ params: { term: p.slug } })
			)
	],
	.../** @type {const} */ (['atom', 'json']).map(
		(format) =>
			/** @type {[string, (p: Pick<Planted, 'slug'>) => Promise<string>]} */ ([
				`/wiki/<etiqueta>/feed.${format}`,
				(p) => get(FEEDS[format].wiki(), anonEvent({ params: { term: p.slug } }))
			])
	),
	[
		'/ics/etiqueta/<etiqueta>.ics',
		(p) =>
			get(import('./ics/etiqueta/[tag].ics/+server.js'), anonEvent({ params: { tag: p.slug } }))
	],
	[
		'/api/series/<etiqueta>',
		(p) => get(import('./api/series/[tag]/+server.js'), anonEvent({ params: { tag: p.slug } }))
	]
];
/** @type {Direct} */
const media = [
	[
		'/media/<clave>',
		(p) => get(import('./media/[...key]/+server.js'), anonEvent({ params: { key: p.slug } }))
	]
];
/** Por tipo. @type {Record<string, Direct>} */
const DIRECT_OUTPUTS = {
	evento,
	material: [
		[
			'/material/<material>',
			(p) =>
				load(
					import('./(content)/material/[post]/+page.server.js'),
					anonEvent({ params: { post: p.slug } })
				)
		]
	],
	'perfil-persona': perfil,
	'perfil-proyecto': perfil,
	'perfil-lugar': perfil,
	etiqueta,
	serie: etiqueta,
	imagen: media,
	archivo: media
};

/**
 * Pide una dirección: el texto, o el estado si tira un error de SvelteKit (404, redirección).
 *
 * @param {() => Promise<string>} fn
 * @returns {Promise<{ status: number, body: string }>}
 */
async function attempt(fn) {
	try {
		return { status: 200, body: await fn() };
	} catch (e) {
		const status = /** @type {any} */ (e)?.status;
		if (typeof status === 'number') return { status, body: text(/** @type {any} */ (e).body) };
		throw e;
	}
}

// ---------------------------------------------------------------------------------------------

/** @type {Map<string, string>} */
const outputs = new Map();
/** Las mismas salidas, con lo público que apunta a lo privado. @type {Map<string, string>} */
const linkedOutputs = new Map();

beforeAll(async () => {
	t = await createTestDB();
	await plantTags();
	await plantContent('evento');
	await plantContent('material');
	await plantProfiles();
	await plantMedia();
	await plantVenues();
	await plantPeople();
	await fresh();
	for (const [name, fn] of LIST_OUTPUTS) outputs.set(name, await fn());
	// Después, lo público que apunta a lo privado (sus salidas, aparte).
	await plantLinks();
	await fresh();
	for (const [name, fn] of LIST_OUTPUTS) linkedOutputs.set(name, await fn());
});

/** Que las listas recordadas se vuelvan a armar. */
async function fresh() {
	(await import('$lib/server/contenido/posts.js')).clearContentCache();
	(await import('$lib/server/etiquetas/source.js')).clearTagSourceCache();
	(await import('$lib/server/linkPreview.js')).clearLinkPreviewCache();
}
afterAll(async () => {
	await t?.dispose();
});

describe('lo privado no sale en ninguna lista ni feed', () => {
	it.each(LIST_OUTPUTS.map(([name, , expected]) => [name, expected]))(
		'%s muestra lo público (control)',
		(name, expected) => {
			const out = String(outputs.get(/** @type {string} */ (name))).toLowerCase();
			for (const type of /** @type {string[]} */ (expected)) {
				const ok = controls.filter((c) => c.type === type);
				expect(ok.length, type).toBeGreaterThan(0);
				expect(
					ok.some((c) => c.secrets.some((s) => out.includes(s.toLowerCase()))),
					`${name}: ${type} público`
				).toBe(true);
			}
		}
	);

	it.each(LIST_OUTPUTS.map(([name]) => [name]))('%s no muestra nada privado', (name) => {
		const out = String(outputs.get(name)).toLowerCase();
		const found = planted.flatMap((p) =>
			p.secrets
				.filter((s) => out.includes(s.toLowerCase()))
				.map((s) => `${p.type} ${p.level}: ${s}`)
		);
		expect(found, name).toEqual([]);
	});
});

describe('la dirección de algo privado no lo muestra', () => {
	const cases = () =>
		planted.flatMap((p) => (DIRECT_OUTPUTS[p.type] ?? []).map(([name, fn]) => ({ p, name, fn })));

	it('cada tipo plantado tiene sus direcciones', () => {
		for (const p of [...planted, ...controls]) {
			expect(DIRECT_OUTPUTS[p.type], p.type).toBeDefined();
		}
	});

	it('lo público se abre (control)', async () => {
		for (const p of controls) {
			for (const [name, fn] of DIRECT_OUTPUTS[p.type]) {
				// Los eventos de prueba no venden entradas: su página de compra da 404 aunque se vean.
				if (name.endsWith('/entradas')) continue;
				// Una etiqueta sin eventos no tiene .ics ni datos de serie (404 aunque se vea).
				if (p.type === 'etiqueta' && name !== '/wiki/<etiqueta>') continue;
				const r = await attempt(() => fn(p));
				expect(r.status, `${name} ${p.type} ${p.level}`).toBe(200);
				if (p.type !== 'imagen') {
					expect(
						p.secrets.some((s) => r.body.toLowerCase().includes(s.toLowerCase())),
						`${name} ${p.type} ${p.level}: muestra su contenido`
					).toBe(true);
				}
			}
		}
	});

	it('lo oculto, solo con cuenta, borrado o sin aprobar: 404 y nada de su contenido', async () => {
		const problems = [];
		for (const { p, name, fn } of cases()) {
			const r = await attempt(() => fn(p));
			const leaked = p.secrets.filter(
				(s) =>
					r.body.toLowerCase().includes(s.toLowerCase()) &&
					// la dirección pedida puede volver tal cual en el mensaje de error
					!(r.status === 404 && s === p.slug)
			);
			if (!p.direct && p.type !== 'etiqueta' && p.type !== 'serie' && r.status !== 404) {
				problems.push(`${name} ${p.type} ${p.level}: ${r.status}`);
			}
			if (!p.direct && leaked.length) problems.push(`${name} ${p.type} ${p.level}: ${leaked}`);
		}
		expect(problems).toEqual([]);
	});

	it('lo no listado se abre con su dirección', async () => {
		for (const p of planted.filter((x) => x.level === 'no-listado')) {
			for (const [name, fn] of DIRECT_OUTPUTS[p.type]) {
				if (name.endsWith('/entradas')) continue;
				expect((await attempt(() => fn(p))).status, `${name} ${p.type}`).toBe(200);
			}
		}
	});
});

describe('la dirección de un lugar, en cada nivel', () => {
	/** @param {typeof VENUE_LEVELS[number]} level */
	const allowed = (level) => ({
		name: level === 'public' || level === 'name',
		address: level === 'public' || level === 'address',
		area: level === 'public' || level === 'address' || level === 'area',
		details: level === 'public'
	});

	/**
	 * Lo que muestran del evento: su página, su imagen para compartir, su entrada en /api/posts y
	 * en el .ics.
	 * @param {string} event
	 */
	async function eventOutputs(event) {
		/** @type {Record<string, string>} */
		const out = {};
		const params = { event };
		// Sin «Más cosas de…» (otros eventos, con sus propios lugares).
		const page = /** @type {Record<string, unknown>} */ ({
			...(await (
				await import('./(content)/calendario/[event]/+page.server.js')
			).load(anonEvent({ params })))
		});
		delete page.relatedPosts;
		out['/calendario/<evento>'] = text(page).toLowerCase();
		out['/calendario/<evento>/compartir'] = (
			await load(
				import('./(content)/calendario/[event]/compartir/+page.server.js'),
				anonEvent({ params })
			)
		).toLowerCase();
		const posts = JSON.parse(/** @type {string} */ (outputs.get('/api/posts')));
		out['/api/posts'] = text(
			posts.find((/** @type {any} */ x) => x.meta.postID === event) ?? null
		).toLowerCase();
		const ics = String(outputs.get('/calendario.ics')).toLowerCase();
		out['/calendario.ics'] =
			ics.split('begin:vevent').find((b) => b.includes(`/calendario/${event}`)) ?? '';
		expect(out['/api/posts'], `${event} en /api/posts`).not.toBe('null');
		expect(out['/calendario.ics'], `${event} en el .ics`).not.toBe('');
		return out;
	}

	it.each(VENUE_LEVELS.map((l) => [l]))('nivel del lugar «%s»', async (level) => {
		const c = /** @type {typeof venueCases[number]} */ (
			venueCases.find((x) => x.from === 'lugar' && x.level === level)
		);
		const ok = allowed(c.level);
		const v = c.venue;
		const lower = (/** @type {string} */ s) => s.toLowerCase();
		// En ninguna salida (tampoco en la página del lugar ni en el buscador).
		/** @type {string[]} */
		const never = [];
		if (!ok.address) never.push(v.address, v.lat, v.lng);
		if (!ok.area) never.push(v.area);
		if (!ok.details) never.push(v.howTo, v.access);
		const everywhere = [...outputs.entries()].map(([k, o]) => [k, o.toLowerCase()]);
		const page = (await perfil[0][1]({ slug: c.venueSlug })).toLowerCase();
		everywhere.push([`/amigues/${c.venueSlug}`, page]);
		for (const [name, out] of Object.entries(await eventOutputs(c.event))) {
			everywhere.push([name, out]);
			// En lo del evento, el nombre solo si el nivel lo deja.
			if (!ok.name) expect(out, `${name}: nombre`).not.toContain(lower(v.name));
		}
		for (const [name, out] of everywhere) {
			for (const s of never) expect(out, `${name}: ${s}`).not.toContain(lower(s));
		}
		// La página del lugar muestra siempre su nombre: en «Sólo dirección», sin la dirección.
		if (level === 'address') expect(page).not.toContain(lower(v.address));
		// El buscador nunca lleva la calle.
		expect(String(outputs.get('/api/search-index.json')).toLowerCase()).not.toContain(
			lower(v.address)
		);
	});

	it.each(VENUE_LEVELS.map((l) => [l]))('nivel propio del evento «%s»', async (level) => {
		const c = /** @type {typeof venueCases[number]} */ (
			venueCases.find((x) => x.from === 'evento' && x.level === level)
		);
		const ok = allowed(c.level);
		const v = c.venue;
		const lower = (/** @type {string} */ s) => s.toLowerCase();
		for (const [name, out] of Object.entries(await eventOutputs(c.event))) {
			if (!ok.name) expect(out, `${name}: nombre`).not.toContain(lower(v.name));
			if (!ok.address) {
				for (const s of [v.address, v.lat, v.lng])
					expect(out, `${name}: ${s}`).not.toContain(lower(s));
			}
			if (!ok.area) expect(out, `${name}: barrio`).not.toContain(lower(v.area));
			if (!ok.details) {
				for (const s of [v.howTo, v.access]) expect(out, `${name}: ${s}`).not.toContain(lower(s));
			}
		}
	});
});

describe('lo público que apunta a lo privado', () => {
	/** Las salidas (listas y las páginas de lo público que apunta a lo privado), en minúsculas. */
	async function all() {
		const out = [...linkedOutputs.entries()].map(([k, o]) => [k, o.toLowerCase()]);
		for (const p of linked) {
			for (const [name, fn] of DIRECT_OUTPUTS[p.type]) {
				if (name.endsWith('/entradas')) continue;
				out.push([`${name} ${p.slug}`, (await fn(p)).toLowerCase()]);
			}
		}
		return out;
	}

	/** @param {string[][]} out @param {(p: Planted) => string[]} pick */
	const found = (out, pick) =>
		out.flatMap(([name, o]) =>
			planted.flatMap((p) =>
				pick(p)
					.filter((s) => o.includes(s.toLowerCase()))
					.map((s) => `${name}: ${p.type} ${p.level}: ${s}`)
			)
		);

	it('lo público se ve, sin nombres ni textos de lo privado', async () => {
		const out = await all();
		for (const p of linked) {
			expect(
				out.some(([name, o]) => name.startsWith('/api/posts') && o.includes(p.slug)),
				p.slug
			).toBe(true);
		}
		const names = (/** @type {Planted} */ p) =>
			p.secrets.filter((s) => s !== p.slug && !(p.keys ?? []).includes(s));
		expect(found(out, names)).toEqual([]);
	});

	// La metadata pública solo lleva vínculos a lo que ve cualquiera
	// (src/lib/server/contenido/vinculosPublicos.js).
	it('vínculos: direcciones', async () => {
		const keys = (/** @type {Planted} */ p) => [p.slug, ...(p.keys ?? [])];
		expect(found(await all(), keys)).toEqual([]);
	});
});

describe('los datos de las personas no salen', () => {
	it('ni en las listas ni en las páginas de lo público', async () => {
		expect(personalSecrets.length).toBeGreaterThan(0);
		const out = [...outputs.entries(), ...linkedOutputs.entries()];
		for (const p of controls) {
			for (const [name, fn] of DIRECT_OUTPUTS[p.type]) {
				const r = await attempt(() => fn(p));
				out.push([`${name} ${p.slug}`, r.body]);
			}
		}
		const found = out.flatMap(([name, o]) =>
			personalSecrets
				.filter((s) => o.toLowerCase().includes(s.toLowerCase()))
				.map((s) => `${name}: ${s}`)
		);
		expect(found).toEqual([]);
	});

	it('el total de propinas del Fondo pide su secreto', async () => {
		const { GET } = await import('./api/fondo/propinas-total/+server.js');
		const res = /** @type {Response} */ (
			await GET(anonEvent({ path: '/api/fondo/propinas-total?mes=2026-09' }))
		);
		expect(res.status).toBe(401);
	});

	it('la biblioteca (/imagenes) no se abre sin cuenta', async () => {
		const { GET } = await import('./imagenes/+server.js');
		const r = await attempt(async () => {
			const res = /** @type {Response} */ (await GET(anonEvent({ path: '/imagenes' })));
			return `${res.status} ${await res.text()}`;
		});
		expect(r.status).toBe(404);
	});
});
