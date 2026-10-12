/**
 * Estadísticas de uso del bot (uso.js, decisión 0045), sin base: lo que se escribe en cada tabla
 * (una D1 falsa anota cada sentencia y sus parámetros). Datos inventados.
 *
 * - (a) La fila de la persona no lleva ni la acción, ni lo buscado, ni la dirección de nada.
 * - (b) Los totales no llevan el id de nadie ni una fecha más fina que la semana.
 * - (e) Si la base falla al escribir, el bot contesta exactamente lo mismo.
 * - (f) Sin escritor (el interruptor apagado), no se escribe nada ni se mira nada de más.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleWebhook } from './webhook.js';
import { resetInlineRate } from './inline.js';
import { makeInlineSource } from './inlineSource.js';
import { shortHash } from './nav.js';
import {
	EMPTY_SEARCH,
	SEARCH_KEY_MAX,
	arDay,
	createUsoRecorder,
	isoWeek,
	normalizeSearch,
	objectKey,
	personFrom,
	recentWeeks,
	usoWriter,
	weekRange
} from './uso.js';
import { classifyUpdate, screenKey } from './usoUpdate.js';

const SECRET = 'un-secreto-de-prueba-largo';
const ORIGIN = 'https://ejemplo.test';
const TOKEN = '123456789:token-inventado-solo-para-pruebas';
/** Un martes a las 22:30 de Argentina (01:30 UTC del miércoles). */
const NOW = Date.parse('2031-02-12T01:30:00Z');
const USER = { id: 4242, first_name: 'Persona Inventada', username: 'inventade' };
const SLUG = 'fiesta-inventada-2031-02';
const EVENTS = [{ slug: SLUG, title: 'Fiesta inventada', start: '2031-02-14T23:00:00-03:00' }];

const source = () =>
	makeInlineSource({
		raw: {
			v: 1,
			docs: [
				{ c: 'calendario', h: `/calendario/${SLUG}`, t: 'Fiesta inventada', d: EVENTS[0].start },
				{ c: 'material', h: '/material/cuerdas-inventadas', t: 'Cuerdas inventadas' }
			],
			tags: {}
		},
		posts: [],
		wikiPosts: [],
		profiles: null
	});

/**
 * D1 falsa: anota cada tanda (sentencia y parámetros). Con `fail`, la tanda tira.
 *
 * @param {{ fail?: boolean }} [opts]
 */
function fakeDB({ fail = false } = {}) {
	/** @type {{ sql: string, args: unknown[] }[]} */
	const written = [];
	const db = {
		prepare(/** @type {string} */ sql) {
			return { sql, args: [], bind: (/** @type {unknown[]} */ ...args) => ({ sql, args }) };
		},
		async batch(/** @type {{ sql: string, args: unknown[] }[]} */ stmts) {
			if (fail) throw new Error('D1 caída de prueba');
			written.push(...stmts);
			return stmts.map(() => ({ results: [], meta: {} }));
		}
	};
	return { db: /** @type {any} */ (db), written };
}

/** @param {object} update */
const req = (update) =>
	new Request(`${ORIGIN}/api/telegram`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
		body: JSON.stringify(update)
	});

/**
 * El webhook como lo arma la ruta, con o sin estadísticas.
 *
 * @param {object} update
 * @param {Partial<Parameters<typeof handleWebhook>[0]>} [over]
 */
const run = (update, over = {}) =>
	handleWebhook({
		request: req(update),
		secret: SECRET,
		enabled: true,
		origin: ORIGIN,
		listUpcoming: async () => EVENTS,
		inline: { source: async () => source() },
		...over
	});

const priv = { id: USER.id, type: 'private' };
/** Updates de todo tipo, con búsquedas y cosas abiertas. */
const UPDATES = [
	{ message: { chat: priv, from: USER, text: '/buscar cuerdas inventadas' } },
	{ message: { chat: priv, from: USER, text: '/evento fiesta' } },
	{ message: { chat: priv, from: USER, text: '/start ABCD2345' } },
	{
		callback_query: {
			id: 'cb',
			from: USER,
			data: `r:${shortHash('/material/cuerdas-inventadas')}:0:cuerdas`,
			message: { message_id: 3, chat: priv }
		}
	},
	{
		callback_query: {
			id: 'cb',
			from: USER,
			data: `e:${SLUG}:p`,
			message: { message_id: 3, chat: priv }
		}
	},
	{ inline_query: { id: 'iq', from: USER, query: 'Cuerdas  Inventadas', offset: '' } },
	{ chosen_inline_result: { result_id: '0', from: USER, query: 'cuerdas' } }
];

beforeEach(() => resetInlineRate());

