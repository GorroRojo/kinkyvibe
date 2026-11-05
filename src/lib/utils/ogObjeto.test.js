/**
 * La vista previa de un objeto sin imagen (ogObjeto.js): qué va en la imagen de cada tipo (sin
 * nada que la página no muestre a alguien sin cuenta), el hash de la dirección y el reparto del
 * lugar entre el título y el resumen. El dibujo de verdad (satori + resvg) lo prueba
 * src/lib/server/ogRender.test.js. Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import {
	OBJECT_CARD_COLORS,
	OBJECT_CARD_KINDS,
	categoryTileLook,
	eventCardDate,
	eventCardSpec,
	isObjectCardKind,
	materialCardSpec,
	materialIcon,
	objectCardAlt,
	objectCardHash,
	objectCardImage,
	objectCardLayout,
	objectCardPath,
	objectCardTree,
	profileCardSpec,
	wikiCardSpec
} from './ogObjeto.js';
import { venueView } from './venues.js';

/**
 * Una medida de mentira: cada letra ocupa media vez el tamaño de la letra.
 * @param {string} text
 * @param {Record<string, any>} style
 */
const fakeMeasure = async (text, style) =>
	Math.max(1, Math.ceil((text.length * style.fontSize * 0.5) / style.width));

const EVENT = Object.freeze({
	title: 'Taller Inventado',
	start: '2026-11-12T21:00-03:00',
	status: 'abierto',
	summary: '  Un taller   inventado\npara las pruebas. ',
	location_name: 'Galpón de Prueba',
	tags: ['taller']
});

describe('tipos', () => {
	it('evento, material, perfil y wiki; nada más', () => {
		expect(OBJECT_CARD_KINDS).toEqual(['evento', 'material', 'perfil', 'wiki']);
		expect(isObjectCardKind('evento')).toBe(true);
		expect(isObjectCardKind('default')).toBe(false);
		expect(isObjectCardKind('__proto__')).toBe(false);
	});
});

describe('eventCardDate', () => {
	it('el mes, el día y «Jueves · 21:00», a la argentina', () => {
		expect(eventCardDate('2026-11-12T21:00-03:00')).toEqual({
			month: 'NOV',
			day: '12',
			sub: 'Jueves · 21:00'
		});
		// 01:30 UTC del 13 es el 12 a las 22:30 en la Argentina
		expect(eventCardDate('2026-11-13T01:30:00Z')).toEqual({
			month: 'NOV',
			day: '12',
			sub: 'Jueves · 22:30'
		});
	});

	it('un evento con solo el día: ese día, sin hora', () => {
		expect(eventCardDate('2026-09-05')).toEqual({ month: 'SEP', day: '5', sub: 'Sábado' });
	});

	it('sin fecha que se pueda leer: ninguna', () => {
		expect(eventCardDate(undefined)).toBeNull();
		expect(eventCardDate('')).toBeNull();
		expect(eventCardDate('mañana')).toBeNull();
	});
});

describe('eventCardSpec', () => {
	it('presencial: «Evento», el lugar debajo del título y el resumen en una línea', () => {
		expect(eventCardSpec({ meta: EVENT, tagNames: ['Taller', 'Cuerdas'] })).toEqual({
			kind: 'evento',
			label: 'Evento',
			title: 'Taller Inventado',
			meta: 'Galpón de Prueba',
			summary: 'Un taller inventado para las pruebas.',
			tags: ['Taller', 'Cuerdas'],
			icon: 'calendar-range',
			date: { month: 'NOV', day: '12', sub: 'Jueves · 21:00' }
		});
	});

	it('online: «Evento · Online», sin repetirlo abajo', () => {
		const spec = eventCardSpec({
			meta: { ...EVENT, location_name: undefined, modalidad: 'online', tags: ['Online'] }
		});
		expect(spec.label).toBe('Evento · Online');
		expect(spec.meta).toBe('');
	});

	it('cancelado: lo dice arriba', () => {
		expect(eventCardSpec({ meta: { ...EVENT, status: 'cancelado' } }).label).toBe(
			'Evento · Cancelado'
		);
	});

	it('con lugar vinculado: solo lo que deja ver su nivel, nunca la dirección escondida', () => {
		const place = {
			title: 'Galpón Escondido',
			data: { address: 'Calle Secreta 99', area: 'Barrio Inventado', city: 'Ciudad de Prueba' }
		};
		const hidden = venueView(place, 'area', '/amigues/galpon-escondido');
		const spec = eventCardSpec({ meta: EVENT, venue: hidden });
		expect(JSON.stringify(spec)).not.toContain('Calle Secreta');
		expect(JSON.stringify(spec)).not.toContain('Galpón de Prueba');
		expect(spec.meta).toContain('Barrio Inventado');
	});

	it('hasta 3 etiquetas, sin repetidas ni vacías; el resumen, como mucho 600 letras', () => {
		const spec = eventCardSpec({
			meta: { ...EVENT, summary: 'palabra '.repeat(200) },
			tagNames: ['a', 'a', '', 'b', 'c', 'd']
		});
		expect(spec.tags).toEqual(['a', 'b', 'c']);
		expect(spec.summary.length).toBeLessThanOrEqual(600);
	});
});

