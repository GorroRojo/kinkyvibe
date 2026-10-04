/**
 * Importar la planilla guardando en la base (./importarBase.js): cada borrador es un objeto
 * `evento` nuevo (saveObject, con historial), copia del evento elegido con sus relaciones (edges
 * `persona` y `lugar`), sus entradas (las del original o las que se eligieron) y su meta de venta.
 * Datos inventados en un D1 de miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { dehydratePersonas } from '$lib/server/contenido/personasEdges.js';
import { clearDbPostCache } from '$lib/server/contenido/repo.js';
import { setEventVenue } from '$lib/server/amigues/venues.js';
import { readTicketsForm, emptyTicketType } from '$lib/utils/ticketsEditor.js';
import { storeImage } from '$lib/server/media/library.js';
import { solidPng } from '$lib/server/media/testing.js';
import { createImportedDrafts, importSources, takenEventSlugs } from './importarBase.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

const SOURCE = 'fiesta-inventada-2099-10';
const TODAY = '2099-10-04';

/** @type {{ venue: number, colectivo: number }} */
let ids;

/**
 * @param {string} slug
 * @param {string} title
 * @param {Record<string, unknown>} data
 * @param {{ visibility?: 'public' | 'hidden' }} [opts]
 */
async function seedEvent(slug, title, data, { visibility = 'public' } = {}) {
	const { data: d, edges } = await dehydratePersonas(t.db, 'calendario', data);
	return saveObject(
		t.db,
		{ type: 'evento', slug, title, data: d, edges, visibility },
		{ actor: 'prueba' }
	);
}

const SOURCE_DATA = {
	summary: 'Una fiesta inventada.',
	status: 'abierto',
	start: '2099-10-02T22:00-03:00',
	end: '2099-10-03T03:00-03:00',
	tags: ['español', 'pago', 'AMBA'],
	location_name: 'Lugar Inventado',
	link: 'https://example.com/inscripcion',
	link_text: 'Inscribirme',
	featured: '1',
	personas: [{ profile: 'colectivo-inventado', role: 'Organiza' }],
	body: 'Texto de la fiesta inventada.',
	extra: {
		tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 50 }],
		payment_methods: ['mercadopago'],
		puerta: true,
		meta_venta: 'entradas:40'
	}
};

beforeEach(async () => {
	await resetDB(t.db);
	clearDbPostCache();
	const venue = await saveObject(
		t.db,
		{ type: 'perfil', slug: 'lugar-inventado', title: 'Lugar Inventado', data: { kind: 'lugar' } },
		{ actor: 'prueba' }
	);
	const colectivo = await saveObject(
		t.db,
		{
			type: 'perfil',
			slug: 'colectivo-inventado',
			title: 'Colectivo Inventado',
			data: { kind: 'proyecto' }
		},
		{ actor: 'prueba' }
	);
	ids = { venue: venue.id, colectivo: colectivo.id };
	await seedEvent(SOURCE, 'Fiesta Inventada (4ª Edición)', SOURCE_DATA);
	const r = await setEventVenue(t.db, {
		eventSlug: SOURCE,
		venueId: venue.id,
		privacy: null,
		by: 'prueba'
	});
	expect(r.ok).toBe(true);
	clearDbPostCache();
});

/** @param {string} slug */
async function objectOf(slug) {
	const row = /** @type {any} */ (
		await t.db
			.prepare(
				`SELECT id, title, version, visibility, data FROM objects WHERE type = 'evento' AND slug = ?1`
			)
			.bind(slug)
			.first()
	);
	return row ? { ...row, data: JSON.parse(row.data) } : null;
}

/** @param {number} id */
async function edgesOf(id) {
	const { results } = await t.db
		.prepare('SELECT kind, to_id, data FROM edges WHERE from_id = ?1 ORDER BY kind, position')
		.bind(id)
		.all();
	return results.map((r) => ({
		kind: r.kind,
		to: r.to_id,
		data: r.data ? JSON.parse(String(r.data)) : null
	}));
}

async function eventCount() {
	const r = /** @type {any} */ (
		await t.db.prepare(`SELECT COUNT(*) AS n FROM objects WHERE type = 'evento'`).first()
	);
	return Number(r.n);
}

