import { describe, expect, it } from 'vitest';
import tagsFactory from './tags.js';
import { DETAIL_KEYS, mergeTagDetails, splitTagList, withTagDetails } from './tagDetails.js';

/** Una lista como la de la base (recordsToRawTags), con datos inventados. */
const raw = () => [
	{ id: 'root', children: ['inventada', 'otra'] },
	{
		id: 'inventada',
		visible_name: 'Etiqueta Inventada',
		icon: '🧪',
		color: 'darkblue',
		description: 'Una descripción con [[otra]].',
		image: 'inventada.webp',
		children: ['hija'],
		related: ['otra']
	},
	{ id: 'otra', description: 'Otra descripción.' },
	{ id: 'hija' },
	{ id: 'alias inventado', aliasOf: 'inventada' }
];

describe('splitTagList', () => {
	it('saca descripción, relacionadas e imagen del árbol, y los devuelve aparte por id', () => {
		const { slim, details } = splitTagList(raw());
		for (const t of slim) for (const k of DETAIL_KEYS) expect(t).not.toHaveProperty(k);
		expect(slim.find((t) => t.id == 'inventada')).toEqual({
			id: 'inventada',
			visible_name: 'Etiqueta Inventada',
			icon: '🧪',
			color: 'darkblue',
			children: ['hija']
		});
		expect(details).toEqual({
			inventada: {
				description: 'Una descripción con [[otra]].',
				image: 'inventada.webp',
				related: ['otra']
			},
			otra: { description: 'Otra descripción.' }
		});
	});

	it('es el mismo objeto para la misma lista, y no la toca', () => {
		const list = raw();
		const copy = structuredClone(list);
		expect(splitTagList(list)).toBe(splitTagList(list));
		expect(list).toEqual(copy);
	});

	it('juntando las dos partes vuelve la lista completa: el mismo árbol de antes', () => {
		const list = raw();
		const { slim, details } = splitTagList(list);
		const merged = mergeTagDetails(slim, details);
		expect(merged).toEqual(list);
		const before = tagsFactory(/** @type {any} */ (structuredClone(list)));
		const after = tagsFactory(/** @type {any} */ (structuredClone(merged)));
		expect(after.get('inventada').parsedDescription).toEqual(
			before.get('inventada').parsedDescription
		);
		expect(after.get('otra').related).toEqual(['inventada']);
		expect(after.get('hija').getColor()).toBe('darkblue');
		expect(after.get('alias inventado').id).toBe('inventada');
	});

	it('el árbol liviano alcanza para los chips: nombre, emoji, color heredado y alias', () => {
		const tm = tagsFactory(/** @type {any} */ (structuredClone(splitTagList(raw()).slim)));
		expect(tm.get('inventada').visible_name).toBe('Etiqueta Inventada');
		expect(tm.get('inventada').icon).toBe('🧪');
		expect(tm.get('hija').getColor()).toBe('darkblue');
		expect(tm.get('alias inventado').id).toBe('inventada');
		expect(tm.get('inventada').getAllChildren()).toEqual(['hija']);
	});
});

describe('withTagDetails', () => {
	it('sin detalles, el árbol liviano; con detalles, la lista completa', () => {
		const list = raw();
		const { slim, details } = splitTagList(list);
		expect(withTagDetails(null, details)).toBeNull();
		const light = withTagDetails(slim, undefined);
		expect(light).toEqual(slim);
		// nada cambió: el mismo objeto (useSiteTags no rearma los stores)
		expect(withTagDetails(slim, undefined)).toBe(light);
		const full = withTagDetails(slim, details);
		expect(full).toEqual(list);
		expect(withTagDetails(slim, details)).toBe(full);
		// una página sin detalles no los saca
		expect(withTagDetails(slim, null)).toBe(full);
		// los mismos detalles en otro objeto (otra página): el mismo árbol
		expect(withTagDetails(slim, structuredClone(details))).toBe(full);
	});

	it('un detalle que cambió rearma el árbol; otra lista empieza de nuevo', () => {
		const { slim, details } = splitTagList(raw());
		const full = withTagDetails(slim, details);
		const edited = { ...details, otra: { description: 'Editada.' } };
		const next = withTagDetails(slim, edited);
		expect(next).not.toBe(full);
		expect(next?.find((t) => t.id == 'otra')?.description).toBe('Editada.');
		const other = splitTagList(raw()).slim;
		expect(withTagDetails(other, undefined)).toEqual(other);
	});
});
