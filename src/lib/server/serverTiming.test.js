import { beforeEach, describe, expect, it } from 'vitest';
import { resetServerTiming, startServerTiming } from './serverTiming.js';

/** Un reloj que se mueve a mano. */
function fakeClock(start = 1_000_000) {
	let now = start;
	const clock = () => now;
	clock.advance = (/** @type {number} */ ms) => (now += ms);
	return clock;
}

describe('Server-Timing', () => {
	beforeEach(() => resetServerTiming());

	it('dice cuánto tardó y que es el primer pedido del isolate', () => {
		const clock = fakeClock();
		const finish = startServerTiming(clock);
		clock.advance(120);
		const r = finish(new Response('ok'));
		expect(r.headers.get('server-timing')).toBe('app;dur=120, iso;desc="n=1 age=0s"');
	});

	it('cuenta los pedidos del isolate y su edad en segundos', () => {
		const clock = fakeClock();
		startServerTiming(clock)(new Response('a'));
		clock.advance(42_400);
		const finish = startServerTiming(clock);
		clock.advance(5);
		expect(finish(new Response('b')).headers.get('server-timing')).toBe(
			'app;dur=5, iso;desc="n=2 age=42s"'
		);
	});

	it('con headers que no se pueden cambiar, devuelve una copia con el header', async () => {
		const clock = fakeClock();
		const finish = startServerTiming(clock);
		const frozen = new Response('cuerpo', { status: 201, headers: { 'x-a': '1' } });
		Object.defineProperty(frozen, 'headers', {
			value: new Proxy(new Headers(frozen.headers), {
				get(target, prop) {
					if (prop === 'append')
						return () => {
							throw new TypeError('immutable');
						};
					const v = Reflect.get(target, prop);
					return typeof v === 'function' ? v.bind(target) : v;
				}
			})
		});
		const r = finish(frozen);
		expect(r).not.toBe(frozen);
		expect(r.status).toBe(201);
		expect(r.headers.get('x-a')).toBe('1');
		expect(r.headers.get('server-timing')).toBe('app;dur=0, iso;desc="n=1 age=0s"');
		expect(await r.text()).toBe('cuerpo');
	});

	it('suma al Server-Timing que ya traiga la respuesta', () => {
		const finish = startServerTiming(fakeClock());
		const r = finish(new Response('x', { headers: { 'server-timing': 'db;dur=3' } }));
		expect(r.headers.get('server-timing')).toBe('db;dur=3, app;dur=0, iso;desc="n=1 age=0s"');
	});
});
