/**
 * Lugares y eventos: lo que muestra un evento en cada nivel de privacidad (del lugar y del
 * evento), qué eventos lista la página del lugar, y que quien compró recibe la dirección completa
 * en todos los niveles. D1 de miniflare; lugares inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ANON } from '$lib/server/objects/index.js';
import { saveObject } from '../objects/save.js';
import { makeEvent, makeProfile } from './testing.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

/**
 * Los módulos, recién cargados. «Sucede en» es un edge del
 * evento, así que el evento tiene que estar en la base: `setEventVenue` de acá lo crea antes si
 * falta (con una dirección válida; las inválidas siguen sin poder vincularse).
 */
async function modules() {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));
	const m = await import('./venues.js');
	return {
		...m,
		/** @type {typeof m.setEventVenue} */
		async setEventVenue(db, input) {
			await makeEvent(db, input.eventSlug);
			return m.setEventVenue(db, input);
		}
	};
}

const SECRET = 'Calle Secreta 742';
const AREA = 'Barrio Escondido';

/** @param {string} privacy @param {string} [title] */
async function venue(privacy, title = `Lugar ${privacy}`) {
	return makeProfile(t.db, {
		title,
		kind: 'lugar',
		data: {
			address: SECRET,
			area: AREA,
			city: 'Ciudad Inventada',
			lat: -34.6,
			lng: -58.4,
			how_to_get_there: 'Por la puerta verde',
			venue_privacy: privacy
		}
	});
}

describe('el evento muestra lo que su nivel deja', () => {
	it('los cinco niveles del lugar, sin cambio en el evento', async () => {
		const m = await modules();
		for (const [privacy, expected] of /** @type {const} */ ([
			['public', { level: 'public', address: SECRET, area: AREA }],
			['name', { level: 'name', name: 'Lugar name' }],
			['address', { level: 'address', address: SECRET, area: AREA, lat: -34.6, lng: -58.4 }],
			['area', { level: 'area', area: AREA }],
			['hidden', { level: 'hidden' }]
		])) {
			const v = await venue(privacy);
			const slug = `evento-${privacy}`;
			expect(
				(await m.setEventVenue(t.db, { eventSlug: slug, venueId: v.id, privacy: null, by: 'a' })).ok
			).toBe(true);
			const view = await m.publicVenueForEvent(t.db, slug, ANON);
			expect(view).toMatchObject(expected);
			const json = JSON.stringify(view);
			if (privacy !== 'public' && privacy !== 'address') expect(json).not.toContain(SECRET);
			// «Sólo dirección»: ni el nombre, ni el link, ni "cómo llegar" (puede nombrarlo).
			if (privacy === 'address') expect(json).not.toMatch(/Lugar|amigues|puerta verde/);
			if (privacy === 'name' || privacy === 'hidden') expect(json).not.toContain(AREA);
			if (privacy === 'area' || privacy === 'hidden') expect(json).not.toContain('Lugar');
		}
	});

	it('el evento manda sobre el lugar (más y menos privado)', async () => {
		const m = await modules();
		const pub = await venue('public');
		await m.setEventVenue(t.db, {
			eventSlug: 'secreto',
			venueId: pub.id,
			privacy: 'hidden',
			by: 'a'
		});
		expect(await m.publicVenueForEvent(t.db, 'secreto', ANON)).toEqual({ level: 'hidden' });
		const hidden = await venue('hidden');
		await m.setEventVenue(t.db, {
			eventSlug: 'abierto',
			venueId: hidden.id,
			privacy: 'public',
			by: 'a'
		});
		expect(await m.publicVenueForEvent(t.db, 'abierto', ANON)).toMatchObject({ address: SECRET });
	});

	it('un lugar oculto o sin aprobar cuenta como oculto; uno borrado, como sin lugar', async () => {
		const m = await modules();
		const hiddenProfile = await makeProfile(t.db, {
			title: 'Lugar Oculto',
			kind: 'lugar',
			visibility: 'hidden',
			data: { address: SECRET, venue_privacy: 'public' }
		});
		await m.setEventVenue(t.db, {
			eventSlug: 'e1',
			venueId: hiddenProfile.id,
			privacy: null,
			by: 'a'
		});
		expect(await m.publicVenueForEvent(t.db, 'e1', ANON)).toEqual({ level: 'hidden' });
		const pending = await makeProfile(t.db, {
			title: 'Lugar Sin Aprobar',
			kind: 'lugar',
			approved: false,
			data: { address: SECRET, venue_privacy: 'public' }
		});
		await m.setEventVenue(t.db, { eventSlug: 'e2', venueId: pending.id, privacy: null, by: 'a' });
		expect(await m.publicVenueForEvent(t.db, 'e2', ANON)).toEqual({ level: 'hidden' });
		const gone = await venue('public');
		await m.setEventVenue(t.db, { eventSlug: 'e3', venueId: gone.id, privacy: null, by: 'a' });
		await saveObject(
			t.db,
			{ id: gone.id, type: 'perfil', version: gone.version, deleted: true },
			{ actor: 'a' }
		);
		expect(await m.publicVenueForEvent(t.db, 'e3', ANON)).toBeNull();
		expect(await m.publicVenueForEvent(t.db, 'sin-lugar', ANON)).toBeNull();
	});

	it('solo se vinculan lugares que existen y eventos con dirección válida', async () => {
		const m = await modules();
		const persona = await makeProfile(t.db, { title: 'No Es Lugar' });
		expect(
			(await m.setEventVenue(t.db, { eventSlug: 'x', venueId: persona.id, privacy: null, by: 'a' }))
				.ok
		).toBe(false);
		const v = await venue('public');
		expect(
			(await m.setEventVenue(t.db, { eventSlug: '../x', venueId: v.id, privacy: null, by: 'a' })).ok
		).toBe(false);
		expect(
			(
				await m.setEventVenue(t.db, {
					eventSlug: 'x',
					venueId: v.id,
					privacy: /** @type {any} */ ('todo'),
					by: 'a'
				})
			).ok
		).toBe(false);
		expect(await m.removeEventVenue(t.db, 'x')).toBe(false);
	});
});

