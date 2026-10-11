import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	MAX_CANDIDATES,
	eventTabActions,
	foldedMatch,
	groupResults,
	likeContains,
	looseLike,
	orderIdPrefix,
	searchDatabase,
	searchEvents,
	searchTags
} from './search.js';
import { insertOrder, insertTicket } from './testRows.js';
import { personId } from './people.js';
import { personHref } from '$lib/admin/links.js';

/** La dirección de un link del panel, sin query ni hash. @param {string} href */
const pathOf = (href) => new URL(href, 'https://panel.test').pathname;

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
	it('looseLike: las letras que pueden llevar tilde (y lo que no es ASCII) valen cualquiera', () => {
		expect(looseLike('jose')).toBe('%j_s_%');
		expect(looseLike('munoz')).toBe('%m___z%');
		expect(looseLike('50%_x')).toBe('%50\\%\\_x%');
		expect(looseLike('ł')).toBe('%_%');
	});
	it('foldedMatch: igual, al comienzo, al comienzo de una palabra, en el medio', () => {
		expect(foldedMatch('jose', 'JOSÉ')).toBe(0);
		expect(foldedMatch('jose', 'José Inventado')).toBe(1);
		expect(foldedMatch('jose', 'María José')).toBe(2);
		expect(foldedMatch('jose', 'mariajose@example.com')).toBe(3);
		expect(foldedMatch('jose', 'Ana', null)).toBe(-1);
		expect(foldedMatch('jose', 'Ana', 'josé@example.com')).toBe(1);
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
	it('marca `exact` cuando el título o el slug son lo buscado', () => {
		expect(searchEvents(events, 'MUNCH EN CORDOBA')[0].exact).toBe(true);
		expect(searchEvents(events, 'munch-cordoba')[0].exact).toBe(true);
		expect(searchEvents(events, 'munch')[0].exact).toBeUndefined();
	});
});

describe('eventTabActions', () => {
	const e = { slug: 'picantearla-2026-10', title: 'Picantearla' };
	it('con entradas: Puerta, Órdenes, Mail a compradores, Ventas y Duplicar, cada una a su pestaña', () => {
		const r = eventTabActions(e, { tickets: true });
		expect(r.map((x) => x.title)).toEqual([
			'Puerta',
			'Órdenes',
			'Mail a compradores',
			'Ventas',
			'Duplicar'
		]);
		expect(r.map((x) => pathOf(x.href))).toEqual([
			'/admin/eventos/picantearla-2026-10/ingreso',
			'/admin/eventos/picantearla-2026-10/ordenes',
			'/admin/eventos/picantearla-2026-10/mail',
			'/admin/eventos/picantearla-2026-10/ventas',
			'/admin/eventos/nuevo'
		]);
		const dup = new URL(r[4].href, 'https://panel.test');
		expect(dup.searchParams.get('desde')).toBe('picantearla-2026-10');
	});
	it('sin entradas, solo Duplicar', () => {
		expect(eventTabActions(e).map((x) => x.title)).toEqual(['Duplicar']);
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
		await insertOrder(t.db, {
			slug: 'dos',
			name: 'Carla Ficticia',
			email: 'carla@example.com',
			created: 1500,
			id: last.replace(/^.{8}/, 'ffffffff')
		});
		const r = await searchDatabase(t.db, 'carla', { titles: new Map([['dos', 'Evento Dos']]) });
		expect(r.people).toHaveLength(1);
		expect(r.people[0].sub).toBe('carla@example.com · 3 compras · última: Evento Dos');
	});

	it('personas: llevan a su ficha (no a la última orden)', async () => {
		await insertOrder(t.db, { name: 'Carla Ficticia', email: 'Carla@Example.com' });
		const r = await searchDatabase(t.db, 'carla');
		expect(r.people).toHaveLength(1);
		const url = new URL(r.people[0].href, 'https://panel.test');
		expect(url.pathname).toBe(personHref(await personId('carla@example.com')));
		expect(url.pathname.startsWith('/admin/comunidad/personas/')).toBe(true);
		expect(url.search).toBe('');
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
		expect(searchTags(tags, 'a')).toEqual([]);
	});
	it('un alias lleva a la etiqueta de verdad (de la base o en `aka`), sin repetirla', () => {
		const withAka = [
			...tags,
			{ id: 'latex', visible_name: 'Látex', aka: ['Goma'] },
			{ id: 'goma-2', aliasOf: 'latex' }
		];
		const byDbAlias = searchTags(withAka, 'CUERD');
		expect(byDbAlias).toHaveLength(1);
		expect(byDbAlias[0]).toMatchObject({
			id: 'tag:shibari',
			sub: 'etiqueta · shibari · alias: cuerdas'
		});
		expect(new URL(byDbAlias[0].href, 'https://panel.test').searchParams.get('etiqueta')).toBe(
			'shibari'
		);
		const byAka = searchTags(withAka, 'goma');
		expect(byAka.map((x) => x.id)).toEqual(['tag:latex']);
		expect(byAka[0].exact).toBe(true);
		// Por nombre, sin tildes.
		expect(searchTags(withAka, 'latex')[0]).toMatchObject({ id: 'tag:latex', exact: true });
	});
});

