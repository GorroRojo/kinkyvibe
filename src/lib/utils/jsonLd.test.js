import { describe, expect, it } from 'vitest';
import { ORG_CONTACT_EMAIL } from './organization.js';
import {
	ORGANIZATION_ID,
	OFFICIAL_PROFILES,
	absoluteUrl,
	eventSchema,
	isoDate,
	kinkipediaSchema,
	materialSchema,
	materialType,
	organizationSchema,
	profileSchema,
	wikiTermSchema
} from './jsonLd.js';
import { jsonForScript } from './escape.js';

/** Lo que de verdad va en la página: el JSON escapado para un <script>, leído de vuelta. */
const roundTrip = (/** @type {unknown} */ o) => JSON.parse(jsonForScript(o));

/** Todas las cadenas de un objeto, para buscar datos que no tienen que estar. */
const allText = (/** @type {unknown} */ o) => JSON.stringify(o);

describe('absoluteUrl', () => {
	it('arma direcciones del sitio y deja las de afuera', () => {
		expect(absoluteUrl('/media/img/a.webp')).toBe('https://kinkyvibe.ar/media/img/a.webp');
		expect(absoluteUrl('https://example.com/x')).toBe('https://example.com/x');
		expect(absoluteUrl('/wiki/sin espacio')).toBe('https://kinkyvibe.ar/wiki/sin%20espacio');
	});
	it('descarta lo vacío, «undefined» y otros esquemas', () => {
		for (const bad of [
			undefined,
			null,
			'',
			'undefined',
			'javascript:alert(1)',
			'//evil.test/x',
			'mailto:a@b.c'
		])
			expect(absoluteUrl(bad)).toBeUndefined();
	});
});

describe('isoDate', () => {
	it('deja las fechas ISO con su zona y descarta las inválidas', () => {
		expect(isoDate('2031-08-01T20:00-03:00')).toBe('2031-08-01T20:00-03:00');
		expect(isoDate(new Date('2031-08-01T23:00:00Z'))).toBe('2031-08-01T23:00:00.000Z');
		expect(isoDate('no es fecha')).toBeUndefined();
		expect(isoDate(undefined)).toBeUndefined();
	});
	it('convierte el formato de publicación del sitio (2024-12-06Z-03:00) en ISO 8601 válido', () => {
		const out = isoDate('2024-12-06Z-03:00');
		expect(out).toBe('2024-12-06T00:00:00-03:00');
		expect(Date.parse(/** @type {string} */ (out))).toBe(Date.parse('2024-12-06T03:00:00Z'));
		expect(isoDate('2030-01-02')).toBe('2030-01-02');
	});
});