describe('las coordenadas del mapa solo salen si la dirección es pública', () => {
	/** Los niveles que muestran la dirección (y el mapa); en los demás, ni lat ni lng. */
	const WITH_MAP = new Set(['public', 'address']);
	const LEVELS = /** @type {const} */ (['public', 'name', 'address', 'area', 'hidden']);

	it('en los datos de la página del evento, por el nivel del lugar o el del evento', async () => {
		const m = await modules();
		const venues = Object.fromEntries(
			await Promise.all(LEVELS.map(async (p) => [p, await venue(p)]))
		);
		for (const venueLevel of LEVELS) {
			for (const eventLevel of [null, ...LEVELS]) {
				const slug = `mapa-${venueLevel}-${eventLevel ?? 'igual'}`;
				const r = await m.setEventVenue(t.db, {
					eventSlug: slug,
					venueId: venues[venueLevel].id,
					privacy: eventLevel,
					by: 'a'
				});
				expect(r.ok).toBe(true);
				// Lo mismo que carga +page.server.js del evento para quien no tiene cuenta.
				const view = await m.eventPageVenue(t.db, slug, /** @type {App.Locals} */ ({}));
				const level = eventLevel ?? venueLevel;
				expect(view?.level).toBe(level);
				const json = JSON.stringify(view);
				if (WITH_MAP.has(level)) {
					expect(view).toMatchObject({ lat: -34.6, lng: -58.4 });
				} else {
					expect(view).not.toHaveProperty('lat');
					expect(view).not.toHaveProperty('lng');
					expect(json).not.toMatch(/-34\.6|-58\.4/);
				}
			}
		}
	});

	it('en las listas, el .ics y el buscador (withVenuePlaces, feedVenues), nunca', async () => {
		const m = await modules();
		const posts = [];
		for (const level of LEVELS) {
			const v = await venue(level);
			await m.setEventVenue(t.db, {
				eventSlug: `lista-${level}`,
				venueId: v.id,
				privacy: null,
				by: 'a'
			});
			posts.push({ meta: { category: 'calendario', postID: `lista-${level}`, title: level } });
		}
		const out = await m.withVenuePlaces(t.db, posts);
		expect(JSON.stringify(out)).not.toMatch(/-34\.6|-58\.4|"lat"|"lng"/);
		const feed = await m.feedVenues(
			t.db,
			LEVELS.map((l) => `lista-${l}`)
		);
		for (const [slug, view] of feed) {
			if (WITH_MAP.has(view.level)) continue;
			expect(JSON.stringify(view), slug).not.toMatch(/-34\.6|-58\.4/);
		}
	});
});

