/**
 * Meta de venta en pantalla: el control «Meta de venta» (editor de eventos, dentro de «Entradas»)
 * y el avance contra la meta (lista de eventos, Inicio, Ventas). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SalesGoalField from './SalesGoalField.svelte';
import TicketsEditor from './TicketsEditor.svelte';
import GoalProgress from './panel/GoalProgress.svelte';
import SalesThermometer from './panel/SalesThermometer.svelte';
import { readTicketsForm } from '$lib/utils/ticketsEditor.js';
import { goalProgress } from '$lib/utils/salesGoal.js';
import { formatARS } from '$lib/utils/money.js';

/** El texto visible, sin etiquetas ni comentarios (y con los espacios normalizados). */
const text = (/** @type {string} */ html) =>
	html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
/** Lo mismo para un texto armado con formatARS (lleva un espacio duro, que `\s` también encuentra). */
const norm = (/** @type {string} */ s) => s.replace(/\s+/g, ' ');

describe('SalesGoalField', () => {
	it('sin meta: la medida en «Sin meta» y sin campo para el número', () => {
		const { body } = render(SalesGoalField, { props: { idPrefix: 'ed' } });
		expect(body).toContain('id="ed-goal-kind"');
		expect(body).toContain('Sin meta');
		expect(body).toContain('Plata (pesos)');
		expect(body).toContain('Entradas');
		expect(body).not.toContain('id="ed-goal-value"');
		expect(text(body)).toContain('Sin meta, contra el cupo');
	});

	it('plata: pide cuánta plata y muestra la meta', () => {
		const { body } = render(SalesGoalField, {
			props: { idPrefix: 'ed', kind: 'plata', value: '250000' }
		});
		expect(body).toContain('id="ed-goal-value"');
		expect(text(body)).toContain('¿Cuánta plata?');
		expect(text(body)).toContain(norm(`Meta: ${formatARS(250000)}`));
		expect(text(body)).toContain('Cuenta lo neto: lo cobrado menos la comisión de Mercado Pago');
	});

	it('entradas: pide cuántas y muestra la meta (sin hablar de la comisión)', () => {
		const { body } = render(SalesGoalField, {
			props: { idPrefix: 'ed', kind: 'entradas', value: '30' }
		});
		expect(text(body)).toContain('¿Cuántas entradas?');
		expect(text(body)).toContain('Meta: 30 entradas');
		expect(text(body)).not.toContain('comisión');
	});
});

describe('TicketsEditor', () => {
	const meta = {
		title: 'Encuentro inventado',
		tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 50 }],
		meta_venta: 'entradas:30'
	};

	it('la sección Entradas trae «Meta de venta» con la meta del evento', () => {
		const { body } = render(TicketsEditor, {
			props: { state: readTicketsForm(meta), idPrefix: 'edit' }
		});
		expect(body).toContain('id="edit-goal"');
		expect(text(body)).toContain('Meta de venta');
		expect(body).toMatch(/id="edit-goal-value"[^>]*value="30"|value="30"[^>]*id="edit-goal-value"/);
	});

	it('con la venta apagada no se muestra', () => {
		const { body } = render(TicketsEditor, {
			props: { state: readTicketsForm({ title: 'Sin venta' }), idPrefix: 'edit' }
		});
		expect(body).not.toContain('id="edit-goal"');
	});
});

/** Un avance que sí existe (con meta). @param {ReturnType<typeof goalProgress>} p */
const must = (p) => /** @type {import('$lib/utils/salesGoal.js').GoalProgress} */ (p);

describe('GoalProgress', () => {
	it('plata: «$ 180.000 netos de $ 250.000 (72 %)», con la barra a ese porcentaje', () => {
		const progress = must(goalProgress('plata:250000', { sold: 10, revenue: 183600, mpFee: 3600 }));
		const { body } = render(GoalProgress, { props: { progress } });
		expect(text(body)).toBe(norm(`${formatARS(180000)} netos de ${formatARS(250000)} (72 %)`));
		expect(body).toContain('style="width:72%"');
		expect(body).toContain('role="meter"');
		expect(body).toContain('aria-valuemax="250000"');
	});

	it('entradas: «23 de 30 entradas»; al pasarse, la barra llena y «meta cumplida»', () => {
		const p = must(goalProgress('entradas:30', { sold: 23, revenue: 0, mpFee: 0 }));
		expect(text(render(GoalProgress, { props: { progress: p } }).body)).toBe('23 de 30 entradas');
		const over = must(goalProgress('entradas:30', { sold: 33, revenue: 0, mpFee: 0 }));
		const { body } = render(GoalProgress, { props: { progress: over } });
		expect(text(body)).toBe('33 de 30 entradas · meta cumplida');
		expect(body).toContain('style="width:100%"');
	});
});

describe('SalesThermometer con meta', () => {
	const chart = /** @type {any} */ ({
		from: 0,
		to: 10,
		today: 5,
		capacity: 50,
		sold: 23,
		series: [],
		channels: [],
		markers: [],
		projection: null,
		pace: null,
		previous: null,
		sentence: ''
	});

	it('meta en entradas: la línea «meta 30» y el texto arriba', () => {
		const progress = goalProgress('entradas:30', { sold: 23, revenue: 0, mpFee: 0 });
		const { body } = render(SalesThermometer, { props: { chart, progress } });
		expect(text(body)).toContain('Meta: 23 de 30 entradas');
		expect(body).toContain('goal-chart-line');
		expect(text(body)).toContain('meta 30');
	});

	it('meta en plata: el texto, sin línea (el gráfico es de entradas); sin meta, nada', () => {
		const progress = goalProgress('plata:250000', { sold: 23, revenue: 180000, mpFee: 0 });
		const { body } = render(SalesThermometer, { props: { chart, progress } });
		expect(text(body)).toContain(norm(`Meta: ${formatARS(180000)} netos de ${formatARS(250000)}`));
		expect(body).not.toContain('goal-chart-line');
		const plain = render(SalesThermometer, { props: { chart } }).body;
		expect(plain).not.toContain('goal-line');
	});
});
