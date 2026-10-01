/**
 * Lugares y eventos: lo que muestra un evento en cada nivel de privacidad (del lugar y del
 * evento), qué eventos lista la página del lugar, y que quien compró recibe la dirección completa
 * en todos los niveles. D1 de miniflare; lugares inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ANON } from '$lib/server/objects/index.js';
import { saveObject } from '../objects/save.js';
import { makeProfile } from './testing.js';

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

/** Los módulos con el interruptor `perfiles_publicos` como se pida. */
async function modules(flag = '1') {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { PERFILES_PUBLICOS_ENABLED: flag } }));
	return import('./venues.js');
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

	it('con el interruptor apagado o sin lugar, nada (se usa lo del .md, como siempre)', async () => {
		const on = await modules('1');
		const v = await venue('hidden');
		await on.setEventVenue(t.db, { eventSlug: 'apagado', venueId: v.id, privacy: null, by: 'a' });
		expect(await on.buyerLocation(t.db, 'sin-lugar')).toBeNull();
		const off = await modules('0');
		expect(await off.buyerLocation(t.db, 'apagado')).toBeNull();
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

	it('con el interruptor apagado o sin base, vacío (se usa lo del .md)', async () => {
		const on = await modules('1');
		const v = await venue('hidden');
		await on.setEventVenue(t.db, { eventSlug: 'ics-off', venueId: v.id, privacy: null, by: 'a' });
		expect((await on.feedVenues(null, ['ics-off'])).size).toBe(0);
		const off = await modules('0');
		expect((await off.feedVenues(t.db, ['ics-off'])).size).toBe(0);
	});
});