describe('la página del lugar', () => {
	it('lista solo los eventos que muestran el link al lugar (niveles 1 y 2)', async () => {
		const m = await modules();
		const v = await venue('public');
		for (const [slug, privacy] of /** @type {const} */ ([
			['con-direccion', 'public'],
			['solo-nombre', 'name'],
			['solo-direccion', 'address'],
			['solo-barrio', 'area'],
			['oculto', 'hidden'],
			['como-el-lugar', null]
		])) {
			await m.setEventVenue(t.db, { eventSlug: slug, venueId: v.id, privacy, by: 'a' });
		}
		expect((await m.listedVenueEvents(t.db, v)).sort()).toEqual(
			['como-el-lugar', 'con-direccion', 'solo-nombre'].sort()
		);
		// Con el lugar en "oculta", los que siguen al lugar tampoco.
		const hidden = await venue('hidden');
		await m.setEventVenue(t.db, {
			eventSlug: 'sigue-al-lugar',
			venueId: hidden.id,
			privacy: null,
			by: 'a'
		});
		await m.setEventVenue(t.db, {
			eventSlug: 'abre-el-evento',
			venueId: hidden.id,
			privacy: 'name',
			by: 'a'
		});
		expect(await m.listedVenueEvents(t.db, hidden)).toEqual(['abre-el-evento']);
	});

	it('la ubicación de la página sigue la privacidad del lugar', async () => {
		const m = await modules();
		expect(m.venuePageLocation(await venue('public'), '/x')).toMatchObject({
			address: SECRET,
			lat: -34.6
		});
		expect(JSON.stringify(m.venuePageLocation(await venue('name'), '/x'))).not.toContain(SECRET);
		// La página muestra el nombre del lugar: en «Sólo dirección» no puede mostrar la dirección.
		const address = m.venuePageLocation(await venue('address'), '/x');
		expect(address).toEqual({ level: 'name', name: 'Lugar address', href: '/x' });
		expect(JSON.stringify(address)).not.toContain(SECRET);
		expect(m.venuePageLocation(await venue('area'), '/x')).toEqual({
			level: 'area',
			area: AREA,
			city: 'Ciudad Inventada'
		});
	});
});

describe('quien compró recibe la dirección completa', () => {
	it('en los cinco niveles (también si el evento la oculta)', async () => {
		const m = await modules();
		for (const privacy of ['public', 'name', 'address', 'area', 'hidden']) {
			const v = await venue(privacy);
			await m.setEventVenue(t.db, {
				eventSlug: `compra-${privacy}`,
				venueId: v.id,
				privacy: null,
				by: 'a'
			});
			expect(await m.buyerLocation(t.db, `compra-${privacy}`)).toEqual({
				location_name: `Lugar ${privacy}`,
				location: `${SECRET}, ${AREA}, Ciudad Inventada`
			});
		}
		const v = await venue('public', 'Otro Lugar');
		await m.setEventVenue(t.db, {
			eventSlug: 'override',
			venueId: v.id,
			privacy: 'hidden',
			by: 'a'
		});
		expect((await m.buyerLocation(t.db, 'override'))?.location).toContain(SECRET);
	});

	// Se fue la mitad «con el interruptor apagado» (`perfiles_publicos` quedó fijo).
	it('sin lugar o sin base, nada (se usa lo del .md, como siempre)', async () => {
		const on = await modules();
		const v = await venue('hidden');
		await on.setEventVenue(t.db, { eventSlug: 'con-lugar', venueId: v.id, privacy: null, by: 'a' });
		expect(await on.buyerLocation(t.db, 'sin-lugar')).toBeNull();
		expect(await on.buyerLocation(null, 'con-lugar')).toBeNull();
	});
});