describe('materialCardSpec', () => {
	const tagManager = { get: (/** @type {string} */ id) => ({ id, visible_name: id }) };

	it('qué es (por el formato y «descargable») y el ícono de la lista', () => {
		const spec = materialCardSpec({
			meta: { title: 'Guía Inventada', summary: 'Para probar.', tags: ['guía', 'descargable'] },
			tagManager,
			tagNames: ['seguridad']
		});
		expect(spec).toMatchObject({
			kind: 'material',
			label: 'Material · Guía descargable',
			title: 'Guía Inventada',
			summary: 'Para probar.',
			tags: ['seguridad'],
			icon: 'download',
			date: null
		});
	});

	it('sin formato: «Material» solo', () => {
		expect(materialCardSpec({ meta: { title: 'X', tags: [] } }).label).toBe('Material');
	});

	it('el ícono: pago, descargable, interactivo, video o el libro', () => {
		expect(materialIcon(['pago', 'descargable'])).toBe('shopping-cart');
		expect(materialIcon(['descargable'])).toBe('download');
		expect(materialIcon(['interactivo'])).toBe('mouse-pointer-click');
		expect(materialIcon(['video'])).toBe('video');
		expect(materialIcon(['guía', 'artículo'])).toBe('book-open');
	});
});

describe('profileCardSpec y wikiCardSpec', () => {
	it('un perfil: «Amigues · Lugar», la presentación y el corazón', () => {
		expect(
			profileCardSpec({ title: 'Lugar Inventado', kind: 'lugar', bio: 'Un lugar.', tagNames: [] })
		).toEqual({
			kind: 'perfil',
			label: 'Amigues · Lugar',
			title: 'Lugar Inventado',
			meta: '',
			summary: 'Un lugar.',
			tags: [],
			icon: 'heart',
			date: null
		});
		expect(profileCardSpec({ title: 'X', kind: 'raro' }).label).toBe('Amigues');
	});

	it('una entrada de la Kinkipedia: el término, su resumen y el globo', () => {
		expect(wikiCardSpec({ title: 'Término', summary: 'Qué es.' })).toEqual({
			kind: 'wiki',
			label: 'Kinkipedia',
			title: 'Término',
			meta: '',
			summary: 'Qué es.',
			tags: [],
			icon: 'globe',
			date: null
		});
	});
});

describe('hash, dirección y texto alternativo', () => {
	it('16 caracteres hexadecimales; cambia si cambia algo de lo que se dibuja', async () => {
		const a = eventCardSpec({ meta: EVENT });
		const hash = await objectCardHash(a);
		expect(hash).toMatch(/^[0-9a-f]{16}$/);
		expect(await objectCardHash(eventCardSpec({ meta: EVENT }))).toBe(hash);
		for (const change of [
			{ title: 'Otro título' },
			{ start: '2026-11-13T21:00-03:00' },
			{ location_name: 'Otro lugar' },
			{ summary: 'Otro resumen' },
			{ status: 'cancelado' }
		]) {
			expect(await objectCardHash(eventCardSpec({ meta: { ...EVENT, ...change } }))).not.toBe(hash);
		}
	});

	it('la dirección lleva el tipo, la dirección del objeto (codificada) y el hash', () => {
		expect(objectCardPath('wiki', 'Picantearla: Age Play', '0123456789abcdef')).toBe(
			'/og/objeto/wiki/Picantearla%3A%20Age%20Play/0123456789abcdef.jpg'
		);
	});

	it('la imagen para SeoHead: dirección, 1200 × 630 y lo que se lee', async () => {
		const spec = eventCardSpec({ meta: EVENT });
		const image = await objectCardImage('evento', 'taller-inventado', spec);
		expect(image).toEqual({
			url: `/og/objeto/evento/taller-inventado/${await objectCardHash(spec)}.jpg`,
			width: 1200,
			height: 630,
			alt: 'Taller Inventado · Evento (kinkyvibe.ar)'
		});
		expect(objectCardAlt({ title: 'Bottom', label: 'Kinkipedia' })).toBe(
			'Bottom · Kinkipedia (kinkyvibe.ar)'
		);
		expect(await objectCardImage('evento', 'x', { ...spec, title: '' })).toBeNull();
		expect(await objectCardImage('evento', '', spec)).toBeNull();
	});
});

