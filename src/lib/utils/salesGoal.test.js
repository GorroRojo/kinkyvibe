/**
 * Meta de venta de un evento: leerla (frontmatter o etiqueta de una serie), el formulario, el
 * avance contra la meta y la herencia de la meta por defecto de una serie al crear o duplicar una
 * edición. Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { formatARS } from './money.js';
import {
	GOAL_KEY,
	GOAL_MAX,
	describeSalesGoal,
	goalFromForm,
	goalProgress,
	goalToForm,
	inheritedGoal,
	parseSalesGoal,
	salesGoalProblem,
	seriesGoalFor,
	seriesGoalMap,
	storedSalesGoal
} from './salesGoal.js';
import { withInheritedGoal } from './salesGoalFile.js';

describe('parseSalesGoal', () => {
	it('lee la forma guardada (plata o entradas)', () => {
		expect(parseSalesGoal('plata:250000')).toEqual({ kind: 'plata', value: 250000 });
		expect(parseSalesGoal('entradas:30')).toEqual({ kind: 'entradas', value: 30 });
		expect(parseSalesGoal(' Plata : 250.000 ')).toEqual({ kind: 'plata', value: 250000 });
	});

	it('acepta la forma de mapa escrita a mano en el frontmatter (una sola clave)', () => {
		expect(parseSalesGoal({ plata: 180000 })).toEqual({ kind: 'plata', value: 180000 });
		expect(parseSalesGoal({ entradas: '40' })).toEqual({ kind: 'entradas', value: 40 });
		expect(parseSalesGoal({ plata: 1, entradas: 2 })).toBeNull();
	});

	it('lo que no se entiende es sin meta (nunca tira)', () => {
		for (const raw of [
			undefined,
			null,
			'',
			'plata',
			'plata:',
			'plata:0',
			'plata:-5',
			'plata:12,5',
			'cupo:30',
			'entradas:abc',
			`entradas:${GOAL_MAX.entradas + 1}`,
			42,
			[],
			{ cupo: 3 }
		])
			expect(parseSalesGoal(raw)).toBeNull();
	});

	it('salesGoalProblem: nada si no hay meta o está bien; un mensaje si está rota', () => {
		expect(salesGoalProblem(undefined)).toBeNull();
		expect(salesGoalProblem('')).toBeNull();
		expect(salesGoalProblem('entradas:30')).toBeNull();
		expect(salesGoalProblem('entradas:0')).toMatch(/entero mayor a 0/);
	});

	it('storedSalesGoal y describeSalesGoal', () => {
		expect(storedSalesGoal({ kind: 'plata', value: 250000 })).toBe('plata:250000');
		expect(storedSalesGoal(null)).toBe('');
		expect(describeSalesGoal({ kind: 'plata', value: 250000 })).toBe(formatARS(250000));
		expect(describeSalesGoal({ kind: 'entradas', value: 1 })).toBe('1 entrada');
		expect(describeSalesGoal({ kind: 'entradas', value: 30 })).toBe('30 entradas');
	});
});

describe('formulario «Meta»', () => {
	it('sin meta no es un error', () => {
		expect(goalFromForm('', '123')).toEqual({ goal: null, error: '' });
	});

	it('plata y entradas válidas', () => {
		expect(goalFromForm('plata', '250.000')).toEqual({
			goal: { kind: 'plata', value: 250000 },
			error: ''
		});
		expect(goalFromForm('entradas', ' 30 ')).toEqual({
			goal: { kind: 'entradas', value: 30 },
			error: ''
		});
	});

	it('errores en voseo, según la medida', () => {
		expect(goalFromForm('plata', '').error).toBe(
			'Meta: escribí cuánta plata querés juntar, en pesos enteros (mayor a 0).'
		);
		expect(goalFromForm('entradas', '0').error).toBe(
			'Meta: escribí cuántas entradas querés vender (un número entero mayor a 0).'
		);
		expect(goalFromForm('plata', String(GOAL_MAX.plata * 10)).error).toMatch(/sobra un cero/);
		expect(goalFromForm('entradas', '1000000').error).toMatch(/sobra un cero/);
	});

	it('goalToForm: los campos para una meta guardada', () => {
		expect(goalToForm('plata:250000')).toEqual({ kind: 'plata', value: '250000' });
		expect(goalToForm('roto')).toEqual({ kind: '', value: '' });
	});
});

describe('goalProgress', () => {
	it('plata: lo recaudado contra la meta, con el porcentaje', () => {
		const p = goalProgress('plata:250000', { sold: 23, revenue: 180000 });
		expect(p).toEqual({
			kind: 'plata',
			current: 180000,
			target: 250000,
			pct: 72,
			reached: false,
			text: `${formatARS(180000)} de ${formatARS(250000)} (72 %)`
		});
	});

	it('entradas: «23 de 30 entradas»', () => {
		const p = goalProgress({ kind: 'entradas', value: 30 }, { sold: 23, revenue: 999 });
		expect(p?.text).toBe('23 de 30 entradas');
		expect(p?.pct).toBe(77);
		expect(p?.reached).toBe(false);
		expect(goalProgress('entradas:1', { sold: 0, revenue: 0 })?.text).toBe('0 de 1 entrada');
	});

	it('pasarse de la meta: más de 100 % y cumplida', () => {
		const p = goalProgress('entradas:20', { sold: 25, revenue: 0 });
		expect(p?.pct).toBe(125);
		expect(p?.reached).toBe(true);
	});

	it('sin meta (o rota): null, para mostrar el cupo como siempre', () => {
		expect(goalProgress(null, { sold: 3, revenue: 100 })).toBeNull();
		expect(goalProgress('', { sold: 3, revenue: 100 })).toBeNull();
		expect(goalProgress('plata:0', { sold: 3, revenue: 100 })).toBeNull();
	});
});

describe('meta por defecto de las series', () => {
	const tags = /** @type {Record<string, Record<string, unknown>>} */ ({
		'Serie Inventada': { id: 'Serie Inventada', meta_venta: 'plata:300000' },
		'Otra Serie': { id: 'Otra Serie', meta_venta: 'entradas:40' },
		'Serie Sin Meta': { id: 'Serie Sin Meta' },
		'Serie Rota': { id: 'Serie Rota', meta_venta: 'mucho' }
	});
	const goals = seriesGoalMap(Object.keys(tags), (id) => tags[id]);

	it('seriesGoalMap: solo las series con una meta válida', () => {
		expect(goals).toEqual({ 'Serie Inventada': 'plata:300000', 'Otra Serie': 'entradas:40' });
	});

	it('seriesGoalFor: la de la primera serie del evento que tenga una', () => {
		expect(
			seriesGoalFor(['español', 'Serie Sin Meta', 'Otra Serie', 'Serie Inventada'], goals)
		).toEqual({ series: 'Otra Serie', goal: { kind: 'entradas', value: 40 } });
		expect(seriesGoalFor(['español'], goals)).toBeNull();
		expect(seriesGoalFor(undefined, goals)).toBeNull();
		expect(seriesGoalFor(['Serie Inventada'], null)).toBeNull();
	});

	it('inheritedGoal: al duplicar, la meta de la serie reemplaza la copiada del original', () => {
		const meta = {
			tags: ['Serie Inventada'],
			tickets: [{ id: 'general', name: 'General', price: 1000 }],
			[GOAL_KEY]: 'entradas:10'
		};
		expect(inheritedGoal(meta, goals)).toBe('plata:300000');
		// Ya la tiene: nada que cambiar.
		expect(inheritedGoal({ ...meta, [GOAL_KEY]: 'plata:300000' }, goals)).toBeNull();
	});

	it('inheritedGoal: sin venta, sin serie o sin meta en la serie, no cambia nada', () => {
		const tickets = [{ id: 'general', name: 'General', price: 1000 }];
		expect(inheritedGoal({ tags: ['Serie Inventada'] }, goals)).toBeNull();
		expect(inheritedGoal({ tags: ['Serie Sin Meta'], tickets }, goals)).toBeNull();
		expect(inheritedGoal({ tags: ['español'], tickets, [GOAL_KEY]: 'entradas:5' }, goals)).toBe(
			null
		);
	});

	it('withInheritedGoal: escribe la meta en el archivo nuevo y deja lo demás igual', () => {
		const raw = `---
title: Edición Inventada
tags:
  - Serie Inventada
tickets:
  - id: general
    name: General
    price: 1000
meta_venta: entradas:10
---

Texto.
`;
		const out = withInheritedGoal(raw, goals);
		expect(out).toContain('meta_venta: plata:300000');
		expect(out).not.toContain('entradas:10');
		expect(out).toContain('title: Edición Inventada');
		expect(out.endsWith('Texto.\n')).toBe(true);
		// Sin series con meta, el archivo queda tal cual.
		expect(withInheritedGoal(raw, {})).toBe(raw);
		const otherSeries = raw.replace('  - Serie Inventada', '  - Serie Sin Meta');
		expect(withInheritedGoal(otherSeries, goals)).toBe(otherSeries);
	});
});