describe('los .ics dinámicos (feedVenues)', () => {
	it('solo los eventos pedidos que tienen lugar, como los ve cualquiera', async () => {
		const m = await modules();
		const { feedLocation } = await import('$lib/utils/icsFeed.js');
		for (const privacy of ['public', 'name', 'address', 'area', 'hidden']) {
			const v = await venue(privacy);
			await m.setEventVenue(t.db, {
				eventSlug: `ics-${privacy}`,
				venueId: v.id,
				privacy: null,
				by: 'a'
			});
		}
		const pedidos = [
			'ics-public',
			'ics-name',
			'ics-address',
			'ics-area',
			'ics-hidden',
			'ics-sin-lugar'
		];
		const venues = await m.feedVenues(t.db, pedidos);
		expect([...venues.keys()].sort()).toEqual([
			'ics-address',
			'ics-area',
			'ics-hidden',
			'ics-name',
			'ics-public'
		]);
		const md = { location: 'Dirección del .md' };
		expect(feedLocation(md, venues.get('ics-public'))).toContain(SECRET);
		expect(feedLocation(md, venues.get('ics-name'))).toBe('Lugar name');
		expect(feedLocation(md, venues.get('ics-address'))).toBe(
			`${SECRET}, ${AREA}, Ciudad Inventada`
		);
		expect(feedLocation(md, venues.get('ics-area'))).toBe(`${AREA}, Ciudad Inventada`);
		expect(feedLocation(md, venues.get('ics-hidden'))).toBeUndefined();
		// sin lugar, lo del .md, como siempre
		expect(feedLocation(md, venues.get('ics-sin-lugar'))).toBe('Dirección del .md');
		// un evento que no se pidió no entra
		expect((await m.feedVenues(t.db, ['ics-name'])).size).toBe(1);
	});

	// Se fue la mitad «con el interruptor apagado» (`perfiles_publicos` quedó fijo).
	it('sin base, vacío (se usa lo del .md)', async () => {
		const on = await modules();
		const v = await venue('hidden');
		await on.setEventVenue(t.db, { eventSlug: 'ics-off', venueId: v.id, privacy: null, by: 'a' });
		expect((await on.feedVenues(null, ['ics-off'])).size).toBe(0);
	});
});

