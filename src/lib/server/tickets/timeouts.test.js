/**
 * Las llamadas a Mercado Pago y a Resend tienen un tiempo máximo: si la API no contesta, se
 * corta y el código que llama maneja el error (libera la reserva, muestra el estado que hay…)
 * en lugar de quedar colgado.
 */
import { describe, expect, it } from 'vitest';
import { sendWithResend } from './email.js';
import { getPayment } from './mercadopago.js';

/** fetch que nunca contesta, salvo que lo corten con su `signal`. */
function hangingFetch() {
	/** @type {RequestInit[]} */
	const calls = [];
	const fetch = /** @type {typeof globalThis.fetch} */ (
		(_url, init = {}) => {
			calls.push(init);
			return new Promise((_resolve, reject) => {
				init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
			});
		}
	);
	return { fetch, calls };
}

describe('tiempos máximos de las APIs externas', () => {
	it('Mercado Pago: se corta si no contesta', async () => {
		const { fetch, calls } = hangingFetch();
		await expect(
			getPayment({ fetch, accessToken: 'TEST-x', timeoutMs: 20 }, '123')
		).rejects.toThrow(/timed out|abort/i);
		expect(calls[0].signal).toBeInstanceOf(AbortSignal);
	});

	it('Resend: se corta si no contesta', async () => {
		const { fetch, calls } = hangingFetch();
		await expect(
			sendWithResend({
				fetch,
				apiKey: 're_x',
				from: 'Ejemplo <entradas@example.com>',
				to: 'persona@example.com',
				message: { subject: 'Hola', html: '<p>Hola</p>', text: 'Hola' },
				timeoutMs: 20
			})
		).rejects.toThrow(/timed out|abort/i);
		expect(calls[0].signal).toBeInstanceOf(AbortSignal);
	});

	it('por defecto también hay un límite', async () => {
		const { fetch, calls } = hangingFetch();
		// Sin timeoutMs: solo se verifica que la request lleva una señal (no se espera 10 s).
		void getPayment({ fetch, accessToken: 'TEST-x' }, '123').catch(() => {});
		void sendWithResend({
			fetch,
			apiKey: 're_x',
			from: 'entradas@example.com',
			to: 'persona@example.com',
			message: { subject: 'Hola', html: '', text: '' }
		}).catch(() => {});
		await Promise.resolve();
		expect(calls).toHaveLength(2);
		for (const init of calls) expect(init.signal).toBeInstanceOf(AbortSignal);
	});
});
