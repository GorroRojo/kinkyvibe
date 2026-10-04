/**
 * El seed de la demo (n3-entradas.sql) corre sobre una base migrada y deja lo que promete:
 * eventos (objetos `evento` en la base) con configuración de entradas válida y «Preventa 1» llena.
 */
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import { createTestDB } from '$lib/server/db/testing.js';
import { parseTicketConfig, typeAvailability } from '$lib/server/tickets/config.js';
import { getTaken } from '$lib/server/tickets/orders.js';
import { eventToMeta } from '$lib/server/contenido/eventos.js';
import { coreTypes, validateData } from '$lib/server/objects/types/index.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
	const sql = await readFile(new URL('./n3-entradas.sql', import.meta.url), 'utf8');
	const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
	// Dos veces: se puede volver a correr.
	for (let i = 0; i < 2; i++) await t.db.batch(statements.map((s) => t.db.prepare(s)));
});
afterAll(async () => {
	await t?.dispose();
});

/**
 * La metadata del evento de la demo, como la arma la base (la misma que lee el sitio), después de
 * verificar que sus datos son válidos para el tipo `evento` (el chequeo nocturno no los marca).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 */
async function eventMeta(db, slug) {
	const row = await db
		.prepare(
			"SELECT title, data, visibility, version FROM objects WHERE type = 'evento' AND slug = ?1"
		)
		.bind(slug)
		.first();
	if (!row) throw new Error(`falta el evento ${slug}`);
	const data = JSON.parse(String(row.data));
	const def = /** @type {import('$lib/server/objects/types/index.js').CoreType} */ (
		coreTypes.get('evento')
	);
	expect(validateData(def, data).ok).toBe(true);
	return eventToMeta({ title: String(row.title), data, visibility: String(row.visibility) });
}

/** @param {string} slug */
async function configOf(slug) {
	const meta = await eventMeta(t.db, slug);
	return /** @type {import('$lib/server/tickets/config.js').EventTickets} */ (
		parseTicketConfig(meta)
	);
}

describe('seed n3-entradas', () => {
	it('los eventos son objetos `evento` no listados (versión 2: se corrió dos veces)', async () => {
		for (const slug of ['demo-preventas-2026-12', 'demo-solo-anticipadas-2026-12']) {
			expect((await eventMeta(t.db, slug)).force_unlisted).toBe(true);
		}
		const v = await t.db
			.prepare(
				"SELECT version FROM objects WHERE type = 'evento' AND slug = 'demo-preventas-2026-12'"
			)
			.first();
		expect(v?.version).toBe(2);
	});

	it('evento con preventas: «Preventa 1» llena, vigente «Preventa 2»; «Última tanda» espera', async () => {
		const config = await configOf('demo-preventas-2026-12');
		const now = Date.parse('2026-10-01T12:00:00-03:00');
		const taken = await getTaken(t.db, 'demo-preventas-2026-12', now);
		expect(taken.types.get('general')).toBe(9);
		const general = typeAvailability(config, config.types[0], taken, now);
		expect(general.tier?.tier.name).toBe('Preventa 2');
		expect(general.remaining).toBe(6);
		expect(typeAvailability(config, config.types[1], taken, now).state).toBe('waiting');
		expect(config.door).toEqual({ on: true, explicit: true, price: '$ 13.000, solo efectivo' });
	});

	it('evento solo anticipadas: sin puerta, preventa por fecha', async () => {
		const config = await configOf('demo-solo-anticipadas-2026-12');
		expect(config.door?.on).toBe(false);
		expect(config.types[0].tiers?.map((x) => x.id)).toEqual(['anticipada', 'entrada']);
	});
});
