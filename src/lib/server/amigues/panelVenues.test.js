/**
 * El lugar vinculado en el panel: el encabezado de la ficha del evento (`panelVenueRow`) y las
 * listas (`panelEventVenuesStatement`, una sentencia para todos) leen el nombre, el barrio y la
 * ciudad del lugar, para que el lugar mande sobre el «Dónde» en texto libre (`panelPlaceText`).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { makeEvent, makeProfile } from './testing.js';
import { panelEventVenuesFrom, panelEventVenuesStatement, setEventVenue } from './venues.js';
import { panelVenueRow } from './eventFormVenue.js';
import { panelPlaceText } from '$lib/admin/eventFormat.js';

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

const CON_LUGAR = 'evento-inventado-con-lugar-2031-11';
const SIN_LUGAR = 'evento-inventado-sin-lugar-2031-11';
const BORRADO = 'evento-inventado-lugar-borrado-2031-11';

async function seed() {
	const v = await makeProfile(t.db, {
		title: 'Sala Inventada',
		kind: 'lugar',
		// «Sólo Nombre»: la página pública no muestra la dirección; el panel igual ve el lugar.
		data: {
			address: 'Calle Falsa 123',
			area: 'Barrio Ficticio',
			city: 'CABA',
			venue_privacy: 'name'
		}
	});
	const otro = await makeProfile(t.db, {
		title: 'Otra Sala Inventada',
		kind: 'lugar',
		data: { address: 'Calle 2', venue_privacy: 'public' }
	});
	for (const slug of [CON_LUGAR, SIN_LUGAR, BORRADO]) await makeEvent(t.db, slug);
	await setEventVenue(t.db, { eventSlug: CON_LUGAR, venueId: v.id, privacy: null, by: 'otre' });
	await setEventVenue(t.db, { eventSlug: BORRADO, venueId: otro.id, privacy: null, by: 'otre' });
	await t.db
		.prepare('UPDATE objects SET deleted_at = 1, version = version + 1 WHERE id = ?1')
		.bind(otro.id)
		.run();
	return v;
}

describe('lugar vinculado en el panel', () => {
	it('la ficha lee el nombre, el barrio y la ciudad; el lugar manda sobre el texto libre', async () => {
		await seed();
		const venue = await panelVenueRow(t.db, CON_LUGAR);
		expect(venue).toMatchObject({ title: 'Sala Inventada', area: 'Barrio Ficticio', city: 'CABA' });
		const leftover = { locationName: 'Zona Inventada, CABA', location: 'AMBA' };
		expect(panelPlaceText(leftover, venue)).toBe('Sala Inventada, Barrio Ficticio');
		// Sin lugar, el texto libre como siempre.
		expect(await panelVenueRow(t.db, SIN_LUGAR)).toBeNull();
		expect(panelPlaceText(leftover, null)).toBe('Zona Inventada, CABA, AMBA');
	});

	it('las listas leen los lugares de todos los eventos en una sentencia (sin los borrados)', async () => {
		await seed();
		const statement = panelEventVenuesStatement(t.db, [CON_LUGAR, SIN_LUGAR, BORRADO, CON_LUGAR]);
		expect(statement).not.toBeNull();
		const { results } = await /** @type {any} */ (statement).all();
		const venues = panelEventVenuesFrom(results);
		expect([...venues.keys()]).toEqual([CON_LUGAR]);
		expect(venues.get(CON_LUGAR)).toEqual({
			title: 'Sala Inventada',
			area: 'Barrio Ficticio',
			city: 'CABA'
		});
		// Sin eventos (o con direcciones inválidas), ni va a la base.
		expect(panelEventVenuesStatement(t.db, [])).toBeNull();
		expect(panelEventVenuesStatement(t.db, ['no vale'])).toBeNull();
	});
});
