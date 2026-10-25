/**
 * `readWorkshop` en una sola ida y vuelta a D1 (una tanda) da exactamente lo mismo que la lectura
 * en tres pasos de antes (el evento, su taller y las partes del taller, uno detrás del otro): se
 * comparan las dos en cada caso (sin taller, el taller, una parte, partes ocultas, taller oculto,
 * taller borrado, dirección que no existe) y con quien mira desde el público, el panel o como
 * autore. Eventos inventados; D1 de miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB, resetDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { ANON, canSee } from '$lib/server/objects/visibility.js';
import { numberParts } from '$lib/utils/partes.js';
import {
	PANEL_VIEWER,
	childrenOf,
	findEventRow,
	parentOf,
	readWorkshop,
	setHideParts,
	setWorkshopParts
} from './partes.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

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

const BY = 'admin-de-prueba';

/**
 * La lectura de antes, en tres pasos (copiada tal cual de partes.js antes del cambio).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 * @param {import('$lib/server/objects/visibility.js').Viewer} [viewer]
 */
async function readWorkshopInSteps(db, slug, viewer = ANON) {
	if (!db) return null;
	const self = await findEventRow(db, slug);
	if (!self || !canSee(self, viewer)) return null;
	const parent = await parentOf(db, self.id);
	if (parent && parent.deleted_at === null && !canSee(parent, viewer)) return null;
	const workshop = parent && parent.deleted_at === null ? parent : self;
	const children = await childrenOf(db, workshop.id, viewer);
	if (!children.length) return null;
	return numberParts(workshop, children);
}

/**
 * @param {string} slug
 * @param {string} start
 * @param {{ visibility?: 'public' | 'members' | 'hidden', actor?: string }} [o]
 */
const event = (slug, start, o = {}) =>
	saveObject(
		t.db,
		{
			type: 'evento',
			slug,
			title: `Evento ${slug}`,
			data: { start },
			visibility: o.visibility ?? 'public'
		},
		{ actor: o.actor ?? BY }
	);

/** @param {string} slug */
async function setDeleted(slug) {
	const row = /** @type {any} */ (
		await t.db.prepare('SELECT id, version FROM objects WHERE slug = ?1').bind(slug).first()
	);
	await saveObject(
		t.db,
		{ id: Number(row.id), type: 'evento', version: Number(row.version), deleted: true },
		{ actor: BY, now: Date.now() + 1000 }
	);
}

/** @param {string} slug @param {'public' | 'hidden'} visibility */
async function setVisibility(slug, visibility) {
	const row = /** @type {any} */ (
		await t.db.prepare('SELECT id, version FROM objects WHERE slug = ?1').bind(slug).first()
	);
	await saveObject(
		t.db,
		{ id: Number(row.id), type: 'evento', version: Number(row.version), visibility },
		{ actor: BY, now: Date.now() + 1000 }
	);
}

const VIEWERS = [
	['público', ANON],
	['panel', PANEL_VIEWER],
	['autore', { role: 'member', id: 'autore-inventade' }]
];
const SLUGS = ['taller', 'taller-parte-2', 'taller-parte-3', 'suelto', 'no-existe', ''];

/**
 * Compara las dos lecturas para cada dirección y cada quien mira; devuelve lo que vio el público
 * para chequear el caso.
 */
async function sameAsBefore() {
	/** @type {Record<string, unknown>} */
	const seen = {};
	for (const slug of SLUGS) {
		for (const [name, viewer] of VIEWERS) {
			const v = /** @type {any} */ (viewer);
			const now = await readWorkshop(t.db, slug, v);
			expect(now, `${slug} (${name})`).toEqual(await readWorkshopInSteps(t.db, slug, v));
			if (name === 'público') seen[slug] = now;
		}
	}
	return seen;
}

async function workshop() {
	await event('taller', '2026-10-02T22:00-03:00');
	await event('taller-parte-2', '2026-10-09T22:00-03:00');
	await event('taller-parte-3', '2026-10-16T22:00-03:00');
	await event('suelto', '2026-10-20T22:00-03:00');
	expect(
		await setWorkshopParts(t.db, {
			eventSlug: 'taller',
			partSlugs: ['taller-parte-3', 'taller-parte-2'],
			by: BY
		})
	).toEqual({ ok: true });
}

