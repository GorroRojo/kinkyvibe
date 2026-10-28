import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	MAP_LABEL,
	PUBLIC_ICS_PAST_DAYS,
	buildIcsFeed,
	feedLocation,
	icsResponse,
	publicIcsSince
} from './icsFeed.js';
import { DEFAULT_CONTACT_EMAIL } from './tickets.js';
import { MAP_LABEL as PLACE_MAP_LABEL } from './eventPlace.js';
import { DAY, fakeEvent } from '../server/series/fixtures.js';

const NOW = Date.parse('2026-06-01T12:00:00-03:00');

/** Las líneas del .ics desplegadas (el formato corta las largas en 75 caracteres). */
const unfold = (/** @type {string} */ ics) => ics.replace(/\r\n[ \t]/g, '');

describe('buildIcsFeed', () => {
	const posts = [
		fakeEvent('uno', NOW + DAY, ['Picantearla'], {
			title: 'Edición de prueba',
			location: 'Calle Falsa 123',
			status: 'anunciado'
		}),
		fakeEvent('dos', NOW + 2 * DAY, ['Picantearla'], { status: 'cancelado' }),
		fakeEvent('tres', NOW + 3 * DAY, ['Picantearla'], { start: 'sin fecha' })
	];

	it('un VEVENT por evento con fecha, con UID estable, link y nombre del calendario', () => {
		const ics = unfold(buildIcsFeed(posts, { calName: 'Serie de prueba · KinkyVibe' }));
		expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
		expect(ics).toContain('UID:uno@kinkyvibe.ar');
		expect(ics).toContain('SUMMARY:Edición de prueba');
		expect(ics).toContain('URL:https://kinkyvibe.ar/calendario/uno');
		expect(ics).toContain('LOCATION:Calle Falsa 123');
		expect(ics).toContain('STATUS:TENTATIVE');
		expect(ics).toContain('X-WR-CALNAME:Serie de prueba · KinkyVibe');
	});

	it('los cancelados se saltean salvo includeCancelled (y van como CANCELLED)', () => {
		const ics = unfold(buildIcsFeed(posts, { includeCancelled: true }));
		expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
		expect(ics).toContain('STATUS:CANCELLED');
	});

	it('sin dirección: el link del evento (como el calendario general)', () => {
		const ics = unfold(buildIcsFeed([fakeEvent('online', NOW, ['Online'])]));
		expect(ics).toContain('LOCATION:https://kinkyvibe.ar/calendario/online');
	});

	it('dice cada cuánto volver a bajarlo: X-PUBLISHED-TTL y REFRESH-INTERVAL (RFC 7986)', () => {
		for (const ics of [buildIcsFeed(posts), buildIcsFeed([])]) {
			expect(ics).toContain('X-PUBLISHED-TTL:PT1H\r\n');
			expect(ics).toContain('\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n');
			expect(ics.match(/REFRESH-INTERVAL/g)).toHaveLength(1);
		}
	});

	it('`since`: saltea los que terminaron antes (los públicos, los últimos 90 días)', () => {
		const list = [
			fakeEvent('viejo', NOW - 200 * DAY, ['Picantearla']),
			fakeEvent('reciente', NOW - 30 * DAY, ['Picantearla']),
			// empezó antes del límite pero terminó después: va
			fakeEvent('largo', NOW - 91 * DAY, ['Picantearla'], {
				end: new Date(NOW - 89 * DAY).toISOString()
			}),
			fakeEvent('proximo', NOW + DAY, ['Picantearla'])
		];
		const since = publicIcsSince(NOW);
		expect(since).toBe(NOW - PUBLIC_ICS_PAST_DAYS * DAY);
		const trimmed = unfold(buildIcsFeed(list, { since }));
		expect(trimmed).not.toContain('UID:viejo@');
		for (const slug of ['reciente', 'largo', 'proximo']) {
			expect(trimmed).toContain(`UID:${slug}@kinkyvibe.ar`);
		}
		// Sin `since` (el calendario personal), todos.
		expect(unfold(buildIcsFeed(list)).match(/BEGIN:VEVENT/g)).toHaveLength(4);
		// Todos viejos: un calendario vacío válido.
		const empty = buildIcsFeed([list[0]], { since });
		expect(empty).not.toContain('BEGIN:VEVENT');
		expect(empty).toMatch(/END:VCALENDAR\r\n$/);
	});

	it('sin eventos: un calendario vacío válido con nombre', () => {
		const ics = buildIcsFeed([], { calName: 'Vacío' });
		expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
		expect(ics).toContain('X-WR-CALNAME:Vacío');
		expect(ics).not.toContain('BEGIN:VEVENT');
		expect(ics).toMatch(/END:VCALENDAR\r\n$/);
	});

	it('nunca lleva más que la página pública: ni mails de compradores ni datos de entradas', () => {
		const post = fakeEvent('privado', NOW, ['Picantearla'], {
			tickets: [{ id: 'general', price: 1000 }],
			buyer_email: 'persona@example.com'
		});
		const ics = buildIcsFeed([post]);
		expect(ics).not.toContain('persona@example.com');
		expect(ics).not.toContain('general');
	});

	it('el organizador usa el mail del perfil de amigues si lo hay', () => {
		const profile = /** @type {any} */ ({
			path: '/amigues/Org',
			meta: { postID: 'Org', category: 'amigues', email: 'org@example.com' }
		});
		const ev = fakeEvent('x', NOW, ['taller'], { authors: ['Org'] });
		const ics = unfold(buildIcsFeed([ev], { profiles: [profile] }));
		// ics >= 3.12 entrecomilla el CN (quoted-string válido en RFC 5545 §3.2).
		expect(ics).toContain('ORGANIZER;CN="Org":MAILTO:org@example.com');
	});

	it('sin perfil con mail (y en los de Kinky Vibe): el contacto público de la organización', () => {
		const own = fakeEvent('propio', NOW, ['KinkyVibe']);
		const other = fakeEvent('ajeno', NOW, ['taller'], { authors: ['Sin Perfil'] });
		const ics = unfold(buildIcsFeed([own, other]));
		expect(DEFAULT_CONTACT_EMAIL).toBe('kinkyvibe.talleres@gmail.com');
		expect(ics).toContain(`ORGANIZER;CN="Kinky Vibe":MAILTO:${DEFAULT_CONTACT_EMAIL}`);
		expect(ics).toContain(`ORGANIZER;CN="Sin Perfil":MAILTO:${DEFAULT_CONTACT_EMAIL}`);
		expect(ics).not.toContain('kinkyvibe@gmail.com');
	});
});