describe('searchDatabase: sin mayúsculas ni tildes', () => {
	it('«jose» encuentra «José» y «JOSÉ» en órdenes, personas y entradas', async () => {
		const o1 = await insertOrder(t.db, {
			name: 'José Inventado',
			email: 'jose.inventado@example.com',
			slug: 'ev',
			created: 2000
		});
		await insertOrder(t.db, { name: 'MARÍA JOSÉ PRUEBA', email: 'mj@example.com', created: 1000 });
		await insertOrder(t.db, { name: 'Otra Persona', email: 'otra@example.com' });
		await insertTicket(t.db, {
			orderId: o1,
			slug: 'ev',
			name: 'Josefina Ficticia',
			code: 'XYZ234'
		});
		const r = await searchDatabase(t.db, 'jose');
		expect(r.orders.map((o) => o.title)).toEqual([
			expect.stringContaining('José Inventado'),
			expect.stringContaining('MARÍA JOSÉ PRUEBA')
		]);
		expect(r.people.map((p) => p.title)).toEqual(['José Inventado', 'MARÍA JOSÉ PRUEBA']);
		expect(r.tickets.map((x) => x.title)).toEqual(['Josefina Ficticia · XYZ234']);
		// Escribirlo con tilde o en mayúsculas da lo mismo.
		expect((await searchDatabase(t.db, 'JOSÉ')).orders).toHaveLength(2);
		expect((await searchDatabase(t.db, 'maría')).people.map((p) => p.title)).toEqual([
			'MARÍA JOSÉ PRUEBA'
		]);
	});

	it('Ñ y ü: «nunez» encuentra «Núñez» y «muller», «Müller»', async () => {
		await insertOrder(t.db, { name: 'Ñandú Núñez', email: 'nandu@example.com' });
		await insertOrder(t.db, { name: 'Zoe Müller', email: 'zoe@example.com' });
		expect((await searchDatabase(t.db, 'nunez')).orders).toHaveLength(1);
		expect((await searchDatabase(t.db, 'ÑANDU')).people.map((p) => p.title)).toEqual([
			'Ñandú Núñez'
		]);
		expect((await searchDatabase(t.db, 'muller')).people.map((p) => p.title)).toEqual([
			'Zoe Müller'
		]);
		expect((await searchDatabase(t.db, 'müller')).orders).toHaveLength(1);
		// El filtro flojo no deja pasar parecidos: «nunca» no es «Núñez».
		expect((await searchDatabase(t.db, 'nunca')).orders).toHaveLength(0);
	});

	it('perfiles y códigos, también sin tildes', async () => {
		const { saveObject } = await import('$lib/server/objects/save.js');
		await saveObject(
			t.db,
			{ type: 'perfil', slug: 'cafe-inventado', title: 'Café Inventado', data: { kind: 'lugar' } },
			{ actor: 'admin-prueba' }
		);
		await t.db
			.prepare(
				`INSERT INTO discount_codes (code, kind, value, event_slug, active, created_at, created_by)
				VALUES ('CAFE10', 'percent', 10, NULL, 1, 1, 'admin')`
			)
			.run();
		const r = await searchDatabase(t.db, 'CAFÉ');
		expect(r.profiles.map((p) => p.title)).toEqual(['Café Inventado']);
		expect(r.codes.map((c) => c.title)).toEqual(['CAFE10']);
		expect((await searchDatabase(t.db, 'cafe10')).codes[0].exact).toBe(true);
	});

	it('primero lo que mejor coincide, después lo más nuevo; `exact` si es igual', async () => {
		await insertOrder(t.db, { name: 'Mariana Prueba', email: 'm1@example.com', created: 3000 });
		await insertOrder(t.db, { name: 'Ana', email: 'm2@example.com', created: 1000 });
		await insertOrder(t.db, { name: 'Ana Inventada', email: 'm3@example.com', created: 2000 });
		const r = await searchDatabase(t.db, 'ANA');
		expect(r.orders.map((o) => o.title.split(' · ')[1])).toEqual([
			'Ana',
			'Ana Inventada',
			'Mariana Prueba'
		]);
		expect(r.orders.map((o) => o.exact ?? false)).toEqual([true, false, false]);
		expect(r.people[0]).toMatchObject({ title: 'Ana', exact: true });
		// Una referencia KV-… o un código de entrada cuentan como iguales.
		const id = await insertOrder(t.db, { id: 'abcdef12-0000-4000-8000-000000000009' });
		const byRef = await searchDatabase(t.db, 'KV-ABCDEF12');
		expect(byRef.orders).toEqual([expect.objectContaining({ id: `order:${id}`, exact: true })]);
	});

	it('trae como mucho MAX_CANDIDATES filas por consulta', () => {
		expect(MAX_CANDIDATES).toBeGreaterThanOrEqual(500);
	});
});
