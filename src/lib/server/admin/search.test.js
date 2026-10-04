import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	groupResults,
	likeContains,
	orderIdPrefix,
	searchDatabase,
	searchEvents,
	searchTags
} from './search.js';
import { insertOrder, insertTicket } from './testRows.js';

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

describe('helpers', () => {
	it('orderIdPrefix reconoce referencias KV-…', () => {
		expect(orderIdPrefix('KV-1A2B3C4D')).toBe('1a2b3c4d');
		expect(orderIdPrefix('kv 1a2b')).toBe('1a2b');
		expect(orderIdPrefix('1A2B3C')).toBe('1a2b3c');
		expect(orderIdPrefix('ana')).toBe(null);
		expect(orderIdPrefix('KV-12')).toBe(null);
	});
	it('likeContains escapa los comodines', () => {
		expect(likeContains('50%_a\\b')).toBe('%50\\%\\_a\\\\b%');
	});
});

describe('searchEvents', () => {
	/** @type {any[]} */
	const events = [
		{
			slug: 'picantearla-2026-09',
			title: 'Picantearla',
			start: '2026-09-12T20:00-03:00',
			unlisted: false
		},
		{
			slug: 'picantearla-2026-10',
			title: 'Picantearla',
			start: '2026-10-12T20:00-03:00',
			unlisted: true
		},
		{
			slug: 'taller-de-cuerdas',
			title: 'Taller de cuerdas y más',
			start: '2026-08-01T20:00-03:00',
			unlisted: false
		},
		{
			slug: 'munch-cordoba',
			title: 'Munch en Córdoba',
			start: '2026-07-01T20:00-03:00',
			unlisted: false
		}
	];
	it('por título sin tildes ni mayúsculas, primero los que empiezan igual y los más nuevos', () => {
		const r = searchEvents(events, 'PICANT');
		expect(r.map((x) => x.id)).toEqual(['event:picantearla-2026-10', 'event:picantearla-2026-09']);
		expect(r[0].sub).toContain('no listado');
		expect(searchEvents(events, 'cordoba')[0].title).toBe('Munch en Córdoba');
		expect(searchEvents(events, 'cuerdas')[0].id).toBe('event:taller-de-cuerdas');
	});
	it('por slug y con mínimo de 2 letras', () => {
		expect(searchEvents(events, 'taller-de')).toHaveLength(1);
		expect(searchEvents(events, 'p')).toEqual([]);
	});
});

