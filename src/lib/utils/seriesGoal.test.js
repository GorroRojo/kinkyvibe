/**
 * Meta de venta por defecto de una serie (Eventos → Series): el formulario arma las operaciones,
 * el editor de etiquetas la escribe en el archivo (o en la base) y el tipo `etiqueta` la valida.
 * Los nombres de series son inventados.
 */
import { describe, expect, it } from 'vitest';
import { seriesCreateOps, seriesEditOps } from './seriesAdmin.js';
import { SERIES_PARENT } from './series.js';
import { applyTagOps, emitTagSource, parseTagSource } from './tagConfig.js';
import { recordsToRawTags, tagsToRecords } from '$lib/server/etiquetas/model.js';
import { coreTypes, validateData } from '$lib/server/objects/types/index.js';

const SRC = `export const hardcodedTags = [
	{ id: 'evento recurrente', children: ['Serie Inventada'] },
	{ id: 'Serie Inventada', icon: '🎭' }
];
export default hardcodedTags;
`;

/** @param {import('./tagConfig.js').TagOp[]} ops */
function run(ops) {
	const parsed = parseTagSource(SRC);
	const out = emitTagSource(
		parsed,
		applyTagOps(
			parsed.items.map((it) => ({ value: it.value, orig: it })),
			ops
		)
	);
	return parseTagSource(out).items.find((i) => i.value.id === 'Serie Inventada')?.value;
}

const current = { id: 'Serie Inventada', icon: '🎭' };

describe('seriesEditOps: meta por defecto', () => {
	it('poner una meta es un `update` de `meta_venta`', () => {
		const r = seriesEditOps({ icon: '🎭', goal_kind: 'plata', goal_value: '250.000' }, current);
		expect(r).toEqual({
			ok: true,
			name: 'Serie Inventada',
			renamed: null,
			ops: [{ type: 'update', id: 'Serie Inventada', set: { meta_venta: 'plata:250000' } }]
		});
	});

	it('la misma meta no es un cambio; sacarla la borra', () => {
		const withGoal = { ...current, meta_venta: 'entradas:30' };
		expect(
			seriesEditOps({ icon: '🎭', goal_kind: 'entradas', goal_value: '30' }, withGoal)
		).toEqual({ ok: false, error: 'No cambiaste nada.' });
		expect(seriesEditOps({ icon: '🎭', goal_kind: '', goal_value: '' }, withGoal)).toMatchObject({
			ok: true,
			ops: [{ type: 'update', set: { meta_venta: '' } }]
		});
	});

	it('sin el campo en el formulario, la meta no se toca', () => {
		const withGoal = { ...current, meta_venta: 'entradas:30' };
		const r = seriesEditOps({ icon: '🎪' }, withGoal);
		expect(r).toMatchObject({ ok: true, ops: [{ type: 'update', set: { icon: '🎪' } }] });
	});

	it('un número inválido es un error en voseo', () => {
		expect(
			seriesEditOps({ icon: '🎭', goal_kind: 'entradas', goal_value: 'muchas' }, current)
		).toEqual({
			ok: false,
			error: 'Meta: escribí cuántas entradas querés vender (un número entero mayor a 0).'
		});
	});

	it('crear una serie con meta', () => {
		expect(
			seriesCreateOps({ name: 'Fiesta Rara', goal_kind: 'entradas', goal_value: '40' })
		).toEqual({
			ok: true,
			name: 'Fiesta Rara',
			ops: [
				{ type: 'create', id: 'Fiesta Rara', parent: SERIES_PARENT },
				{ type: 'update', id: 'Fiesta Rara', set: { meta_venta: 'entradas:40' } }
			]
		});
	});
});

describe('meta por defecto en el archivo de etiquetas y en la base', () => {
	it('el editor de etiquetas la escribe (normalizada) y la borra', () => {
		const tag = run([
			{ type: 'update', id: 'Serie Inventada', set: { meta_venta: 'plata: 250.000' } }
		]);
		expect(tag).toEqual({ id: 'Serie Inventada', icon: '🎭', meta_venta: 'plata:250000' });
		expect(() =>
			run([{ type: 'update', id: 'Serie Inventada', set: { meta_venta: 'cupo:3' } }])
		).toThrow(/plata:<pesos>/);
	});

	it('pasa a la base y vuelve igual (tagsToRecords / recordsToRawTags)', () => {
		const raw = [
			{ id: 'evento recurrente', children: ['Serie Inventada'] },
			{ id: 'Serie Inventada', meta_venta: 'entradas:30' }
		];
		const { records } = tagsToRecords(raw);
		expect(records.find((r) => r.key === 'Serie Inventada')?.data).toEqual({
			meta_venta: 'entradas:30'
		});
		expect(recordsToRawTags(records).find((t) => t.id === 'Serie Inventada')).toMatchObject({
			meta_venta: 'entradas:30'
		});
	});

	it('el tipo `etiqueta` la acepta y rechaza una rota', () => {
		const etiqueta = /** @type {import('$lib/server/objects/types/index.js').CoreType} */ (
			coreTypes.get('etiqueta')
		);
		expect(validateData(etiqueta, { key: 'Serie Inventada', meta_venta: 'plata:250000' })).toEqual({
			ok: true,
			data: { key: 'Serie Inventada', meta_venta: 'plata:250000' }
		});
		expect(validateData(etiqueta, { key: 'Serie Inventada', meta_venta: 'mucha' })).toMatchObject({
			ok: false,
			errors: [{ path: 'meta_venta' }]
		});
	});
});
