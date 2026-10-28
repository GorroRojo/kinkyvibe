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

import { oncePerRequest, readAndKeep } from './perRequest.js';

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

	it('el layout y la página comparten la lectura (cada `load` ve su copia del evento)', async () => {
		// SvelteKit le pasa a cada `load` su propia copia del evento (`{ ...event, tracing }`):
		// `getRequestEvent()` devuelve otro objeto en el layout y en la página, con el mismo `request`.
		const event = request('GET');
		const db = {};
		const c = counter();
		fake.event = { ...event, tracing: { current: 'layout' } };
		const fromLayout = oncePerRequest(db, 'k', c.read);
		fake.event = { ...event, tracing: { current: 'page' } };
		const fromPage = oncePerRequest(db, 'k', c.read);
		expect(await Promise.all([fromLayout, fromPage])).toEqual(['marca-1', 'marca-1']);
		expect(c.calls()).toBe(1);
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

describe('readAndKeep', () => {
	/** Una caché de módulo como las de posts.js o flags.js: guarda un valor, nunca la promesa. */
	function moduleCache() {
		/** @type {{ value: string } | null} */
		let kept = null;
		const scope = {};
		/** @param {() => Promise<string>} read */
		const get = (read) =>
			kept
				? Promise.resolve(kept.value)
				: readAndKeep(scope, 'k', read, (value) => {
						kept = { value };
					});
		return { get };
	}

	it('una lectura de otro pedido que no termina no cuelga al siguiente', async () => {
		const cache = moduleCache();
		let n = 0;
		const read = () => (++n === 1 ? new Promise(() => {}) : Promise.resolve(`valor-${n}`));
		fake.event = request('GET');
		void cache.get(read);
		fake.event = request('GET');
		const hung = new Promise((resolve) => setTimeout(() => resolve('colgado'), 100));
		expect(await Promise.race([cache.get(read), hung])).toBe('valor-2');
		// Lo resuelto queda para los pedidos que siguen (sin otra lectura).
		fake.event = request('GET');
		expect(await cache.get(read)).toBe('valor-2');
		expect(n).toBe(2);
	});

	it('dentro de un pedido, una sola lectura; un error no se guarda', async () => {
		const cache = moduleCache();
		let n = 0;
		const read = async () => {
			if (++n === 1) throw new Error('no contestó');
			return 'ok';
		};
		fake.event = request('POST');
		await expect(cache.get(read)).rejects.toThrow('no contestó');
		fake.event = request('GET');
		const [a, b] = await Promise.all([cache.get(read), cache.get(read)]);
		expect([a, b, n]).toEqual(['ok', 'ok', 2]);
	});
});