describe('organizationSchema', () => {
	it('es una Organization con las redes oficiales y el contacto público', () => {
		const o = roundTrip(organizationSchema());
		expect(o['@context']).toBe('https://schema.org');
		expect(o['@type']).toBe('Organization');
		expect(o['@id']).toBe(ORGANIZATION_ID);
		expect(o.sameAs).toEqual([...OFFICIAL_PROFILES]);
		expect(o.logo).toMatch(/^https:\/\/kinkyvibe\.ar\//);
		expect(o.email).toBe(ORG_CONTACT_EMAIL);
	});
});

const EVENT = {
	title: 'Taller de prueba <script>',
	postID: 'taller-de-prueba-2031-08',
	summary: 'Un taller inventado.',
	start: '2031-08-01T20:00-03:00',
	end: '2031-08-01T23:00-03:00',
	tags: ['KinkyVibe', 'pago'],
	authors: ['KinkyVibe', 'Persona Inventada'],
	status: 'abierto',
	featured: '/media/img/afiche.webp'
};

describe('eventSchema', () => {
	it('es un Event completo con oferta de la venta del sitio', () => {
		const e = roundTrip(
			eventSchema({
				meta: EVENT,
				tickets: { open: true, reason: null, priceFrom: 8000, opensAt: null, slug: EVENT.postID }
			})
		);
		expect(e['@type']).toBe('Event');
		expect(e.name).toBe(EVENT.title);
		expect(e.url).toBe('https://kinkyvibe.ar/calendario/taller-de-prueba-2031-08');
		expect(e.startDate).toBe(EVENT.start);
		expect(e.endDate).toBe(EVENT.end);
		expect(e.eventStatus).toBe('https://schema.org/EventScheduled');
		expect(e.image).toEqual(['https://kinkyvibe.ar/media/img/afiche.webp']);
		expect(e.organizer[0]['@id']).toBe(ORGANIZATION_ID);
		expect(e.organizer[1]).toEqual({ '@type': 'Person', name: 'Persona Inventada' });
		expect(e.offers).toEqual({
			'@type': 'Offer',
			url: 'https://kinkyvibe.ar/calendario/taller-de-prueba-2031-08/entradas',
			price: 8000,
			priceCurrency: 'ARS',
			availability: 'https://schema.org/InStock'
		});
	});

	it('escapa el texto para que no cierre el <script>', () => {
		const json = jsonForScript(eventSchema({ meta: EVENT }));
		expect(json).not.toContain('<script>');
		expect(JSON.parse(json).name).toBe(EVENT.title);
	});

	it('sin imagen no deja «undefined», y cancelado no tiene oferta', () => {
		const e = roundTrip(
			eventSchema({
				meta: { ...EVENT, featured: undefined, status: 'cancelado' },
				tickets: { open: true, priceFrom: 1 }
			})
		);
		expect(e.image).toBeUndefined();
		expect(allText(e)).not.toContain('undefined');
		expect(e.eventStatus).toBe('https://schema.org/EventCancelled');
		expect(e.offers).toBeUndefined();
	});

	it('agotadas y todavía no a la venta', () => {
		const soldout = eventSchema({
			meta: EVENT,
			tickets: { open: false, reason: 'soldout', priceFrom: 5 }
		});
		expect(soldout.offers.availability).toBe('https://schema.org/SoldOut');
		const opensAt = Date.UTC(2031, 6, 1);
		const notyet = eventSchema({
			meta: EVENT,
			tickets: { open: false, reason: 'notyet', priceFrom: 5, opensAt }
		});
		expect(notyet.offers.availability).toBe('https://schema.org/PreOrder');
		expect(notyet.offers.validFrom).toBe(new Date(opensAt).toISOString());
	});

	it('el link de inscripción como oferta; gratis, precio 0', () => {
		const e = eventSchema({
			meta: { ...EVENT, tags: ['gratis'] },
			webLink: 'https://example.com/inscripcion'
		});
		expect(e.offers).toEqual({
			'@type': 'Offer',
			url: 'https://example.com/inscripcion',
			price: 0,
			priceCurrency: 'ARS'
		});
		expect(
			eventSchema({ meta: EVENT, webLink: 'https://example.com', past: true }).offers
		).toBeUndefined();
	});

	it('el lugar oculto no sale; el de solo zona, sin dirección', () => {
		const hidden = eventSchema({ meta: EVENT, venue: { level: 'hidden' } });
		expect(hidden.location).toBeUndefined();
		const area = roundTrip(
			eventSchema({ meta: EVENT, venue: { level: 'area', area: 'Barrio Inventado', city: 'CABA' } })
		);
		expect(area.location).toEqual({ '@type': 'Place', name: 'Barrio Inventado, CABA' });
		expect(area.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode');
	});

	it('online: VirtualLocation', () => {
		const e = eventSchema({
			meta: { ...EVENT, location: 'Online' },
			webLink: 'https://example.com/sala'
		});
		expect(e.eventAttendanceMode).toBe('https://schema.org/OnlineEventAttendanceMode');
		expect(e.location['@type']).toBe('VirtualLocation');
	});
});

describe('materialSchema', () => {
	const MAT = {
		title: 'Guía inventada',
		postID: 'guia-inventada',
		summary: 'Una guía de prueba.',
		tags: ['web', 'BDSM'],
		authors: ['Persona Inventada'],
		published_date: '2030-01-02',
		featured: '/media/img/tapa.webp'
	};
	it('Article con autore, editorial y fechas', () => {
		const m = roundTrip(materialSchema(MAT));
		expect(m['@type']).toBe('Article');
		expect(m.headline).toBe(MAT.title);
		expect(m.url).toBe('https://kinkyvibe.ar/material/guia-inventada');
		expect(m.author).toEqual({ '@type': 'Person', name: 'Persona Inventada' });
		expect(m.publisher['@id']).toBe(ORGANIZATION_ID);
		expect(m.datePublished).toBe('2030-01-02');
		expect(m.keywords).toBe('web, BDSM');
	});
	it('descargable: DigitalDocument (sin headline); interactivo: CreativeWork', () => {
		expect(materialType(['descargable'])).toBe('DigitalDocument');
		expect(materialType(['interactivo'])).toBe('CreativeWork');
		const d = materialSchema({ ...MAT, tags: ['descargable'] });
		expect(d['@type']).toBe('DigitalDocument');
		expect(d.headline).toBeUndefined();
		expect(d.name).toBe(MAT.title);
	});
});

describe('Kinkipedia', () => {
	it('DefinedTermSet en /wiki', () => {
		const s = roundTrip(kinkipediaSchema());
		expect(s['@type']).toBe('DefinedTermSet');
		expect(s.url).toBe('https://kinkyvibe.ar/wiki');
	});
	it('DefinedTerm con su conjunto y sus otros nombres', () => {
		const t = roundTrip(
			wikiTermSchema({
				title: 'Bondage',
				summary: 'Restringir el movimiento.',
				path: '/wiki/bondage',
				aka: ['ataduras', 'Bondage']
			})
		);
		expect(t['@type']).toBe('DefinedTerm');
		expect(t.name).toBe('Bondage');
		expect(t.description).toBe('Restringir el movimiento.');
		expect(t.url).toBe('https://kinkyvibe.ar/wiki/bondage');
		expect(t.alternateName).toEqual(['ataduras']);
		expect(t.inDefinedTermSet['@type']).toBe('DefinedTermSet');
		// DefinedTerm no es CreativeWork: sin inLanguage.
		expect(t.inLanguage).toBeUndefined();
	});
	it('sin entrada, nada', () => {
		expect(wikiTermSchema({ title: undefined, path: '/wiki/x' })).toBeNull();
	});
});

describe('profileSchema', () => {
	const PERSON = {
		title: 'Persona Inventada',
		kind: 'persona',
		bio: 'Bio de prueba.',
		image: '/media/img/cara.webp',
		links: ['https://example.com/yo', 'javascript:alert(1)'],
		email: 'persona@example.com',
		tel: '+54 11 0000-0000',
		publishedDate: '2030-01-01'
	};
	it('persona: ProfilePage con Person y solo su contacto público', () => {
		const p = roundTrip(
			profileSchema({ profile: PERSON, canonical: '/amigues/Persona-Inventada' })
		);
		expect(p['@type']).toBe('ProfilePage');
		expect(p.url).toBe('https://kinkyvibe.ar/amigues/Persona-Inventada');
		const e = p.mainEntity;
		expect(e['@type']).toBe('Person');
		expect(e.name).toBe('Persona Inventada');
		expect(e.sameAs).toEqual(['https://example.com/yo']);
		expect(e.email).toBe('persona@example.com');
		expect(e.telephone).toBe('+541100000000');
		expect(allText(p)).not.toContain('javascript:');
	});
	it('proyecto: Organization; sin contacto, sin esos campos', () => {
		const p = profileSchema({
			profile: { title: 'Proyecto Inventado', kind: 'proyecto', links: [], email: null, tel: null },
			canonical: '/amigues/Proyecto-Inventado'
		});
		expect(p.mainEntity['@type']).toBe('Organization');
		expect(p.mainEntity.email).toBeUndefined();
		expect(p.mainEntity.telephone).toBeUndefined();
		expect(p.mainEntity.sameAs).toBeUndefined();
	});
	it('lugar con la dirección oculta: sin dirección ni coordenadas', () => {
		const p = profileSchema({
			profile: { title: 'Lugar Inventado', kind: 'lugar' },
			canonical: '/amigues/Lugar-Inventado',
			location: { level: 'hidden' }
		});
		expect(p.mainEntity['@type']).toBe('Place');
		expect(p.mainEntity.address).toBeUndefined();
		expect(p.mainEntity.geo).toBeUndefined();
	});
	it('lugar de solo nombre o solo zona: sin calle', () => {
		const name = profileSchema({
			profile: { title: 'Lugar Inventado', kind: 'lugar' },
			canonical: '/amigues/Lugar-Inventado',
			location: { level: 'name', name: 'Lugar Inventado' }
		});
		expect(name.mainEntity.address).toBeUndefined();
		const area = profileSchema({
			profile: { title: 'Lugar Inventado', kind: 'lugar' },
			canonical: '/amigues/Lugar-Inventado',
			location: { level: 'area', area: 'Barrio Inventado', city: 'CABA' }
		});
		expect(area.mainEntity.address).toEqual({
			'@type': 'PostalAddress',
			addressLocality: 'Barrio Inventado, CABA',
			addressCountry: 'AR'
		});
	});
	it('lugar público: dirección y coordenadas (las que muestra el mapa)', () => {
		const p = profileSchema({
			profile: { title: 'Lugar Inventado', kind: 'lugar', email: 'lugar@example.com' },
			canonical: '/amigues/Lugar-Inventado',
			location: {
				level: 'public',
				name: 'Lugar Inventado',
				address: 'Calle Falsa 123',
				city: 'CABA',
				lat: -34.6,
				lng: -58.4
			}
		});
		expect(p.mainEntity.address.streetAddress).toBe('Calle Falsa 123');
		expect(p.mainEntity.geo).toEqual({
			'@type': 'GeoCoordinates',
			latitude: -34.6,
			longitude: -58.4
		});
		// Place no tiene `email` en schema.org.
		expect(p.mainEntity.email).toBeUndefined();
	});
});