describe('objectCardLayout: el resumen usa el lugar que hay', () => {
	it('título corto: grande, y el resumen entero aunque sea largo', async () => {
		const spec = wikiCardSpec({ title: 'Bottom', summary: 'x'.repeat(250) });
		const layout = await objectCardLayout(spec, fakeMeasure);
		expect(layout.titleSize).toBe(104);
		expect(layout.clampTitle).toBe(false);
		expect(layout.summaryLines).toBe(await fakeMeasure(spec.summary, { fontSize: 29, width: 660 }));
		expect(layout.summaryLines).toBeGreaterThan(2);
	});

	it('resumen que no entra: el título se achica para dejar al menos 3 líneas, y se corta ahí', async () => {
		const spec = materialCardSpec({
			meta: { title: 'Consejos para algo inventado', summary: 'y'.repeat(2000), tags: [] }
		});
		const layout = await objectCardLayout(spec, fakeMeasure);
		expect(layout.summaryLines).toBeGreaterThanOrEqual(3);
		expect(layout.summaryLines).toBeLessThan(
			await fakeMeasure(spec.summary, { fontSize: 29, width: 660 })
		);
	});

	it('título muy largo: entra entero (sin cortar) aunque quede una línea de resumen', async () => {
		const spec = eventCardSpec({
			meta: { ...EVENT, title: 'z'.repeat(91), summary: 'w'.repeat(160) }
		});
		const layout = await objectCardLayout(spec, fakeMeasure);
		expect(layout.clampTitle).toBe(false);
		expect(layout.summaryLines).toBeGreaterThanOrEqual(1);
	});

	it('un título que no entra ni chico: se corta en 4 líneas', async () => {
		const spec = wikiCardSpec({ title: 'q'.repeat(500) });
		const layout = await objectCardLayout(spec, fakeMeasure);
		expect(layout).toMatchObject({ titleSize: 44, clampTitle: true });
	});

	it('sin resumen: ninguna línea', async () => {
		const layout = await objectCardLayout(profileCardSpec({ title: 'Perfil' }), fakeMeasure);
		expect(layout.summaryLines).toBe(0);
	});
});

describe('objectCardTree', () => {
	/** Los nodos del árbol, aplanados. @param {any} node @returns {any[]} */
	const nodes = (node) => [
		node,
		...[node.props?.children ?? []].flat().flatMap((c) => (typeof c === 'object' ? nodes(c) : []))
	];

	it('el título sin lineClamp si entra (con textWrap: balance, lineClamp lo partiría de más)', async () => {
		const spec = eventCardSpec({ meta: EVENT, tagNames: ['Taller'] });
		const tree = await objectCardTree(spec, {
			logo: 'data:image/png;base64,AA==',
			measure: fakeMeasure
		});
		const title = nodes(tree).find((n) => n.props.children === 'Taller Inventado');
		expect(title.props.style.textWrap).toBe('balance');
		expect(title.props.style).not.toHaveProperty('lineClamp');
		const json = JSON.stringify(tree);
		for (const s of [
			'EVENTO',
			'NOV',
			'12',
			'Jueves · 21:00',
			'Galpón de Prueba',
			'Taller',
			'kinkyvibe.ar'
		])
			expect(json).toContain(s);
	});

	it('sin fecha (o fuera de un evento): el símbolo como SVG', async () => {
		const tree = await objectCardTree(wikiCardSpec({ title: 'Bottom', summary: 'Qué es.' }), {
			logo: 'data:image/png;base64,AA==',
			measure: fakeMeasure
		});
		const icon = nodes(tree).find(
			(n) => n.type === 'img' && n.props.src.startsWith('data:image/svg')
		);
		expect(icon).toBeTruthy();
		expect(atob(icon.props.src.split(',')[1])).toContain('<circle cx="12" cy="12" r="10"/>');
	});
});

describe('categoryTileLook (la ficha sin imagen del carrusel de la portada)', () => {
	/** @param {string} src */
	const svg = (src) => atob(src.replace('data:image/svg+xml;base64,', ''));
	it('el color y el símbolo de cada tipo, los de la vista previa', () => {
		const material = categoryTileLook('material', ['descargable']);
		expect(material?.bg).toBe(OBJECT_CARD_COLORS.teal);
		expect(material?.ink).toBe(OBJECT_CARD_COLORS.tealDark);
		// el símbolo de descargar (la flecha hacia abajo de Lucide)
		expect(svg(String(material?.icon))).toContain('M12 15V3');
		expect(svg(String(categoryTileLook('material', ['pago'])?.icon))).toContain('circle');
		const perfil = categoryTileLook('amigues');
		expect(perfil?.bg).toBe(OBJECT_CARD_COLORS.yellow);
		expect(perfil?.icon).toMatch(/^data:image\/svg\+xml;base64,/);
		const wiki = categoryTileLook('wiki');
		expect(wiki?.bg).toBe('white');
		expect(wiki?.ink).toBe(OBJECT_CARD_COLORS.violet);
	});
	it('un evento (u otra cosa) no tiene ficha', () => {
		expect(categoryTileLook('calendario')).toBeNull();
		expect(categoryTileLook('')).toBeNull();
	});
});
