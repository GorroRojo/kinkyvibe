/**
 * La dirección de un evento (la del .md importado o, si no tiene, la del objeto) se busca por
 * índice (./eventSlugIds.js): `findEventRow` (./partes.js) y `eventVenue`
 * (../amigues/venues.js) dan lo mismo que la comparación de antes con
 * `coalesce(cs.legacy_slug, ev.slug)`, sin recorrer todos los eventos. Y la migración 0062 deja el
 * índice `edges_kind_from`. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB } from '$lib/server/db/testing.js';
import { saveObject } from '../objects/save.js';
import { makeEvent, makeProfile } from '../amigues/testing.js';
import { findEventRow } from './partes.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {typeof import('../amigues/venues.js')} */
let venues;

/** Un evento con dirección de objeto `slug` y, si se pasa, la de un .md importado `legacy`. */
async function event(/** @type {string} */ slug, /** @type {string | null} */ legacy, extra = {}) {
	const saved = await saveObject(
		t.db,
		{
			type: 'evento',
			slug,
			title: `Evento ${slug}`,
			visibility: 'public',
			data: { start: '2026-11-01T20:00-03:00' },
			...extra
		},
		{ actor: 'admin-de-prueba' }
	);
	if (legacy)
		await t.db
			.prepare(
				`INSERT INTO content_sources (object_id, category, legacy_slug, source_hash,
					imported_version, imported_at, updated_at) VALUES (?1, 'calendario', ?2, ?3, 1, 1, 1)`
			)
			.bind(saved.id, legacy, '0'.repeat(64))
			.run();
	return saved;
}

beforeAll(async () => {
	t = await createTestDB();
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));
	venues = await import('../amigues/venues.js');
	await makeEvent(t.db, 'Fiesta.Inventada'); // .md importado: objeto `fiesta-inventada-md`
	await makeEvent(t.db, 'taller-inventado'); // solo objeto
	// La dirección de un .md igual a la de otro objeto: ganan los dos, primero el del .md.
	await event('dos-inventado', null);
	await event('b-inventado', 'dos-inventado');
	// Un .md cuya dirección de objeto no es la de su página.
	await event('cruce-inventado', 'Otro.Inventado');
	await event('oculto-inventado', null, { visibility: 'hidden' });
	// Material con la misma dirección que un evento: no es un evento.
	await t.db
		.prepare(
			`INSERT INTO content_sources (object_id, category, legacy_slug, source_hash,
				imported_version, imported_at, updated_at)
			VALUES ((SELECT id FROM objects WHERE slug = 'taller-inventado'), 'material', 'material-inventado', ?1, 1, 1, 1)
			ON CONFLICT DO NOTHING`
		)
		.bind('0'.repeat(64))
		.run();
	const lugar = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
	for (const slug of ['Fiesta.Inventada', 'taller-inventado', 'dos-inventado', 'Otro.Inventado'])
		expect(
			(
				await venues.setEventVenue(t.db, {
					eventSlug: slug,
					venueId: lugar.id,
					privacy: null,
					by: 'a'
				})
			).ok
		).toBe(true);
});
afterAll(async () => {
	await t?.dispose();
});

const SLUGS = [
	'Fiesta.Inventada',
	'fiesta-inventada-md',
	'taller-inventado',
	'dos-inventado',
	'b-inventado',
	'Otro.Inventado',
	'cruce-inventado',
	'oculto-inventado',
	'material-inventado',
	'no-existe'
];

/** El evento con esa dirección, con la consulta de antes. @param {string} slug */
const oldEventId = async (slug) =>
	(
		await t.db
			.prepare(
				`SELECT ev.id FROM objects ev
				LEFT JOIN content_sources cs ON cs.object_id = ev.id AND cs.category = 'calendario'
				WHERE ev.type = 'evento' AND (cs.legacy_slug = ?1 OR (cs.legacy_slug IS NULL AND ev.slug = ?1))
				ORDER BY cs.legacy_slug IS NULL LIMIT 1`
			)
			.bind(slug)
			.first()
	)?.id ?? null;

