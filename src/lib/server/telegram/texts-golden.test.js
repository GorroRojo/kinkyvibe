/**
 * Sin nada cambiado en «Textos del bot», el bot dice exactamente lo mismo que antes, byte a byte:
 * cada caso de `bot.fixtures.js` contra `bot.golden.json` (sacada del código de antes del panel).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { botCases, routerCases } from './bot.fixtures.js';

const FILE = new URL('./bot.golden.json', import.meta.url);
const UPDATE = process.env.UPDATE_BOT_GOLDEN === '1';
/** @type {Record<string, unknown>} */
const golden = UPDATE ? {} : JSON.parse(readFileSync(FILE, 'utf8'));
/** @param {unknown} v */
const plain = (v) => JSON.parse(JSON.stringify(v ?? null));

describe('textos del bot sin cambios: igual a la golden', () => {
	it.each(botCases())('%s', (name, fn) => {
		if (UPDATE) golden[name] = plain(fn());
		else expect(plain(fn())).toEqual(golden[name]);
	});

	it.each(routerCases())('router: %s', async (name, fn) => {
		const key = `router: ${name}`;
		if (UPDATE) golden[key] = plain(await fn());
		else expect(plain(await fn())).toEqual(golden[key]);
	});

	it('la golden tiene todos los casos (y nada más)', () => {
		const names = [...botCases().map(([n]) => n), ...routerCases().map(([n]) => `router: ${n}`)];
		if (UPDATE) {
			writeFileSync(FILE, JSON.stringify(golden, null, '\t') + '\n');
			return;
		}
		expect(Object.keys(golden).sort()).toEqual([...names].sort());
	});
});
