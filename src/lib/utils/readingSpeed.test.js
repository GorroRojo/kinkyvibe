/**
 * La velocidad de lectura en el navegador ($lib/utils/readingSpeed.js): localStorage con la de
 * siempre si falla, la de la cuenta gana al entrar, y elegir guarda en la cuenta solo con sesión.
 */
import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
	READING_SPEED_ENDPOINT,
	READING_SPEED_KEY,
	applyAccountSpeedChange,
	chooseReadingSpeed,
	initReadingSpeed,
	loadLocalSpeed,
	readingSpeed,
	saveLocalSpeed
} from './readingSpeed.js';

/** Un localStorage de mentira. @param {Record<string, string>} [start] */
function memoryStorage(start = {}) {
	const data = { ...start };
	return {
		data,
		getItem: (/** @type {string} */ k) => (k in data ? data[k] : null),
		setItem: (/** @type {string} */ k, /** @type {string} */ v) => {
			data[k] = v;
		},
		removeItem: (/** @type {string} */ k) => {
			delete data[k];
		}
	};
}

/** Un navegador que no deja tocar localStorage (modo privado, bloqueado). */
const brokenStorage = {
	getItem: () => {
		throw new Error('SecurityError');
	},
	setItem: () => {
		throw new Error('QuotaExceededError');
	},
	removeItem: () => {
		throw new Error('SecurityError');
	}
};

describe('localStorage', () => {
	it('lee y guarda la velocidad; lo que no es un número no cuenta', () => {
		const s = memoryStorage();
		expect(loadLocalSpeed(s)).toBeNull();
		expect(saveLocalSpeed(250, s)).toBe(true);
		expect(s.data[READING_SPEED_KEY]).toBe('250');
		expect(loadLocalSpeed(s)).toBe(250);
		expect(saveLocalSpeed(null, s)).toBe(true);
		expect(READING_SPEED_KEY in s.data).toBe(false);
		expect(loadLocalSpeed(memoryStorage({ [READING_SPEED_KEY]: 'rapidísimo' }))).toBeNull();
		expect(loadLocalSpeed(memoryStorage({ [READING_SPEED_KEY]: '9000' }))).toBe(600);
	});

	it('si el navegador no deja leer ni guardar: la de siempre, sin romper nada', () => {
		expect(loadLocalSpeed(brokenStorage)).toBeNull();
		expect(saveLocalSpeed(250, brokenStorage)).toBe(false);
		expect(saveLocalSpeed(250, undefined)).toBe(false);
		expect(initReadingSpeed(null, brokenStorage)).toBeNull();
		expect(get(readingSpeed)).toBeNull();
	});
});

describe('al cargar y al entrar', () => {
	it('sin cuenta (o sin elegir en la cuenta): la del navegador', () => {
		const s = memoryStorage({ [READING_SPEED_KEY]: '150' });
		expect(initReadingSpeed(null, s)).toBe(150);
		expect(get(readingSpeed)).toBe(150);
		expect(initReadingSpeed(null, memoryStorage())).toBeNull();
		expect(get(readingSpeed)).toBeNull();
	});

	it('con cuenta: la de la cuenta gana y queda también en el navegador', () => {
		const s = memoryStorage({ [READING_SPEED_KEY]: '150' });
		expect(initReadingSpeed(280, s)).toBe(280);
		expect(get(readingSpeed)).toBe(280);
		expect(s.data[READING_SPEED_KEY]).toBe('280');
	});

	it('la misma cuenta la sacó («Predeterminado» en Mi rincón): se saca también del navegador', () => {
		const s = memoryStorage({ [READING_SPEED_KEY]: '280' });
		expect(applyAccountSpeedChange({ previous: 280, next: null, sameMember: true }, s)).toBeNull();
		expect(get(readingSpeed)).toBeNull();
		expect(READING_SPEED_KEY in s.data).toBe(false);
	});

	it('al salir de la cuenta queda la del navegador', () => {
		const s = memoryStorage({ [READING_SPEED_KEY]: '280' });
		expect(applyAccountSpeedChange({ previous: 280, next: null, sameMember: false }, s)).toBe(280);
		expect(get(readingSpeed)).toBe(280);
	});
});

describe('elegir una velocidad', () => {
	it('sin cuenta: se aplica y queda en el navegador, sin pedidos', async () => {
		const s = memoryStorage();
		const f = vi.fn();
		expect(await chooseReadingSpeed(150, { storage: s, fetch: f })).toBe(150);
		expect(get(readingSpeed)).toBe(150);
		expect(s.data[READING_SPEED_KEY]).toBe('150');
		expect(f).not.toHaveBeenCalled();
	});

	it('«Predeterminado» vuelve a la de siempre (null) y lo saca del navegador', async () => {
		const s = memoryStorage({ [READING_SPEED_KEY]: '150' });
		expect(await chooseReadingSpeed(200, { storage: s })).toBeNull();
		expect(get(readingSpeed)).toBeNull();
		expect(READING_SPEED_KEY in s.data).toBe(false);
	});

	it('con cuenta: además la guarda en la cuenta (JSON)', async () => {
		const f = vi.fn(async () => new Response('{}'));
		expect(
			await chooseReadingSpeed('9000', { member: true, storage: memoryStorage(), fetch: f })
		).toBe(600);
		expect(f).toHaveBeenCalledWith(READING_SPEED_ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ wpm: 600 })
		});
	});

	it('si falla el guardado en la cuenta o en el navegador, la elección igual se aplica', async () => {
		const f = vi.fn(async () => {
			throw new TypeError('sin conexión');
		});
		expect(await chooseReadingSpeed(280, { member: true, storage: brokenStorage, fetch: f })).toBe(
			280
		);
		expect(get(readingSpeed)).toBe(280);
	});
});
