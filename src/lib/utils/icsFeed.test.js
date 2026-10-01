import { describe, expect, it } from 'vitest';
import { buildIcsFeed, feedLocation, icsResponse } from './icsFeed.js';
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
		expect(ics).toContain('ORGANIZER;CN=Org:MAILTO:org@example.com');
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
