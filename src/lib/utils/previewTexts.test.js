/**
 * Los textos de la vista previa al compartir (src/lib/utils/previewTexts.js): los originales son
 * los que aprobó gorrite (11/10), y lo que se edita en el panel se valida.
 */
import { describe, expect, it } from 'vitest';
import {
	PREVIEW_TEXT_DEFAULTS,
	PREVIEW_TEXT_FIELDS,
	PREVIEW_TEXT_GROUPS,
	SITE_TAGLINE,
	cardSubtitle,
	fillPlaceholder,
	mergePreviewTexts,
	validatePreviewTexts
} from './previewTexts.js';

describe('los textos originales', () => {
	it('son exactamente los aprobados', () => {
		expect(PREVIEW_TEXT_DEFAULTS).toEqual({
			'home.title': 'Kinky Vibe',
			'home.description': 'Educación crítica, cultura transformativa, y comunidad disidente.',
			'home.cardText': 'Educación crítica, cultura transformativa, y comunidad disidente.',
			'calendario.heading': 'Calendario · Próximos talleres, encuentros y eventos cuir y kinky',
			'calendario.description':
				'Talleres, encuentros y eventos de Kinky Vibe y la comunidad, con fecha, lugar y entradas.',
			'calendario.title': 'Calendario',
			'calendario.items': 'Eventos',
			'calendario.cardName': 'Calendario',
			'calendario.upcomingPrefix': 'Próximos:',
			'material.heading': 'Material · Guías, artículos, libros y descargables sobre BDSM y kink',
			'material.description':
				'Guías, artículos, libros, fanzines y descargables sobre BDSM y kink: material inicial para quienes empiezan y por práctica, como cuerdas, impacto o electro.',
			'material.title': 'Material',
			'material.items': 'Material',
			'material.cardName': 'Material',
			'amigues.heading': 'Amigues · Emprendimientos y profesionales de la comunidad',
			'amigues.description':
				'Profesionales, proyectos y lugares cuir y kinky de la comunidad: sesiones, clases, terapia, arte, tiendas y más.',
			'amigues.title': 'Amigues',
			'amigues.items': 'Amigues',
			'amigues.cardName': 'Amigues',
			'todo.heading': 'Todo el contenido · Eventos, material y amigues',
			'todo.description':
				'Todo Kinky Vibe en un mismo lugar: eventos, material y amigues. Filtrá por un tema, como shibari, y encontrá libros, talleres y les profesionales que dan clases.',
			'todo.title': 'Todo el contenido',
			'todo.items': 'Contenido',
			'wiki.title': 'Kinkipedia · Glosario cuir y kinky',
			'wiki.description':
				'Glosario cuir, kinky y BDSM de Kinky Vibe: qué es cada práctica, rol, implemento y término, con su material, eventos y amigues, y las series de encuentros que se repiten.',
			'wiki.cardName': 'Kinkipedia',
			'filtros.oneTag': 'con la etiqueta {x}',
			'filtros.manyTags': 'con las etiquetas {x}',
			'filtros.text': 'que mencionan «{x}»',
			'materialTipo.downloadSuffix': ' descargable',
			'materialTipo.downloadOnly': 'Descargable'
		});
		expect(SITE_TAGLINE).toBe('Educación crítica, cultura transformativa, y comunidad disidente.');
	});

	it('cada uno entra en su largo máximo, es de un grupo y pasa su propia validación', () => {
		const groups = new Set(PREVIEW_TEXT_GROUPS.map((g) => g.id));
		for (const f of PREVIEW_TEXT_FIELDS) {
			expect(f.value.length, f.key).toBeLessThanOrEqual(f.max);
			expect(groups.has(f.group), f.key).toBe(true);
		}
		const all = Object.fromEntries(PREVIEW_TEXT_FIELDS.map((f) => [f.key, f.value]));
		expect(validatePreviewTexts(all)).toEqual({ ok: true, value: {} });
	});

	it('los nombres de las imágenes están marcados', () => {
		expect(PREVIEW_TEXT_FIELDS.filter((f) => f.card).map((f) => f.key)).toEqual([
			'home.cardText',
			'calendario.cardName',
			'material.cardName',
			'amigues.cardName',
			'wiki.cardName'
		]);
	});
});

describe('validatePreviewTexts', () => {
	it('guarda solo los cambiados; vacío o igual al original vuelve al original', () => {
		expect(
			validatePreviewTexts({
				'calendario.description': '  Otra   descripción inventada. ',
				'material.description': '',
				'amigues.title': 'Amigues',
				desconocida: 'nada'
			})
		).toEqual({ ok: true, value: { 'calendario.description': 'Otra descripción inventada.' } });
	});

	it('{x} tiene que quedar, una sola vez y sin otras llaves', () => {
		const r = validatePreviewTexts({
			'filtros.oneTag': 'con la etiqueta',
			'filtros.manyTags': 'con {x} y {x}',
			'filtros.text': 'que dicen {y} {x}'
		});
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(Object.keys(r.errors).sort()).toEqual([
			'filtros.manyTags',
			'filtros.oneTag',
			'filtros.text'
		]);
		expect(r.errors['filtros.oneTag']).toContain('{x}');
		expect(r.values['filtros.oneTag']).toBe('con la etiqueta');
		expect(validatePreviewTexts({ 'filtros.oneTag': 'que tienen {x}' })).toEqual({
			ok: true,
			value: { 'filtros.oneTag': 'que tienen {x}' }
		});
	});

	it('los textos sin {x} no llevan llaves; nada de < >; con su largo máximo', () => {
		const r = validatePreviewTexts({
			'home.title': 'Hola {x}',
			'home.description': 'Algo <b>raro</b>',
			'wiki.cardName': 'x'.repeat(25)
		});
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(Object.keys(r.errors).sort()).toEqual([
			'home.description',
			'home.title',
			'wiki.cardName'
		]);
	});

	it('el sufijo «descargable» guarda su espacio de adelante', () => {
		expect(validatePreviewTexts({ 'materialTipo.downloadSuffix': '  para bajar ' })).toEqual({
			ok: true,
			value: { 'materialTipo.downloadSuffix': ' para bajar' }
		});
	});
});

describe('mergePreviewTexts', () => {
	it('los cambiados sobre los originales; lo desconocido, vacío o inválido se ignora', () => {
		const t = mergePreviewTexts({
			'home.title': 'Otro título',
			'filtros.oneTag': 'sin el lugar',
			'wiki.title': '',
			inventada: 'x',
			'amigues.title': 3
		});
		expect(t['home.title']).toBe('Otro título');
		expect(t['filtros.oneTag']).toBe('con la etiqueta {x}');
		expect(t['wiki.title']).toBe(PREVIEW_TEXT_DEFAULTS['wiki.title']);
		expect(t['amigues.title']).toBe('Amigues');
		expect('inventada' in t).toBe(false);
		expect(mergePreviewTexts(null)).toBe(PREVIEW_TEXT_DEFAULTS);
	});
});

describe('ayudas', () => {
	it('fillPlaceholder y cardSubtitle', () => {
		expect(fillPlaceholder('con la etiqueta {x}', 'terapia')).toBe('con la etiqueta terapia');
		expect(cardSubtitle('Calendario · Próximos · talleres')).toBe('Próximos · talleres');
		expect(cardSubtitle('Sin separador')).toBe('');
	});
});