describe('feedVenues lee todos los lugares juntos', () => {
	/**
	 * Un vínculo escrito sin pasar por `setEventVenue` (para casos que no deja crear: un perfil que
	 * no es lugar, una dirección de evento inválida), con saveObject() como cualquier edge.
	 */
	const rawLink = async (/** @type {string} */ slug, /** @type {number} */ venueId) => {
		const id = await makeEvent(t.db, slug, { anySlug: true });
		const row = await t.db.prepare('SELECT version FROM objects WHERE id = ?1').bind(id).first();
		await saveObject(
			t.db,
			{
				id: /** @type {number} */ (id),
				type: 'evento',
				version: Number(row?.version),
				edges: { lugar: [venueId] }
			},
			{ actor: 'a' }
		);
	};

	/**
	 * Lugares en todos los casos: los cinco niveles, el evento que cambia el nivel, oculto, solo
	 * con cuenta, sin aprobar, borrado, un perfil que no es lugar y una dirección inválida.
	 * @param {Awaited<ReturnType<typeof modules>>} m
	 * @returns {Promise<string[]>} las direcciones de los eventos vinculados
	 */
	async function seed(m) {
		/** @type {string[]} */
		const slugs = [];
		const link = async (
			/** @type {string} */ slug,
			/** @type {number} */ venueId,
			/** @type {any} */ privacy = null
		) => {
			const r = await m.setEventVenue(t.db, { eventSlug: slug, venueId, privacy, by: 'a' });
			expect(r.ok, slug).toBe(true);
			slugs.push(slug);
		};
		for (const level of ['public', 'name', 'address', 'area', 'hidden']) {
			const v = await venue(level);
			await link(`${level}-como-el-lugar`, v.id);
			for (const override of ['public', 'name', 'address', 'area', 'hidden']) {
				await link(`${level}-evento-${override}`, v.id, override);
			}
		}
		for (const [title, extra] of /** @type {const} */ ([
			['Lugar Oculto', { visibility: 'hidden' }],
			['Lugar Con Cuenta', { visibility: 'members' }],
			['Lugar Sin Aprobar', { approved: false }]
		])) {
			const v = await makeProfile(t.db, {
				title,
				kind: 'lugar',
				data: { address: SECRET, venue_privacy: 'public' },
				...extra
			});
			await link(`${v.slug}-1`, v.id);
			await link(`${v.slug}-2`, v.id, 'name');
		}
		const gone = await venue('public', 'Lugar Borrado');
		await link('borrado-1', gone.id);
		await saveObject(
			t.db,
			{ id: gone.id, type: 'perfil', version: gone.version, deleted: true },
			{ actor: 'a' }
		);
		const persona = await makeProfile(t.db, { title: 'No Es Lugar' });
		await rawLink('persona-1', persona.id);
		slugs.push('persona-1');
		const ok = await venue('public', 'Lugar Con Dirección Rara');
		await rawLink('dirección inválida', ok.id);
		slugs.push('dirección inválida');
		return slugs;
	}

	/**
	 * Lo que hacía feedVenues antes: recorrer los vínculos y pedir el lugar de cada evento pedido
	 * por separado, como la página del evento (`publicVenueForEvent`).
	 * @param {Awaited<ReturnType<typeof modules>>} m
	 * @param {string[]} slugs
	 */
	async function oneByOne(m, slugs) {
		const want = new Set(slugs);
		const out = new Map();
		for (const r of await m.listEventVenues(t.db)) {
			const slug = r.eventSlug;
			if (!want.has(slug)) continue;
			const view = await m.publicVenueForEvent(t.db, slug, ANON);
			if (view) out.set(slug, view);
		}
		return out;
	}

	it('da lo mismo que pedir el lugar de cada evento por separado', async () => {
		const m = await modules();
		const linked = await seed(m);
		const asked = [...linked, 'sin-lugar', '../no-es-direccion', linked[0]];
		const together = await m.feedVenues(t.db, asked);
		const expected = await oneByOne(m, asked);
		expect(Object.fromEntries(together)).toEqual(Object.fromEntries(expected));
		// La prueba cubre todos los casos (no pasa por dar vacío).
		const levels = new Set([...together.values()].map((v) => v.level));
		expect([...levels].sort()).toEqual(['address', 'area', 'hidden', 'name', 'public']);
		expect(together.size).toBeGreaterThan(30);
		// Solo una parte: lo mismo.
		const some = linked.filter((_, i) => i % 3 === 0);
		expect(Object.fromEntries(await m.feedVenues(t.db, some))).toEqual(
			Object.fromEntries(await oneByOne(m, some))
		);
	});

	it('una sola vuelta a la base, con 5 o con 60 eventos (antes eran 3 consultas por evento)', async () => {
		const { countingDB } = await import('$lib/server/db/testing.js');
		const m = await modules();
		const v = await venue('public');
		const slugs = Array.from({ length: 60 }, (_, i) => `muchos-${i}`);
		for (const slug of slugs) {
			await m.setEventVenue(t.db, { eventSlug: slug, venueId: v.id, privacy: null, by: 'a' });
		}
		const counted = countingDB(t.db);
		const few = await m.feedVenues(counted.db, slugs.slice(0, 5));
		const fewQueries = counted.queries;
		counted.reset();
		const many = await m.feedVenues(counted.db, slugs);
		expect(few.size).toBe(5);
		expect(many.size).toBe(60);
		expect(fewQueries).toBe(1);
		expect(counted.queries).toBe(1);
		// El lugar viaja una vez, no una por evento.
		expect(JSON.stringify(counted.log[0].result).split(SECRET).length - 1).toBe(1);
	});
});

