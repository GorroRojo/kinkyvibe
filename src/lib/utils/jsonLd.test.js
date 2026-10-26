import { describe, expect, it } from 'vitest';
import { ORG_CONTACT_EMAIL } from './organization.js';
import {
	ORGANIZATION_ID,
	OFFICIAL_PROFILES,
	WEBSITE_ID,
	absoluteUrl,
	authorLinksFrom,
	eventSchema,
	isoDate,
	kinkipediaSchema,
	materialSchema,
	materialType,
	organizationSchema,
	profileSchema,
	tagTermSchema,
	plainTagDescription,
	websiteSchema,
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
		// Un Date (el fin calculado de un evento) va en hora de Argentina, como `startDate`.
		expect(isoDate(new Date('2031-08-01T23:00:00Z'))).toBe('2031-08-01T20:00:00-03:00');
		expect(isoDate(Date.UTC(2031, 7, 1, 23))).toBe('2031-08-01T20:00:00-03:00');
		expect(isoDate(new Date(NaN))).toBeUndefined();
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

describe('websiteSchema', () => {
	it('es un WebSite con el nombre del sitio, otros nombres y la organización como editora', () => {
		const w = roundTrip(websiteSchema());
		expect(w['@type']).toBe('WebSite');
		expect(w['@id']).toBe(WEBSITE_ID);
		expect(w.name).toBe('Kinky Vibe');
		expect(w.alternateName).toEqual(['KinkyVibe', 'kinkyvibe.ar']);
		expect(w.url).toBe('https://kinkyvibe.ar');
		expect(w.inLanguage).toBe('es-AR');
		expect(w.publisher['@id']).toBe(ORGANIZATION_ID);
		expect(w.potentialAction).toBeUndefined();
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
		expect(notyet.offers.validFrom).toBe('2031-06-30T21:00:00-03:00');
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
			priceCurrency: 'ARS',
			availability: 'https://schema.org/InStock'
		});
		expect(
			eventSchema({ meta: EVENT, webLink: 'https://example.com', past: true }).offers
		).toBeUndefined();
	});

	it('el link de inscripción: la disponibilidad sale del estado del evento', () => {
		const offer = (/** @type {string | undefined} */ status) =>
			eventSchema({ meta: { ...EVENT, status }, webLink: 'https://example.com/i' }).offers;
		expect(offer('abierto').availability).toBe('https://schema.org/InStock');
		expect(offer('agotadas').availability).toBe('https://schema.org/SoldOut');
		expect(offer('anunciado').availability).toBeUndefined();
		expect(offer(undefined).availability).toBeUndefined();
	});

	it('el fin calculado (un Date) va en -03:00, como el comienzo', () => {
		const e = eventSchema({
			meta: { ...EVENT, end: undefined },
			end: new Date('2031-08-02T02:00:00Z')
		});
		expect(e.endDate).toBe('2031-08-01T23:00:00-03:00');
	});

	it('organizer con perfil público: su url y su tipo; sin perfil, solo el nombre', () => {
		const e = roundTrip(
			eventSchema({
				meta: {
					...EVENT,
					authors: ['KinkyVibe', 'Persona Inventada', 'Proyecto Inventado', 'Sin Perfil']
				},
				authorLinks: [
					{ name: 'Persona Inventada', path: '/amigues/Persona-Inventada', kind: 'persona' },
					{ name: 'Proyecto Inventado', path: '/amigues/Proyecto-Inventado', kind: 'proyecto' }
				]
			})
		);
		expect(e.organizer[0]['@id']).toBe(ORGANIZATION_ID);
		expect(e.organizer[1]).toEqual({
			'@type': 'Person',
			'@id': 'https://kinkyvibe.ar/amigues/Persona-Inventada#perfil',
			name: 'Persona Inventada',
			url: 'https://kinkyvibe.ar/amigues/Persona-Inventada'
		});
		expect(e.organizer[2]['@type']).toBe('Organization');
		expect(e.organizer[2].url).toBe('https://kinkyvibe.ar/amigues/Proyecto-Inventado');
		expect(e.organizer[3]).toEqual({ '@type': 'Person', name: 'Sin Perfil' });
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
		expect(m.inLanguage).toBe('es-AR');
		expect(m.datePublished).toBe('2030-01-02');
		expect(m.keywords).toBe('web, BDSM');
	});
	it('descargable: Article y DigitalDocument, con headline; interactivo: CreativeWork', () => {
		expect(materialType(['descargable'])).toBe('DigitalDocument');
		expect(materialType(['interactivo'])).toBe('CreativeWork');
		const d = materialSchema({ ...MAT, tags: ['descargable'] });
		expect(d['@type']).toEqual(['Article', 'DigitalDocument']);
		expect(d.headline).toBe(MAT.title);
		expect(d.name).toBe(MAT.title);
		expect(materialSchema({ ...MAT, tags: ['interactivo'] })['@type']).toBe('CreativeWork');
	});
	it('autore con perfil público: su url', () => {
		const m = materialSchema(MAT, [
			{ name: 'Persona Inventada', path: '/amigues/Persona-Inventada', kind: 'persona' }
		]);
		expect(m.author.url).toBe('https://kinkyvibe.ar/amigues/Persona-Inventada');
	});
});

