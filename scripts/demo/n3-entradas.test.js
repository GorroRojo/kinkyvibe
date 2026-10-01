/**
 * El seed de la demo (n3-entradas.sql) corre sobre una base migrada y deja lo que promete:
 * eventos con configuración de entradas válida y «Preventa 1» llena.
 */
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { unstable_splitSqlQuery } from 'wrangler';
import { createTestDB } from '$lib/server/db/testing.js';
import { parseTicketConfig, typeAvailability } from '$lib/server/tickets/config.js';
import { getTaken } from '$lib/server/tickets/orders.js';
import { splitMarkdown } from '$lib/utils/eventDraft.js';

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

/** @param {string} slug */
async function configOf(slug) {
	const row = await t.db
		.prepare('SELECT content FROM demo_files WHERE path = ?1')
		.bind(`src/lib/posts/calendario/${slug}.md`)
		.first();
	const meta = parseDocument(splitMarkdown(String(row?.content)).frontmatter).toJS();
	return /** @type {import('$lib/server/tickets/config.js').EventTickets} */ (
		parseTicketConfig(meta)
	);
}

describe('seed n3-entradas', () => {
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