/** @param {Partial<import('./importarBase.js').ImportRow>} over */
const row = (over = {}) => ({
	title: 'Fiesta Inventada (5ª Edición)',
	date: '2099-11-06',
	startTime: '22:00',
	endTime: '03:00',
	place: '',
	link: '',
	price: '',
	source: SOURCE,
	slug: 'fiesta-inventada-2099-11',
	...over
});

/** @param {import('./importarBase.js').ImportRow[]} rows */
async function create(rows) {
	const taken = await takenEventSlugs(t.db);
	const r = await createImportedDrafts(t.db, {
		rows,
		actor: 'admin-inventade',
		today: TODAY,
		taken
	});
	clearDbPostCache();
	return r;
}

describe('createImportedDrafts: escribe en la base', () => {
	it('duplica el evento elegido como un objeto evento nuevo, no listado y borrador', async () => {
		const r = await create([row()]);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.failed).toBeNull();
		expect(r.created.map((c) => c.slug)).toEqual(['fiesta-inventada-2099-11']);

		const o = await objectOf('fiesta-inventada-2099-11');
		expect(o).not.toBeNull();
		expect(o.title).toBe('Fiesta Inventada (5ª Edición)');
		expect(o.version).toBe(1);
		expect(o.visibility).toBe('public');
		expect(o.data.unlisted).toBe(true);
		expect(o.data.extra.borrador).toBe(true);
		expect(o.data.start).toBe('2099-11-06T22:00-03:00');
		expect(o.data.end).toBe('2099-11-07T03:00-03:00');
		expect(o.data.body).toBe('Texto de la fiesta inventada.');
		// Sin link nuevo: «anunciado».
		expect(o.data.status).toBe('anunciado');
		// Relaciones: edges, nunca ids en `data`.
		expect(JSON.stringify(o.data)).not.toContain(String(ids.colectivo) + ',');
		expect(o.data.personas ?? []).toEqual([]);
		const edges = await edgesOf(o.id);
		expect(edges).toEqual([
			{ kind: 'lugar', to: ids.venue, data: null },
			{ kind: 'persona', to: ids.colectivo, data: { roles: ['Organiza'], at: [0] } }
		]);
	});

	it('guarda el historial (object_revisions) y quién lo creó', async () => {
		await create([row()]);
		const o = await objectOf('fiesta-inventada-2099-11');
		const rev = /** @type {any} */ (
			await t.db
				.prepare('SELECT version, source, saved_by FROM object_revisions WHERE object_id = ?1')
				.bind(o.id)
				.first()
		);
		expect(rev).toEqual({ version: 1, source: 'panel', saved_by: 'admin-inventade' });
	});

	it('copia las entradas y la meta de venta del evento original', async () => {
		await create([row()]);
		const o = await objectOf('fiesta-inventada-2099-11');
		expect(o.data.extra.tickets).toEqual([
			{ id: 'general', name: 'General', price: 8000, capacity: 50 }
		]);
		expect(o.data.extra.meta_venta).toBe('entradas:40');
	});

	it('la imagen propia del original no se copia (está en el repo), con un aviso', async () => {
		const r = await create([row()]);
		const o = await objectOf('fiesta-inventada-2099-11');
		expect(o.data.featured).toBeUndefined();
		expect(r.ok && r.created[0].notes.join(' ')).toMatch(/imagen del evento anterior no se copia/);
	});

	it('la imagen de la biblioteca del original se reusa (edge `portada` a la misma imagen), sin aviso', async () => {
		const { image } = await storeImage(
			t.db,
			t.env.MEDIA,
			{ bytes: solidPng(8, 8), name: 'fiesta.png', alt: 'Cuadrado violeta de prueba' },
			{ actor: 'prueba' }
		);
		const src = /** @type {any} */ (
			await t.db
				.prepare(`SELECT id, version FROM objects WHERE type = 'evento' AND slug = ?1`)
				.bind(SOURCE)
				.first()
		);
		await saveObject(
			t.db,
			{ id: src.id, type: 'evento', version: src.version, edges: { portada: [image.id] } },
			{ actor: 'prueba' }
		);
		clearDbPostCache();

		const r = await create([row()]);
		expect(r.ok).toBe(true);
		const o = await objectOf('fiesta-inventada-2099-11');
		expect(o.data.featured).toBeUndefined();
		expect((await edgesOf(o.id)).filter((e) => e.kind === 'portada')).toEqual([
			{ kind: 'portada', to: image.id, data: null }
		]);
		expect(r.ok && r.created[0].notes.join(' ')).not.toMatch(/imagen del evento anterior/);
		// El original sigue con su imagen.
		expect((await edgesOf(src.id)).filter((e) => e.kind === 'portada')).toEqual([
			{ kind: 'portada', to: image.id, data: null }
		]);
	});

	it('desde cero (sin evento anterior) no lleva imagen', async () => {
		const r = await create([row({ source: '', slug: 'de-cero-inventado-2099-11' })]);
		expect(r.ok).toBe(true);
		const o = await objectOf('de-cero-inventado-2099-11');
		expect((await edgesOf(o.id)).filter((e) => e.kind === 'portada')).toEqual([]);
	});

	it('un mail de la planilla queda como mailto: y abre la inscripción; tel: también vale', async () => {
		const r = await create([
			row({ link: 'mailto:hola@example.com' }),
			row({ slug: 'fiesta-inventada-2099-12', date: '2099-12-04', link: 'tel:+5491100000000' })
		]);
		expect(r.ok).toBe(true);
		const a = await objectOf('fiesta-inventada-2099-11');
		expect(a.data.link).toBe('mailto:hola@example.com');
		expect(a.data.status).toBe('abierto');
		const b = await objectOf('fiesta-inventada-2099-12');
		expect(b.data.link).toBe('tel:+5491100000000');
	});

	it('un «Valor» con un precio General, sin tocar las entradas, cambia el precio', async () => {
		await create([row({ price: '$9.500' })]);
		const o = await objectOf('fiesta-inventada-2099-11');
		expect(o.data.extra.tickets).toEqual([{ id: 'general', name: 'General', price: 9500 }]);
		expect(o.data.extra.meta_venta).toBe('entradas:40');
	});

	it('usa las entradas elegidas (tipos, precios, cupos y meta) en vez del «Valor»', async () => {
		const [src] = await importSources(t.db);
		const form = readTicketsForm(/** @type {any} */ (src.ticketMeta));
		form.types[0].price = '10000';
		form.types[0].capacity = '80';
		const vip = emptyTicketType();
		vip.name = 'VIP';
		vip.price = '20000';
		vip.capacity = '10';
		form.types.push(vip);
		form.goalKind = 'plata';
		form.goalValue = '500000';
		// Lo que pasa por JSON, como lo manda el navegador.
		const tickets = JSON.parse(JSON.stringify(form));
		const r = await create([row({ price: '$9.500', tickets })]);
		expect(r.ok).toBe(true);
		const o = await objectOf('fiesta-inventada-2099-11');
		expect(o.data.extra.tickets).toEqual([
			{ id: 'general', name: 'General', price: 10000, capacity: 80 },
			{ id: 'vip', name: 'VIP', price: 20000, capacity: 10 }
		]);
		expect(o.data.extra.meta_venta).toBe('plata:500000');
	});

	it('sacar la venta en la importación deja el borrador sin entradas', async () => {
		const [src] = await importSources(t.db);
		const form = readTicketsForm(/** @type {any} */ (src.ticketMeta));
		form.enabled = false;
		await create([row({ tickets: form })]);
		const o = await objectOf('fiesta-inventada-2099-11');
		expect(o.data.extra.tickets).toBeUndefined();
	});

	it('las mismas entradas para todas las filas (copiadas a cada una)', async () => {
		const [src] = await importSources(t.db);
		const form = readTicketsForm(/** @type {any} */ (src.ticketMeta));
		form.types[0].price = '7000';
		const r = await create([
			row({ tickets: structuredClone(form) }),
			row({
				slug: 'fiesta-inventada-2099-12',
				date: '2099-12-04',
				tickets: structuredClone(form)
			})
		]);
		expect(r.ok && r.created.length).toBe(2);
		for (const slug of ['fiesta-inventada-2099-11', 'fiesta-inventada-2099-12']) {
			const o = await objectOf(slug);
			expect(o.data.extra.tickets[0].price).toBe(7000);
		}
	});

	it('entradas inválidas: la fila no se guarda, ni ninguna otra', async () => {
		const [src] = await importSources(t.db);
		const form = readTicketsForm(/** @type {any} */ (src.ticketMeta));
		form.types[0].price = '';
		const before = await eventCount();
		const r = await create([
			row({ slug: 'otra-fiesta-2099-11' }),
			row({ slug: 'fiesta-inventada-2099-12', tickets: form })
		]);
		expect(r).toMatchObject({ ok: false, status: 400 });
		expect(r.ok === false && 'rowErrors' in r && r.rowErrors[1]).toMatch(/^Entradas:/);
		expect(await eventCount()).toBe(before);
	});

	it('un lugar distinto en la planilla no copia el edge «lugar»', async () => {
		const r = await create([row({ place: 'Otro Sótano Inventado' })]);
		const o = await objectOf('fiesta-inventada-2099-11');
		expect(o.data.location_name).toBe('Otro Sótano Inventado');
		const edges = await edgesOf(o.id);
		expect(edges.some((e) => e.kind === 'lugar')).toBe(false);
		expect(r.ok && r.created[0].notes.join(' ')).toMatch(/lugar cambió/);
	});

	it('desde cero (sin evento anterior) usa la plantilla', async () => {
		const r = await create([
			row({ source: '', slug: 'taller-nuevo-2099-11', title: 'Taller nuevo' })
		]);
		expect(r.ok).toBe(true);
		const o = await objectOf('taller-nuevo-2099-11');
		expect(o.title).toBe('Taller nuevo');
		expect(o.data.unlisted).toBe(true);
		expect(o.data.extra.borrador).toBe(true);
		expect(o.data.extra.tickets).toBeUndefined();
	});

	it('una dirección ocupada (también borrada) propone otra y no guarda nada', async () => {
		const before = await eventCount();
		const r = await create([row({ slug: SOURCE })]);
		expect(r).toMatchObject({ ok: false, status: 409 });
		expect(r.ok === false && 'conflicts' in r && r.conflicts[0]).toBe(`${SOURCE}-2`);
		expect(await eventCount()).toBe(before);
	});

	it('un evento anterior que no está en la base es un error de esa fila', async () => {
		const r = await create([row({ source: 'no-existe-2099-01' })]);
		expect(r).toMatchObject({ ok: false, status: 400 });
		expect(r.ok === false && 'rowErrors' in r && r.rowErrors[0]).toMatch(/No encontramos/);
	});
});

