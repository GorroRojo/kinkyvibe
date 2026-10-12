/**
 * `oncePerRequest` (./perRequest.js): una marca de «¿cambió algo?» una sola vez por pedido de
 * lectura, solo la consulta en camino en los demás pedidos y una por llamada fuera de un pedido.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ event: /** @type {any} */ (null) }));
vi.mock('$app/server', () => ({
	getRequestEvent: () => {
		if (!fake.event) throw new Error('fuera de un pedido');
		return fake.event;
	}
}));

import { oncePerRequest } from './perRequest.js';

/** @param {string} method */
const request = (method) => ({ request: new Request('https://example.com/', { method }) });

afterEach(() => {
	fake.event = null;
});

/** Una lectura que cuenta cuántas veces corrió. */
function counter() {
	let n = 0;
	const read = async () => `marca-${++n}`;
	return { read, calls: () => n };
}

describe('oncePerRequest', () => {
	it('en un GET, una sola vez por pedido (también después de resuelta)', async () => {
		fake.event = request('GET');
		const db = {};
		const c = counter();
		const a = await oncePerRequest(db, 'k', c.read);
		const b = await oncePerRequest(db, 'k', c.read);
		const [x, y] = await Promise.all([
			oncePerRequest(db, 'k', c.read),
			oncePerRequest(db, 'k', c.read)
		]);
		expect([a, b, x, y]).toEqual(['marca-1', 'marca-1', 'marca-1', 'marca-1']);
		expect(c.calls()).toBe(1);
		// Otro pedido vuelve a leer.
		fake.event = request('GET');
		expect(await oncePerRequest(db, 'k', c.read)).toBe('marca-2');
	});

	it('HEAD también es de lectura', async () => {
		fake.event = request('HEAD');
		const c = counter();
		const db = {};
		await oncePerRequest(db, 'k', c.read);
		await oncePerRequest(db, 'k', c.read);
		expect(c.calls()).toBe(1);
	});

	it('en un POST, solo se comparte la consulta en camino', async () => {
		fake.event = request('POST');
		const db = {};
		const c = counter();
		const [x, y] = await Promise.all([
			oncePerRequest(db, 'k', c.read),
			oncePerRequest(db, 'k', c.read)
		]);
		expect([x, y]).toEqual(['marca-1', 'marca-1']);
		// Ya resuelta: un guardado pudo cambiar la marca, se vuelve a leer.
		expect(await oncePerRequest(db, 'k', c.read)).toBe('marca-2');
		expect(c.calls()).toBe(2);
	});

	it('fuera de un pedido, una lectura por llamada', async () => {
		const c = counter();
		const db = {};
		await Promise.all([oncePerRequest(db, 'k', c.read), oncePerRequest(db, 'k', c.read)]);
		expect(c.calls()).toBe(2);
	});

	it('separa las bases y las claves', async () => {
		fake.event = request('GET');
		const c = counter();
		const one = {};
		const two = {};
		await oncePerRequest(one, 'a', c.read);
		await oncePerRequest(one, 'b', c.read);
		await oncePerRequest(two, 'a', c.read);
		await oncePerRequest(one, 'a', c.read);
		expect(c.calls()).toBe(3);
	});

	it('un error no se recuerda', async () => {
		fake.event = request('GET');
		const db = {};
		let n = 0;
		const read = async () => {
			if (++n === 1) throw new Error('la base no contestó');
			return 'marca';
		};
		await expect(oncePerRequest(db, 'k', read)).rejects.toThrow('no contestó');
		expect(await oncePerRequest(db, 'k', read)).toBe('marca');
		expect(n).toBe(2);
	});
});