describe('(a) la fila de la persona', () => {
	it('solo id, día, nombre y @usuario: ni acción, ni búsqueda, ni dirección, ni hora', async () => {
		for (const update of UPDATES) {
			const { db, written } = fakeDB();
			await run(update, { uso: usoWriter(db, () => NOW) });
			const person = written.filter((s) => s.sql.includes('telegram_uso_personas'));
			expect(person, JSON.stringify(update)).toHaveLength(1);
			const [stmt] = person;
			expect(stmt.args).toEqual(['4242', '2031-02-11', 'Persona Inventada', 'inventade']);
			// La sentencia no nombra ninguna columna de qué se hizo.
			expect(stmt.sql).not.toMatch(/tipo|clave|semana/);
			const text = JSON.stringify(stmt.args).toLowerCase();
			for (const secret of ['cuerdas', 'fiesta', SLUG, 'abcd2345', 'buscar', 'evento']) {
				expect(text).not.toContain(secret);
			}
		}
	});
});

describe('(b) los totales de la semana', () => {
	it('sin id de nadie ni fecha más fina que la semana', async () => {
		/** @type {{ sql: string, args: unknown[] }[]} */
		const all = [];
		for (const update of UPDATES) {
			const { db, written } = fakeDB();
			await run(update, { uso: usoWriter(db, () => NOW) });
			all.push(...written.filter((s) => s.sql.includes('telegram_uso_totales')));
		}
		expect(all.length).toBeGreaterThan(0);
		for (const s of all) {
			expect(s.sql).not.toMatch(/telegram_id|dia|nombre|usuario/);
			const [week, tipo, clave, n] = s.args;
			expect(week).toBe('2031-W07');
			expect(typeof tipo).toBe('string');
			expect(typeof n).toBe('number');
			const text = JSON.stringify(s.args);
			expect(text).not.toContain('4242');
			expect(text).not.toContain('inventade');
			expect(text).not.toContain('Persona');
			// Ningún día ni hora.
			expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{2}:\d{2}|\d{12,}/);
			expect(String(clave)).not.toMatch(/ABCD2345/i);
		}
		// Y sí cuenta lo que tiene que contar (sin quién).
		const keys = all.map((s) => `${s.args[1]}|${s.args[2]}`);
		expect(keys).toEqual(
			expect.arrayContaining([
				'comando|buscar',
				'busqueda|cuerdas inventadas',
				'busqueda|fiesta',
				'comando|start',
				'pantalla|site_doc',
				'objeto|material:cuerdas-inventadas',
				'pantalla|event',
				`objeto|evento:${SLUG}`,
				'inline|cuerdas inventadas',
				'inline_elegido|material:cuerdas-inventadas'
			])
		);
	});
});

describe('(e) si la base falla, el bot contesta igual', () => {
	it('sin token: la misma respuesta, byte a byte', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		for (const update of UPDATES) {
			const plain = await (await run(update)).text();
			const broken = fakeDB({ fail: true });
			const res = await run(update, { uso: usoWriter(broken.db, () => NOW) });
			expect(res.status).toBe(200);
			expect(await res.text(), JSON.stringify(update)).toBe(plain);
			// Un escritor que tira (no el de uso.js) tampoco cambia nada.
			const throwing = await run(update, {
				uso: async () => {
					throw new Error('falla de prueba');
				}
			});
			expect(await throwing.text()).toBe(plain);
		}
		spy.mockRestore();
	});

	it('con token: las mismas llamadas a Telegram', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		/**
		 * @param {object} update
		 * @param {Partial<Parameters<typeof handleWebhook>[0]>} over
		 */
		const calls = async (update, over) => {
			/** @type {string[]} */
			const sent = [];
			/** @type {any} */
			const fetch = vi.fn(async (/** @type {string} */ url, /** @type {any} */ init) => {
				sent.push(
					`${url.split('/').pop()} ${init?.body instanceof FormData ? 'form' : init?.body}`
				);
				return new Response(JSON.stringify({ ok: true, result: { message_id: 5 } }));
			});
			const res = await run(update, { token: TOKEN, fetch, ...over });
			expect(res.status).toBe(200);
			return sent;
		};
		for (const update of UPDATES) {
			const plain = await calls(update, {});
			const broken = fakeDB({ fail: true });
			expect(await calls(update, { uso: usoWriter(broken.db, () => NOW) })).toEqual(plain);
		}
		spy.mockRestore();
	});
});

describe('(f) sin escritor (interruptor apagado)', () => {
	it('no escribe nada y no lee el índice para contar un resultado inline', async () => {
		const read = vi.fn(async () => source());
		const res = await run(
			{ chosen_inline_result: { result_id: '0', from: USER, query: 'cuerdas' } },
			{ inline: { source: read }, uso: null }
		);
		expect(res.status).toBe(200);
		expect(read).not.toHaveBeenCalled();
	});
});