describe('importSources y takenEventSlugs', () => {
	it('lista los eventos de la base (no los borrados), más recientes primero, con sus entradas', async () => {
		await seedEvent('taller-viejo-2098-03', 'Taller Viejo', {
			start: '2098-03-01T19:00-03:00',
			tags: ['español']
		});
		const gone = await seedEvent('borrado-2099-09', 'Borrado', {
			start: '2099-09-01T19:00-03:00'
		});
		await saveObject(
			t.db,
			{ id: gone.id, type: 'evento', version: gone.version, deleted: true },
			{ actor: 'prueba' }
		);
		clearDbPostCache();
		const list = await importSources(t.db, {
			seriesName: (tags) => (tags.includes('pago') ? 'Serie Inventada' : '')
		});
		expect(list.map((s) => s.slug)).toEqual([SOURCE, 'taller-viejo-2098-03']);
		expect(list[0]).toMatchObject({
			title: 'Fiesta Inventada (4ª Edición)',
			start: '2099-10-02T22:00-03:00',
			series: 'Serie Inventada',
			hidden: false,
			ticketMeta: {
				tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 50 }],
				meta_venta: 'entradas:40',
				payment_methods: ['mercadopago'],
				puerta: true
			}
		});
		expect(list[1].ticketMeta).toBeNull();
	});

	it('las direcciones ocupadas incluyen las borradas y las del deploy', async () => {
		const gone = await seedEvent('borrado-2099-09', 'Borrado', {
			start: '2099-09-01T19:00-03:00'
		});
		await saveObject(
			t.db,
			{ id: gone.id, type: 'evento', version: gone.version, deleted: true },
			{ actor: 'prueba' }
		);
		const taken = await takenEventSlugs(t.db, ['solo-md-2099-01']);
		expect(taken.has(SOURCE)).toBe(true);
		expect(taken.has('borrado-2099-09')).toBe(true);
		expect(taken.has('solo-md-2099-01')).toBe(true);
	});
});
