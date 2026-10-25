import { describe, expect, it } from 'vitest';
import { inOrder } from './inOrder.js';

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('inOrder', () => {
	it('devuelve los valores en orden, también los que no son promesas', async () => {
		expect(await inOrder([wait(5).then(() => 'a'), 'b', null, Promise.resolve(3)])).toEqual([
			'a',
			'b',
			null,
			3
		]);
	});

	it('si fallan varias, sale el error de la primera de la lista (aunque falle después)', async () => {
		const late = wait(10).then(() => {
			throw new Error('primera');
		});
		const early = Promise.reject(new Error('segunda'));
		await expect(inOrder([late, early])).rejects.toThrow('primera');
	});

	it('espera a las de antes aunque una de después ya falló', async () => {
		let done = false;
		const slow = wait(10).then(() => {
			done = true;
		});
		await expect(inOrder([slow, Promise.reject(new Error('x'))])).rejects.toThrow('x');
		expect(done).toBe(true);
	});
});