describe('feedLocation (el punto donde se enchufa la privacidad de lugares, #137)', () => {
	it('hoy: la dirección de texto libre, recortada; vacía → undefined', () => {
		expect(feedLocation({ location: '  Calle Falsa 123 ' })).toBe('Calle Falsa 123');
		expect(feedLocation({ location: '' })).toBeUndefined();
		expect(feedLocation({})).toBeUndefined();
	});
	it('con lugar (#137): manda su privacidad, no el location del .md', () => {
		const meta = { location: 'Calle Falsa 123' };
		expect(feedLocation(meta, { level: 'hidden' })).toBeUndefined();
		expect(feedLocation(meta, { level: 'area', area: 'Palermo', city: 'CABA' })).toBe(
			'Palermo, CABA'
		);
		expect(feedLocation(meta, { level: 'area' })).toBeUndefined();
		expect(feedLocation(meta, { level: 'name', name: 'Lugar de Prueba', href: '/x' })).toBe(
			'Lugar de Prueba'
		);
		expect(
			feedLocation(meta, {
				level: 'public',
				name: 'Lugar de Prueba',
				address: 'Calle Inventada 1',
				href: '/x'
			})
		).toBe('Lugar de Prueba · Calle Inventada 1');
		const ev = fakeEvent('a', NOW, ['x'], { location: 'Calle Falsa 123' });
		const ics = unfold(
			buildIcsFeed([ev], { venues: new Map([[String(ev.meta.postID), { level: 'hidden' }]]) })
		);
		expect(ics).not.toContain('Calle Falsa');
	});
	it('«Sólo dirección»: la dirección sin el nombre del lugar, también en el .ics', () => {
		const meta = { location: 'Calle Falsa 123' };
		/** @type {import('./venues.js').VenueView} */
		const view = {
			level: 'address',
			address: 'Calle Inventada 1',
			area: 'Barrio Inventado',
			city: 'CABA',
			lat: -34.6,
			lng: -58.4
		};
		expect(feedLocation(meta, view)).toBe('Calle Inventada 1, Barrio Inventado, CABA');
		expect(feedLocation(meta, { level: 'address' })).toBeUndefined();
		const ev = fakeEvent('a', NOW, ['x'], { location: 'Calle Falsa 123', location_name: 'Casa' });
		const ics = unfold(buildIcsFeed([ev], { venues: new Map([[String(ev.meta.postID), view]]) }));
		expect(ics).toContain('LOCATION:Calle Inventada 1\\, Barrio Inventado\\, CABA');
		expect(ics).not.toContain('Calle Falsa');
		expect(ics).not.toContain('Casa');
	});
	it('es lo único que pone LOCATION: sin dirección, el nombre del lugar tampoco aparece', () => {
		const ics = unfold(
			buildIcsFeed([fakeEvent('a', NOW, ['x'], { location: undefined, location_name: 'Lugar' })])
		);
		expect(ics).not.toContain('Lugar');
	});
});