/** El lugar del evento con esa dirección, con la consulta de antes. @param {string} slug */
const oldVenueId = async (slug) =>
	(
		await t.db
			.prepare(
				`SELECT e.to_id FROM edges e
				JOIN objects ev ON ev.id = e.from_id AND ev.type = 'evento'
				LEFT JOIN content_sources cs ON cs.object_id = ev.id AND cs.category = 'calendario'
				JOIN objects o ON o.id = e.to_id
				WHERE e.kind = 'lugar' AND coalesce(cs.legacy_slug, ev.slug) = ?1
					AND o.type = 'perfil' AND o.deleted_at IS NULL`
			)
			.bind(slug)
			.first()
	)?.to_id ?? null;

describe('la dirección de un evento, por índice', () => {
	it('findEventRow da el mismo evento que la consulta de antes', async () => {
		const got = [];
		for (const slug of SLUGS) {
			const row = await findEventRow(t.db, slug);
			expect(row?.id ?? null).toBe(await oldEventId(slug));
			got.push([slug, row?.slug ?? null]);
		}
		expect(got).toEqual([
			['Fiesta.Inventada', 'Fiesta.Inventada'],
			['fiesta-inventada-md', null],
			['taller-inventado', 'taller-inventado'],
			['dos-inventado', 'dos-inventado'],
			['b-inventado', null],
			['Otro.Inventado', 'Otro.Inventado'],
			['cruce-inventado', null],
			['oculto-inventado', 'oculto-inventado'],
			['material-inventado', null],
			['no-existe', null]
		]);
		// Con dos que coinciden, el del .md (como antes).
		expect((await findEventRow(t.db, 'dos-inventado'))?.objectSlug).toBe('b-inventado');
	});

	it('eventVenue da el mismo lugar que la consulta de antes', async () => {
		for (const slug of SLUGS) {
			const found = await venues.eventVenue(t.db, slug);
			expect(found?.venue.id ?? null).toBe(await oldVenueId(slug));
		}
		expect(await venues.eventVenue(t.db, 'cruce-inventado')).toBeNull();
		expect((await venues.eventVenue(t.db, 'Otro.Inventado'))?.venue.title).toBe('Lugar Inventado');
	});

	it('sin recorrer todos los eventos ni todos los vínculos (EXPLAIN QUERY PLAN)', async () => {
		const counted = countingDB(t.db);
		await findEventRow(counted.db, 'taller-inventado');
		await venues.eventVenue(counted.db, 'taller-inventado');
		expect(counted.log).toHaveLength(2);
		for (const { sql } of counted.log) {
			const n = Math.max(...[...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1])));
			const plan = await t.db
				.prepare(`EXPLAIN QUERY PLAN ${sql}`)
				.bind(...Array.from({ length: n }, () => null))
				.all();
			const steps = plan.results.map((r) => String(r.detail));
			// Ni `SCAN` de una tabla ni la búsqueda de todos los eventos por tipo.
			expect(steps.filter((s) => /^SCAN (ev|e|o|objects|edges)\b/.test(s))).toEqual([]);
			expect(steps.filter((s) => /^SEARCH ev USING .*\(type=\?\)$/.test(s))).toEqual([]);
		}
	});

	it('la migración deja el índice edges_kind_from (kind, from_id)', async () => {
		const cols = await t.db.prepare(`SELECT name FROM pragma_index_info('edges_kind_from')`).all();
		expect(cols.results.map((r) => r.name)).toEqual(['kind', 'from_id']);
		const plan = await t.db
			.prepare(`EXPLAIN QUERY PLAN SELECT count(*) FROM edges WHERE kind = 'lugar'`)
			.all();
		expect(plan.results.map((r) => String(r.detail)).join('\n')).toContain('edges_kind_from');
	});
});