describe('«sucede en» es el edge `lugar` del evento', () => {
	/** @param {string} slug */
	const eventRow = async (slug) =>
		/** @type {any} */ (
			await t.db
				.prepare(
					`SELECT o.id, o.version FROM objects o
					LEFT JOIN content_sources s ON s.object_id = o.id
					WHERE o.type = 'evento' AND coalesce(s.legacy_slug, o.slug) = ?1`
				)
				.bind(slug)
				.first()
		);
	/** @param {number} id */
	const lugarEdges = async (id) =>
		(
			await t.db
				.prepare(`SELECT to_id, data, created_by FROM edges WHERE from_id = ?1 AND kind = 'lugar'`)
				.bind(id)
				.all()
		).results;

	it('vincular guarda un edge con el nivel propio en `data` (o sin `data`), con saveObject y su revisión', async () => {
		const m = await import('./venues.js');
		const v = await venue('name');
		const id = await makeEvent(t.db, 'con-edge');
		expect(
			await m.setEventVenue(t.db, { eventSlug: 'con-edge', venueId: v.id, privacy: null, by: 'a' })
		).toEqual({ ok: true });
		expect(await lugarEdges(Number(id))).toEqual([{ to_id: v.id, data: null, created_by: 'a' }]);
		await m.setEventVenue(t.db, { eventSlug: 'con-edge', venueId: v.id, privacy: 'area', by: 'b' });
		expect(await lugarEdges(Number(id))).toEqual([
			{ to_id: v.id, data: JSON.stringify({ privacy: 'area' }), created_by: 'a' }
		]);
		// Cada cambio es una versión nueva del evento, con su historial; repetir lo mismo no.
		await m.setEventVenue(t.db, { eventSlug: 'con-edge', venueId: v.id, privacy: 'area', by: 'b' });
		expect((await eventRow('con-edge')).version).toBe(3);
		const { listRevisions } = await import('$lib/server/contenido/revisions.js');
		expect(
			(await listRevisions(t.db, Number(id))).map((r) => [r.version, r.source, r.savedBy])
		).toEqual([
			[3, 'lugar', 'b'],
			[2, 'lugar', 'a']
		]);
		expect(await m.removeEventVenue(t.db, 'con-edge', { by: 'c' })).toBe(true);
		expect(await lugarEdges(Number(id))).toEqual([]);
		expect(await m.removeEventVenue(t.db, 'con-edge', { by: 'c' })).toBe(false);
	});

	it('nada de `event_venues`: ni se escribe ni se lee', async () => {
		const m = await import('./venues.js');
		const v = await venue('public');
		await makeEvent(t.db, 'sin-tabla');
		await m.setEventVenue(t.db, { eventSlug: 'sin-tabla', venueId: v.id, privacy: null, by: 'a' });
		const { results } = await t.db.prepare('SELECT count(*) AS n FROM event_venues').all();
		expect(results[0].n).toBe(0);
		// Una fila vieja en la tabla no cuenta para nada.
		await makeEvent(t.db, 'fila-vieja');
		await t.db
			.prepare(
				`INSERT INTO event_venues (event_slug, venue_id, privacy, created_at, created_by, updated_at, updated_by)
				VALUES ('fila-vieja', ?1, NULL, 1, 'a', 1, 'a')`
			)
			.bind(v.id)
			.run();
		expect(await m.eventVenue(t.db, 'fila-vieja')).toBeNull();
		expect((await m.listEventVenues(t.db)).map((l) => l.eventSlug)).toEqual(['sin-tabla']);
	});

	it('eventsWithVenue: los eventos que encuentra eventVenue, de una vez o de a uno', async () => {
		const m = await modules();
		const v = await venue('hidden');
		await m.setEventVenue(t.db, { eventSlug: 'con-lugar', venueId: v.id, privacy: null, by: 'a' });
		const gone = await venue('public', 'Lugar Borrado');
		await m.setEventVenue(t.db, {
			eventSlug: 'lugar-borrado',
			venueId: gone.id,
			privacy: null,
			by: 'a'
		});
		await t.db.prepare('UPDATE objects SET deleted_at = 1, version = version + 1 WHERE id = ?1').bind(gone.id).run();
		await makeEvent(t.db, 'sin-lugar');
		expect([...(await m.eventsWithVenue(t.db))]).toEqual(['con-lugar']);
		expect([...(await m.eventsWithVenue(t.db, 'con-lugar'))]).toEqual(['con-lugar']);
		expect((await m.eventsWithVenue(t.db, 'sin-lugar')).size).toBe(0);
		expect(await m.eventVenue(t.db, 'lugar-borrado')).toBeNull();
		expect((await m.eventsWithVenue(t.db, 'lugar-borrado')).size).toBe(0);
	});

	it('un evento que no está en la base no se puede vincular (lo dice)', async () => {
		const m = await import('./venues.js');
		const v = await venue('public');
		expect(
			await m.setEventVenue(t.db, { eventSlug: 'solo-md', venueId: v.id, privacy: null, by: 'a' })
		).toEqual({ ok: false, message: m.NOT_IN_DB });
		expect(await m.eventVenue(t.db, 'solo-md')).toBeNull();
	});

	it('un evento importado se busca por la dirección de su .md, y sigue contando como no editado', async () => {
		const m = await import('./venues.js');
		const v = await venue('public');
		const id = await makeEvent(t.db, 'Evento_Viejo-BDSM');
		await m.setEventVenue(t.db, {
			eventSlug: 'Evento_Viejo-BDSM',
			venueId: v.id,
			privacy: 'name',
			by: 'a'
		});
		expect((await m.eventVenue(t.db, 'Evento_Viejo-BDSM'))?.override).toBe('name');
		const src = /** @type {any} */ (
			await t.db
				.prepare(
					`SELECT s.imported_version, o.version FROM content_sources s
					JOIN objects o ON o.id = s.object_id WHERE s.object_id = ?1`
				)
				.bind(id)
				.first()
		);
		expect(src).toEqual({ imported_version: 2, version: 2 });
	});

	it('la marca de los vínculos cambia al vincular, cambiar el nivel o sacarlo', async () => {
		const m = await import('./venues.js');
		const v = await venue('public');
		await makeEvent(t.db, 'marca');
		const stamps = [await m.eventVenuesStamp(t.db)];
		await m.setEventVenue(t.db, { eventSlug: 'marca', venueId: v.id, privacy: 'name', by: 'a' });
		stamps.push(await m.eventVenuesStamp(t.db));
		// 'name' → 'area': mismo largo, igual cambia.
		await m.setEventVenue(t.db, { eventSlug: 'marca', venueId: v.id, privacy: 'area', by: 'a' });
		stamps.push(await m.eventVenuesStamp(t.db));
		await m.removeEventVenue(t.db, 'marca');
		stamps.push(await m.eventVenuesStamp(t.db));
		// Cada cambio, una marca distinta de la anterior (sin vínculos, la misma que sin vínculos).
		for (let i = 1; i < stamps.length; i++) expect(stamps[i], String(i)).not.toBe(stamps[i - 1]);
		expect(stamps[3]).toBe(stamps[0]);
	});
});