describe('searchDatabase', () => {
	it('sin base o con búsqueda corta devuelve vacío', async () => {
		const empty = { orders: [], tickets: [], codes: [], people: [], profiles: [] };
		expect(await searchDatabase(null, 'ana')).toEqual(empty);
		expect(await searchDatabase(t.db, 'a')).toEqual(empty);
	});

	it('órdenes por referencia KV-…, nombre y email', async () => {
		const id = await insertOrder(t.db, {
			id: 'abcdef12-0000-4000-8000-000000000001',
			slug: 'ev',
			name: 'Ana Inventada',
			email: 'ana.inventada@example.com'
		});
		await insertOrder(t.db, { name: 'Otra Persona', email: 'otra@example.com' });
		const titles = new Map([['ev', 'Evento de prueba']]);
		const byRef = await searchDatabase(t.db, 'KV-ABCDEF12', { titles });
		expect(byRef.orders.map((o) => o.id)).toEqual([`order:${id}`]);
		expect(byRef.orders[0].title).toBe('KV-ABCDEF12 · Ana Inventada');
		expect(byRef.orders[0].sub).toContain('Evento de prueba');
		expect((await searchDatabase(t.db, 'inventada')).orders).toHaveLength(1);
		expect((await searchDatabase(t.db, 'otra@exa')).orders[0].title).toContain('Otra Persona');
		// Los comodines de LIKE se buscan literalmente.
		expect((await searchDatabase(t.db, '%%')).orders).toHaveLength(0);
	});

	it('por DNI muestra solo los últimos 3 dígitos, nunca el DNI completo', async () => {
		await insertOrder(t.db, { name: 'Con Documento', dni: '30111222' });
		const r = await searchDatabase(t.db, '30.111.222');
		expect(r.orders).toHaveLength(1);
		expect(r.orders[0].sub).toContain('DNI ···222');
		expect(JSON.stringify(r)).not.toContain('30111222');
		// Una búsqueda por nombre tampoco trae el DNI.
		expect(JSON.stringify(await searchDatabase(t.db, 'documento'))).not.toContain('30111222');
	});

	it('entradas por código corto y por nombre de la entrada', async () => {
		const o = await insertOrder(t.db, { slug: 'ev' });
		await insertTicket(t.db, { orderId: o, slug: 'ev', code: 'ABC234', name: 'Titular Inventade' });
		const r = await searchDatabase(t.db, 'abc-234');
		expect(r.tickets).toHaveLength(1);
		expect(r.tickets[0].title).toBe('Titular Inventade · ABC234');
		expect(r.tickets[0].sub).toContain('sin usar');
		expect((await searchDatabase(t.db, 'titular')).tickets).toHaveLength(1);
	});

	it('códigos de descuento', async () => {
		await t.db
			.prepare(
				`INSERT INTO discount_codes (code, kind, value, event_slug, active, created_at, created_by)
				VALUES ('AMIGUES20', 'percent', 20, NULL, 1, 1, 'admin'), ('OTRO', 'fixed', 1000, 'ev', 0, 1, 'admin')`
			)
			.run();
		const r = await searchDatabase(t.db, 'amig');
		expect(r.codes).toEqual([
			expect.objectContaining({ title: 'AMIGUES20', sub: '20 % · todos los eventos · activo' })
		]);
	});

	it('personas: una por email, con cuántas compras y la última', async () => {
		await insertOrder(t.db, {
			slug: 'uno',
			name: 'Carla Ficticia',
			email: 'Carla@example.com',
			created: 1000
		});
		const last = await insertOrder(t.db, {
			slug: 'dos',
			name: 'Carla Ficticia',
			email: 'carla@example.com',
			created: 2000
		});
		await insertOrder(t.db, {
			slug: 'tres',
			name: 'Carla Ficticia',
			email: 'carla@example.com',
			status: 'expired'
		});
		const r = await searchDatabase(t.db, 'carla', { titles: new Map([['dos', 'Evento Dos']]) });
		expect(r.people).toHaveLength(1);
		expect(r.people[0].sub).toBe('carla@example.com · 2 compras · última: Evento Dos');
		expect(r.people[0].href).toContain(last.slice(0, 8));
	});
});

describe('groupResults', () => {
	it('saca los grupos vacíos y respeta el orden', () => {
		const item = { id: 'x', icon: 'event', title: 'x', sub: '', href: '/x' };
		expect(
			groupResults({ events: [item], orders: [], tickets: [item], codes: [], people: [item] }).map(
				(g) => g.id
			)
		).toEqual(['events', 'people', 'tickets']);
	});
});

describe('searchDatabase: perfiles', () => {
	it('por nombre, al editor del perfil', async () => {
		const { saveObject } = await import('$lib/server/objects/save.js');
		await saveObject(
			t.db,
			{
				type: 'perfil',
				slug: 'perfil-inventado',
				title: 'Perfil Inventado',
				data: { kind: 'persona' }
			},
			{ actor: 'admin-prueba' }
		);
		const r = await searchDatabase(t.db, 'inventado');
		expect(r.profiles).toEqual([
			expect.objectContaining({
				title: 'Perfil Inventado',
				href: '/admin/comunidad/perfiles/perfil-inventado'
			})
		]);
	});
});

describe('searchTags', () => {
	const tags = [
		{ id: 'shibari', visible_name: 'Shibari', icon: '🪢' },
		{ id: 'cuerdas', aliasOf: 'shibari' },
		{ id: 'AMBA', visible_name: 'AMBA' }
	];
	it('por nombre, sin alias, al árbol con la etiqueta elegida', () => {
		const r = searchTags(tags, 'shib');
		expect(r).toHaveLength(1);
		expect(r[0]).toMatchObject({
			title: '🪢 Shibari',
			href: '/admin/etiquetas?etiqueta=shibari'
		});
		expect(searchTags(tags, 'cuerd')).toEqual([]);
		expect(searchTags(tags, 'a')).toEqual([]);
	});
});