describe('authorLinksFrom', () => {
	const profile = (/** @type {string} */ slug, kind = 'persona') => ({
		path: `/amigues/${slug}`,
		meta: { category: 'amigues', postID: slug, kind }
	});
	it('solo les autores con perfil en la lista pública (la que ve cualquiera)', () => {
		const posts = [
			profile('Persona-Inventada'),
			profile('Lugar-Inventado', 'lugar'),
			// Un evento con la misma dirección no es un perfil.
			{ path: '/calendario/Sin-Perfil', meta: { category: 'calendario', postID: 'Sin-Perfil' } }
		];
		expect(
			authorLinksFrom(
				['KinkyVibe', 'Persona Inventada', 'Lugar Inventado', 'Sin Perfil', 'Perfil Oculto'],
				posts
			)
		).toEqual([
			{ name: 'Persona Inventada', path: '/amigues/Persona-Inventada', kind: 'persona' },
			{ name: 'Lugar Inventado', path: '/amigues/Lugar-Inventado', kind: 'lugar' }
		]);
	});
	it('sin lista o sin autores, nada; el post mismo no es su autore', () => {
		expect(authorLinksFrom(undefined, [profile('A')])).toEqual([]);
		expect(authorLinksFrom(['A'], null)).toEqual([]);
		expect(authorLinksFrom(['A'], [profile('A')], 'A')).toEqual([]);
	});
	it('un lugar como autore: Organization con url y sin @id (allá es un Place)', () => {
		const m = materialSchema({ title: 'X', postID: 'x', authors: ['Lugar Inventado'] }, [
			{ name: 'Lugar Inventado', path: '/amigues/Lugar-Inventado', kind: 'lugar' }
		]);
		expect(m.author).toEqual({
			'@type': 'Organization',
			name: 'Lugar Inventado',
			url: 'https://kinkyvibe.ar/amigues/Lugar-Inventado'
		});
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
	it('una etiqueta sin entrada pero con descripción: DefinedTerm con la descripción en texto', () => {
		const t = roundTrip(
			tagTermSchema({
				title: 'Etiqueta Inventada',
				description: 'Se usa con [[cuerdas]] o [[Bondage:ataduras]]\n en general.',
				path: '/wiki/Etiqueta-Inventada',
				aka: ['inventada']
			})
		);
		expect(t['@type']).toBe('DefinedTerm');
		expect(t.name).toBe('Etiqueta Inventada');
		expect(t.description).toBe('Se usa con cuerdas o ataduras en general.');
		expect(t.url).toBe('https://kinkyvibe.ar/wiki/Etiqueta-Inventada');
		expect(t.alternateName).toEqual(['inventada']);
		expect(t.inDefinedTermSet['@type']).toBe('DefinedTermSet');
	});
	it('una etiqueta sin descripción (o vacía), nada', () => {
		expect(tagTermSchema({ title: 'X', path: '/wiki/X' })).toBeNull();
		expect(tagTermSchema({ title: 'X', description: '  ', path: '/wiki/X' })).toBeNull();
	});
	it('plainTagDescription: los links quedan como su texto, en una línea', () => {
		expect(plainTagDescription('una [[práctica]]')).toBe('una práctica');
		expect(plainTagDescription('[[término:texto]] y  más\nlíneas')).toBe('texto y más líneas');
		expect(plainTagDescription(undefined)).toBe('');
		expect(plainTagDescription(42)).toBe('');
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
	it('el perfil de KinkyVibe es la organización del sitio (mismo @id)', () => {
		const p = profileSchema({
			profile: { title: 'Kinky Vibe', kind: 'proyecto', links: [] },
			canonical: '/amigues/KinkyVibe'
		});
		expect(p.mainEntity['@type']).toBe('Organization');
		expect(p.mainEntity['@id']).toBe(ORGANIZATION_ID);
		// Otro perfil con el mismo nombre no lo es: se decide por la dirección.
		const other = profileSchema({
			profile: { title: 'Kinky Vibe', kind: 'proyecto', links: [] },
			canonical: '/amigues/Otro-Proyecto'
		});
		expect(other.mainEntity['@id']).toBe('https://kinkyvibe.ar/amigues/Otro-Proyecto#perfil');
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
