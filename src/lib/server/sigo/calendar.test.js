/**
 * «Lo que sigo» en el calendario personal: qué eventos suma `calendarSlugs` (mis entradas, donde
 * participo y lo seguido con «en mi calendario»), y que con el interruptor apagado queda como
 * antes. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { addManager, makeAccount, makeEvent, makeProfile } from '$lib/server/amigues/testing.js';
import { setEventVenue } from '$lib/server/amigues/venues.js';
import tagsFactory from '$lib/utils/tags';
import { follow, setCalendarPrefs, setFollowOptions } from './follows.js';
import { calendarSlugs } from './calendar.js';

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

const tags = tagsFactory();
const OFF = { calendario: false, mail_nuevo: true, recordatorio: false };

/** @param {string} slug @param {Record<string, any>} [meta] */
const ev = (slug, meta = {}) => ({
	meta: { postID: slug, category: 'calendario', tags: [], ...meta }
});

describe('calendarSlugs', () => {
	it('apagado: nada de lo seguido', async () => {
		const a = await makeAccount(t.db, 'cal-apagado');
		await follow(t.db, a.id, { kind: 'etiqueta', key: 'shibari' });
		const listed = [ev('2030-01-01-taller-inventado', { tags: ['shibari'] })];
		expect([...(await calendarSlugs(t.db, a.id, { listed, sigo: false, tags }))]).toEqual([]);
	});

	it('etiquetas seguidas con «en mi calendario», y solo de eventos', async () => {
		const a = await makeAccount(t.db, 'cal-etiqueta');
		await follow(t.db, a.id, { kind: 'etiqueta', key: 'shibari' });
		const listed = [
			ev('2030-01-01-taller-inventado', { tags: ['shibari'] }),
			ev('2030-01-02-otro-inventado', { tags: ['otra-cosa'] }),
			{ meta: { postID: 'nota-inventada', category: 'material', tags: ['shibari'] } }
		];
		const on = await calendarSlugs(t.db, a.id, { listed, sigo: true, tags });
		expect([...on]).toEqual(['2030-01-01-taller-inventado']);
		await setFollowOptions(t.db, a.id, { kind: 'etiqueta', key: 'shibari' }, OFF);
		expect((await calendarSlugs(t.db, a.id, { listed, sigo: true, tags })).size).toBe(0);
	});

	it('perfil seguido (nombrado en personas) y lugar seguido (eventos ahí)', async () => {
		const a = await makeAccount(t.db, 'cal-perfil');
		const persona = await makeProfile(t.db, { title: 'Persona Inventada' });
		const lugar = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
		const hidden = await makeProfile(t.db, { title: 'Oculta Inventada', visibility: 'hidden' });
		await follow(t.db, a.id, { kind: 'perfil', key: String(persona.id) });
		await follow(t.db, a.id, { kind: 'perfil', key: String(lugar.id) });
		// Una fila de algo que ya no puede ver (no pasa por la acción): no suma nada.
		await follow(t.db, a.id, { kind: 'perfil', key: String(hidden.id) });
		// «Sucede en» es un edge del evento: el evento tiene que estar en la base.
		await makeEvent(t.db, '2030-02-01-en-el-lugar');
		await setEventVenue(t.db, {
			eventSlug: '2030-02-01-en-el-lugar',
			venueId: lugar.id,
			privacy: 'public',
			by: 'admin-de-prueba'
		});
		const listed = [
			ev('2030-02-01-en-el-lugar'),
			ev('2030-02-02-con-persona', { personas: [{ perfil: persona.slug, rol: 'Da' }] }),
			ev('2030-02-03-con-oculta', { personas: [{ perfil: hidden.slug, rol: 'Da' }] }),
			ev('2030-02-04-nada')
		];
		const on = await calendarSlugs(t.db, a.id, { listed, sigo: true, tags });
		expect([...on].sort()).toEqual(['2030-02-01-en-el-lugar', '2030-02-02-con-persona']);
	});

	it('donde participo (perfiles que gestiono), y se puede apagar', async () => {
		const a = await makeAccount(t.db, 'cal-participo');
		const mine = await makeProfile(t.db, { title: 'Proyecto Inventado', kind: 'proyecto' });
		await addManager(t.db, mine.id, a.id);
		const listed = [ev('2030-03-01-participo', { personas: [{ perfil: mine.slug, rol: 'Da' }] })];
		expect([...(await calendarSlugs(t.db, a.id, { listed, sigo: true, tags }))]).toEqual([
			'2030-03-01-participo'
		]);
		await setCalendarPrefs(t.db, a.id, { entradas: true, participo: false });
		expect((await calendarSlugs(t.db, a.id, { listed, sigo: true, tags })).size).toBe(0);
	});
});