describe('readWorkshop en una vuelta: lo mismo que en tres pasos', () => {
	it('sin taller (eventos sueltos y direcciones que no existen)', async () => {
		await event('taller', '2026-10-02T22:00-03:00');
		await event('suelto', '2026-10-20T22:00-03:00');
		const seen = await sameAsBefore();
		expect(Object.values(seen).every((v) => v === null)).toBe(true);
	});

	it('el taller y cada parte', async () => {
		await workshop();
		const seen = /** @type {any} */ (await sameAsBefore());
		expect(seen.taller.parts.map((/** @type {any} */ p) => p.slug)).toEqual([
			'taller',
			'taller-parte-3',
			'taller-parte-2'
		]);
		expect(seen['taller-parte-2']).toEqual(seen.taller);
		expect(seen.suelto).toBeNull();
	});

	it('una parte oculta: el público no la ve, el panel sí', async () => {
		await workshop();
		await setVisibility('taller-parte-3', 'hidden');
		const seen = /** @type {any} */ (await sameAsBefore());
		expect(seen.taller.total).toBe(2);
		expect(seen['taller-parte-3']).toBeNull();
		expect((await readWorkshop(t.db, 'taller', PANEL_VIEWER))?.total).toBe(3);
	});

	it('todas las otras partes ocultas: para el público no es taller', async () => {
		await workshop();
		await setVisibility('taller-parte-2', 'hidden');
		await setVisibility('taller-parte-3', 'hidden');
		const seen = /** @type {any} */ (await sameAsBefore());
		expect(seen.taller).toBeNull();
	});

	it('taller oculto (con y sin «ocultar también sus partes»)', async () => {
		await workshop();
		await setVisibility('taller', 'hidden');
		let seen = /** @type {any} */ (await sameAsBefore());
		expect(seen['taller-parte-2']).toBeNull();
		await setHideParts(t.db, { eventSlug: 'taller', hideParts: true, by: BY });
		seen = await sameAsBefore();
		expect((await readWorkshop(t.db, 'taller', PANEL_VIEWER))?.workshop.hideParts).toBe(true);
	});

	it('partes solo para cuentas u ocultas de quien mira, una parte borrada y un taller borrado', async () => {
		await workshop();
		await event('taller-parte-4', '2026-10-23T22:00-03:00', {
			visibility: 'hidden',
			actor: 'autore-inventade'
		});
		await event('taller-parte-5', '2026-10-30T22:00-03:00', { visibility: 'members' });
		await setWorkshopParts(t.db, {
			eventSlug: 'taller',
			partSlugs: ['taller-parte-3', 'taller-parte-2', 'taller-parte-4', 'taller-parte-5'],
			by: BY
		});
		SLUGS.push('taller-parte-4', 'taller-parte-5');
		try {
			const before = /** @type {any} */ (await sameAsBefore());
			expect(before.taller.total).toBe(3);
			expect(
				(await readWorkshop(t.db, 'taller', { role: 'member', id: 'autore-inventade' }))?.total
			).toBe(5);
			await setDeleted('taller-parte-2');
			await sameAsBefore();
			// Con el taller borrado, cada parte vuelve a ser suelta (sin partes propias).
			await setDeleted('taller');
			const seen = await sameAsBefore();
			expect(seen['taller-parte-3']).toBeNull();
		} finally {
			SLUGS.splice(-2);
		}
	});

	it('eventos importados con dirección vieja (distinta de la del objeto)', async () => {
		const common = {
			category: 'calendario',
			summary: 'Un evento de prueba',
			published_date: '2026-09-01Z-03:00',
			tags: [],
			authors: []
		};
		await seedPosts(t.db, [
			{
				...common,
				postID: 'Taller_Viejo-2099',
				title: 'Taller Viejo',
				start: '2099-01-03T20:00-03:00'
			},
			{
				...common,
				postID: 'Taller_Viejo-2099-parte-2',
				title: 'Parte 2',
				start: '2099-01-10T20:00-03:00'
			}
		]);
		expect(
			await setWorkshopParts(t.db, {
				eventSlug: 'Taller_Viejo-2099',
				partSlugs: ['Taller_Viejo-2099-parte-2'],
				by: BY
			})
		).toEqual({ ok: true });
		for (const slug of ['Taller_Viejo-2099', 'Taller_Viejo-2099-parte-2', 'taller_viejo-2099']) {
			for (const [name, viewer] of VIEWERS) {
				const v = /** @type {any} */ (viewer);
				expect(await readWorkshop(t.db, slug, v), `${slug} (${name})`).toEqual(
					await readWorkshopInSteps(t.db, slug, v)
				);
			}
		}
		expect(
			(await readWorkshop(t.db, 'Taller_Viejo-2099-parte-2'))?.parts.map((p) => p.slug)
		).toEqual(['Taller_Viejo-2099', 'Taller_Viejo-2099-parte-2']);
	});

	it('una sola consulta (una tanda), con o sin taller', async () => {
		await workshop();
		for (const slug of ['taller', 'taller-parte-2', 'suelto', 'no-existe']) {
			const counted = countingDB(t.db);
			await readWorkshop(counted.db, slug, PANEL_VIEWER);
			expect(counted.queries, slug).toBe(1);
		}
	});
});