describe('qué se cuenta de cada update', () => {
	it('un comando por su nombre, nunca lo que viene después', () => {
		const c = (/** @type {string} */ text) =>
			classifyUpdate({ message: { chat: priv, from: USER, text } }).counts;
		expect(c('/start ABCD2345')).toEqual([{ tipo: 'comando', clave: 'start' }]);
		expect(c('/vincular ABCD-2345')).toEqual([{ tipo: 'comando', clave: 'vincular' }]);
		expect(c('/estado')).toEqual([{ tipo: 'comando', clave: 'estado' }]);
		expect(c('/cualquiercosa secreto')).toEqual([{ tipo: 'comando', clave: '(otro)' }]);
		expect(c('hola')).toEqual([]);
	});

	it('un botón por su pantalla, sin ids, hashes ni búsquedas', () => {
		expect(screenKey('h')).toBe('home');
		expect(screenKey('l:w:2')).toBe('list:w');
		expect(screenKey(`e:${SLUG}:p`)).toBe('event');
		expect(screenKey('q:1:cuerdas')).toBe('site_results');
		expect(screenKey('cd:m:abcdefg:0')).toBe('section_doc:m');
		expect(screenKey('ax:0')).toBe('admin');
		expect(screenKey('x')).toBe(null);
		expect(screenKey('cualquier cosa')).toBe(null);
	});

	it('el modo inline: solo la primera página, normalizado', () => {
		const q = (/** @type {string} */ query, offset = '') =>
			classifyUpdate({ inline_query: { id: 'i', from: USER, query, offset } }).counts;
		expect(q('  Cuerdas   Japonesas ')).toEqual([{ tipo: 'inline', clave: 'cuerdas japonesas' }]);
		expect(q('')).toEqual([{ tipo: 'inline', clave: EMPTY_SEARCH }]);
		expect(q('cuerdas', '20')).toEqual([]);
	});

	it('quién: id, nombre y @usuario; nunca un bot', () => {
		expect(personFrom(USER)).toEqual({
			id: '4242',
			nombre: 'Persona Inventada',
			usuario: 'inventade'
		});
		expect(personFrom({ id: 7 })).toEqual({ id: '7', nombre: '', usuario: '' });
		expect(personFrom({ id: 7, is_bot: true })).toBe(null);
		expect(personFrom({})).toBe(null);
	});

	it('el recorder suma lo repetido e ignora tipos que no existen', () => {
		const r = createUsoRecorder();
		r.add('pantalla', 'home');
		r.add('pantalla', 'home');
		r.add(/** @type {any} */ ('otra_cosa'), 'x');
		expect(r.counts()).toEqual([{ tipo: 'pantalla', clave: 'home', n: 2 }]);
	});
});

describe('normalizeSearch', () => {
	it('minúsculas, sin espacios de más, hasta 60 caracteres; vacía es «(vacía)»', () => {
		expect(normalizeSearch('  Atadura   ROPE  ')).toBe('atadura rope');
		expect(normalizeSearch('')).toBe(EMPTY_SEARCH);
		expect(normalizeSearch('   ')).toBe(EMPTY_SEARCH);
		expect(normalizeSearch(undefined)).toBe(EMPTY_SEARCH);
		expect(normalizeSearch('a'.repeat(80))).toHaveLength(SEARCH_KEY_MAX);
	});
});

describe('objectKey: solo lo público', () => {
	it('del índice público y listado; lo demás no se cuenta', () => {
		const s = source();
		expect(objectKey(s.docs[1], s)).toBe('material:cuerdas-inventadas');
		expect(objectKey(s.docs[0], s)).toBe(`evento:${SLUG}`);
		// Algo que no está en el índice (aunque se parezca a algo que sí).
		expect(objectKey({ ...s.docs[1] }, s)).toBe(null);
		// Un lugar no listado que el índice tiene porque lleva un evento.
		const venue = { c: /** @type {const} */ ('amigues'), h: '/amigues/casa', t: 'Casa' };
		const withVenue = {
			...s,
			docs: [...s.docs, venue],
			extras: new Map([[venue.h, { unlisted: true }]])
		};
		expect(objectKey(venue, withVenue)).toBe(null);
		expect(objectKey(undefined, s)).toBe(null);
	});
});

describe('días y semanas en hora de Argentina', () => {
	it('el día y la semana ISO', () => {
		expect(arDay(NOW)).toBe('2031-02-11');
		expect(isoWeek('2031-02-11')).toBe('2031-W07');
		// Bordes de año ISO.
		expect(isoWeek('2026-12-31')).toBe('2026-W53');
		expect(isoWeek('2027-01-03')).toBe('2026-W53');
		expect(isoWeek('2027-01-04')).toBe('2027-W01');
		expect(isoWeek('2025-12-29')).toBe('2026-W01');
		expect(weekRange('2031-W07')).toEqual({ from: '2031-02-10', to: '2031-02-16' });
		expect(weekRange('2026-W01')).toEqual({ from: '2025-12-29', to: '2026-01-04' });
		expect(recentWeeks(NOW, 3)).toEqual(['2031-W07', '2031-W06', '2031-W05']);
	});
});