describe('icsResponse', () => {
	it('público: caché corta; personal: sin caché compartida ni referrer', () => {
		expect(icsResponse('x').headers.get('cache-control')).toBe('public, max-age=900');
		const r = icsResponse('x', { private: true });
		expect(r.headers.get('cache-control')).toBe('private, no-store');
		expect(r.headers.get('referrer-policy')).toBe('no-referrer');
		expect(r.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
	});
});

describe('«Dónde» con link al mapa (lugar de una sola vez)', () => {
	const post = {
		path: '/calendario/plaza-de-prueba',
		meta: {
			category: 'calendario',
			postID: 'plaza-de-prueba',
			title: 'Merienda de prueba',
			summary: 'Resumen inventado',
			start: '2026-11-07T16:00-03:00',
			status: 'abierto',
			location: 'Plaza de Prueba, frente a la fuente',
			location_map: 'https://www.openstreetmap.org/node/1'
		}
	};
	/** @param {string} text */
	const unfold = (text) => text.replace(/\r?\n[ \t]/g, '');

	it('sin lugar vinculado: LOCATION con el texto y el link al mapa en la descripción', () => {
		const ics = unfold(buildIcsFeed([/** @type {any} */ (post)]));
		expect(ics).toContain('LOCATION:Plaza de Prueba\\, frente a la fuente');
		expect(ics).toContain('Ver en el mapa: https://www.openstreetmap.org/node/1');
	});

	it('con lugar vinculado, manda el lugar: sin el link del .md', () => {
		const ics = unfold(
			buildIcsFeed([/** @type {any} */ (post)], {
				venues: new Map([
					['plaza-de-prueba', /** @type {any} */ ({ level: 'name', name: 'Lugar de Prueba' })]
				])
			})
		);
		expect(ics).toContain('LOCATION:Lugar de Prueba');
		expect(ics).not.toContain('openstreetmap');
	});

	it('un link que no sirve no entra al calendario', () => {
		const bad = { ...post, meta: { ...post.meta, location_map: 'https://ejemplo.com/x' } };
		const ics = unfold(buildIcsFeed([/** @type {any} */ (bad)]));
		expect(ics).not.toContain('ejemplo.com');
		expect(ics).not.toContain('Ver en el mapa');
	});
});

describe('la página del evento no baja el paquete ics', () => {
	it('MAP_LABEL es el mismo texto en eventPlace.js y en icsFeed.js', () => {
		expect(MAP_LABEL).toBe('Ver en el mapa');
		expect(MAP_LABEL).toBe(PLACE_MAP_LABEL);
	});

	it('ningún componente importa icsFeed.js ni ics', () => {
		const root = new URL('../../', import.meta.url);
		/** @param {URL} dir @returns {URL[]} */
		const svelteFiles = (dir) =>
			fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
				if (e.isDirectory()) return svelteFiles(new URL(`${e.name}/`, dir));
				return e.name.endsWith('.svelte') ? [new URL(e.name, dir)] : [];
			});
		const importers = svelteFiles(root)
			.filter((f) =>
				/from\s+['"](?:[^'"]*\/icsFeed(?:\.js)?|ics)['"]/.test(fs.readFileSync(f, 'utf8'))
			)
			.map((f) => f.pathname.slice(root.pathname.length));
		expect(importers).toEqual([]);
	});
});
