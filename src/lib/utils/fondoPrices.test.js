/**
 * Precios con el Fondo en el editor de eventos (sección Entradas) y el texto de «Copiar precios».
 * Precios y nombres inventados.
 */
import { describe, expect, it } from 'vitest';
import { formatARS } from './money.js';
import { computePrice } from './tickets.js';
import {
	fondoPriceLine,
	fondoPriceSpoken,
	fondoTodayLine,
	priceWithFondo,
	pricesCopyText,
	shownFondoPercent,
	untilShort
} from './fondoPrices.js';
import { emptyTicketType, tierPreview } from './ticketsEditor.js';

/** @param {string} name @param {string} price @param {string} [until] */
const tier = (name, price, until = '') => ({
	key: name,
	origId: null,
	id: '',
	name,
	price,
	quantity: '',
	until
});

const tiered = () => ({
	...emptyTicketType({ first: true }),
	mode: /** @type {const} */ ('tiers'),
	tiers: [
		tier('Preventa 1', '14000', '2026-11-07T23:59'),
		tier('Preventa 2', '16.000', '2026-11-20T23:59'),
		tier('General', '18000')
	]
});

describe('precio con el Fondo', () => {
	it('es el que paga quien elige «Con el descuento del fondo» (mismo redondeo)', () => {
		for (const [price, percent] of [
			[14000, 20],
			[9999, 30],
			[10005, 10],
			[8000, 100]
		]) {
			const fondo = Math.round((price * percent) / 100);
			const buy = computePrice({ price, fondo, option: 'fondo', quantity: 1 });
			expect(priceWithFondo(price, percent)).toBe(buy.total);
		}
		expect(priceWithFondo(14000, 20)).toBe(11200);
		expect(priceWithFondo(8000, 100)).toBe(0);
	});

	it('sin precio, sin porcentaje, 0 % o un porcentaje raro: nada', () => {
		expect(priceWithFondo(null, 20)).toBeNull();
		expect(priceWithFondo(14000, null)).toBeNull();
		expect(priceWithFondo(14000, 0)).toBeNull();
		expect(priceWithFondo(14000, 12.5)).toBeNull();
		expect(priceWithFondo(14000, 120)).toBeNull();
		expect(shownFondoPercent('20')).toBeNull();
		expect(shownFondoPercent(20)).toBe(20);
	});

	it('la línea debajo de un precio que se está escribiendo', () => {
		expect(fondoPriceLine('14000', 20)).toBe(`💜 -20% = ${formatARS(11200)}`);
		expect(fondoPriceSpoken('14000', 20)).toBe(
			`Con el descuento del Fondo (20 %): ${formatARS(11200)}`
		);
		expect(fondoPriceSpoken('', 20)).toBe('');
		expect(fondoPriceLine('$ 14.000', 20)).toBe(`💜 -20% = ${formatARS(11200)}`);
		expect(fondoPriceLine('', 20)).toBe('');
		expect(fondoPriceLine('catorce', 20)).toBe('');
		expect(fondoPriceLine('14000', 0)).toBe('');
		expect(fondoPriceLine('14000', null)).toBe('');
	});

	it('el aviso de que el porcentaje puede cambiar, solo con porcentaje', () => {
		expect(fondoTodayLine(20)).toBe('El descuento del Fondo hoy es 20 %: puede cambiar.');
		expect(fondoTodayLine(0)).toBe('');
		expect(fondoTodayLine(null)).toBe('');
	});

	it('untilShort: «hasta el 7/11» de un datetime-local', () => {
		expect(untilShort('2026-11-07T23:59')).toBe('hasta el 7/11');
		expect(untilShort('')).toBe('');
		expect(untilShort('mañana')).toBe('');
	});
});

describe('resumen de los tramos con el Fondo', () => {
	it('cada precio lleva también el precio con el Fondo', () => {
		expect(tierPreview(tiered().tiers, 20)).toBe(
			`Quien compra ve solo el tramo vigente: Preventa 1 (${formatARS(14000)} · 💜 -20% = ${formatARS(11200)}, hasta el 7/11) → Preventa 2 (${formatARS(16000)} · 💜 -20% = ${formatARS(12800)}, hasta el 20/11) → General (${formatARS(18000)} · 💜 -20% = ${formatARS(14400)}, el resto).`
		);
	});

	it('para un lector de pantalla, el descuento con palabras', () => {
		expect(tierPreview(tiered().tiers, 20, { spoken: true })).toContain(
			`Preventa 1 (${formatARS(14000)}; con el descuento del Fondo (20 %): ${formatARS(11200)}, hasta el 7/11)`
		);
		expect(tierPreview(tiered().tiers, 0, { spoken: true })).toBe(tierPreview(tiered().tiers));
	});

	it('sin Fondo o con 0 %, como siempre', () => {
		const plain = `Quien compra ve solo el tramo vigente: Preventa 1 (${formatARS(14000)}, hasta el 7/11) → Preventa 2 (${formatARS(16000)}, hasta el 20/11) → General (${formatARS(18000)}, el resto).`;
		expect(tierPreview(tiered().tiers)).toBe(plain);
		expect(tierPreview(tiered().tiers, 0)).toBe(plain);
		expect(tierPreview(tiered().tiers, null)).toBe(plain);
	});

	it('un tramo sin precio sigue diciendo «$ ?»', () => {
		expect(tierPreview([tier('Preventa 1', '')], 20)).toBe(
			'Quien compra ve solo el tramo vigente: Preventa 1 ($ ?, el resto).'
		);
	});
});

describe('Copiar precios', () => {
	it('una línea por tramo, con el precio con el Fondo y la fecha', () => {
		expect(pricesCopyText(tiered(), 20)).toBe(
			[
				`Preventa 1: ${formatARS(14000)} · 💜 -20% = ${formatARS(11200)} · hasta el 7/11`,
				`Preventa 2: ${formatARS(16000)} · 💜 -20% = ${formatARS(12800)} · hasta el 20/11`,
				`General: ${formatARS(18000)} · 💜 -20% = ${formatARS(14400)}`
			].join('\n')
		);
	});

	it('con precio en puerta propio, suma la línea de la puerta', () => {
		expect(
			pricesCopyText({ ...tiered(), doorPrice: '20000' }, 20)
				.split('\n')
				.at(-1)
		).toBe(`En la puerta: ${formatARS(20000)} · 💜 -20% = ${formatARS(16000)}`);
		expect(
			pricesCopyText({ ...tiered(), doorPrice: '20000' }, null)
				.split('\n')
				.at(-1)
		).toBe(`En la puerta: ${formatARS(20000)}`);
	});

	it('sin Fondo: solo los precios', () => {
		expect(pricesCopyText(tiered(), 0)).toBe(
			[
				`Preventa 1: ${formatARS(14000)} · hasta el 7/11`,
				`Preventa 2: ${formatARS(16000)} · hasta el 20/11`,
				`General: ${formatARS(18000)}`
			].join('\n')
		);
	});

	it('precio fijo: una línea con el nombre del tipo; a la gorra, nada', () => {
		const fixed = { ...emptyTicketType({ first: true }), price: '10000' };
		expect(pricesCopyText(fixed, 20)).toBe(
			`General: ${formatARS(10000)} · 💜 -20% = ${formatARS(8000)}`
		);
		expect(pricesCopyText({ ...fixed, mode: 'gorra' }, 20)).toBe('');
	});

	it('un tramo sin nombre ni precio no rompe nada', () => {
		const t = { ...tiered(), tiers: [tier('', '')] };
		expect(pricesCopyText(t, 20)).toBe('Tramo 1: $ ?');
	});
});
