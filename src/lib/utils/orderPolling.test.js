import { describe, expect, it } from 'vitest';
import { ORDER_POLL_DELAYS, nextOrderPollDelay } from './orderPolling.js';

describe('nextOrderPollDelay', () => {
	it('5 → 10 → 20 → 30 s y después cada 30 s, 8 consultas en total', () => {
		/** @type {number[]} */
		const delays = [];
		for (let done = 0; ; done++) {
			const delay = nextOrderPollDelay(done);
			if (delay === null) break;
			delays.push(delay);
		}
		expect(delays).toEqual([5000, 10000, 20000, 30000, 30000, 30000, 30000, 30000]);
		expect(delays).toEqual([...ORDER_POLL_DELAYS]);
	});

	it('nunca más de 10 consultas (a Mercado Pago) en ningún minuto, contando la carga inicial', () => {
		// La carga de la página (t = 0) también consulta; después, una por cada espera.
		const times = [0];
		for (const delay of ORDER_POLL_DELAYS) times.push(times[times.length - 1] + delay);
		for (const start of times) {
			const inWindow = times.filter((t) => t >= start && t < start + 60_000).length;
			expect(inWindow).toBeLessThanOrEqual(10);
		}
		// Y termina: unos 3 minutos en total.
		expect(times[times.length - 1]).toBeLessThanOrEqual(4 * 60_000);
	});

	it('sin más consultas después de la última (o con un número raro)', () => {
		expect(nextOrderPollDelay(ORDER_POLL_DELAYS.length)).toBeNull();
		expect(nextOrderPollDelay(100)).toBeNull();
		expect(nextOrderPollDelay(-1)).toBeNull();
		expect(nextOrderPollDelay(1.5)).toBeNull();
	});
});
