import { describe, expect, it, vi } from 'vitest';
import { dateWords, handleUpdate, matchEvents, parseCommand } from './router.js';

const ORIGIN = 'https://ejemplo.test';

/** Eventos inventados. */
const EVENTS = [
	{
		slug: 'taller-de-cuerdas-2031-01',
		title: 'Taller de cuerdas',
		start: '2031-01-10T21:00:00-03:00'
	},
	{
		slug: 'fiesta-inventada-2031-02',
		title: 'Fiesta inventada',
		start: '2031-02-14T23:00:00-03:00'
	},
	{
		slug: 'taller-de-teatro-2031-03',
		title: 'Taller de teatro',
		start: '2031-03-01T18:00:00-03:00'
	}
];

/** @param {string} text */
const update = (text) => ({ update_id: 1, message: { chat: { id: 42, type: 'private' }, text } });

const deps = () => ({ listUpcoming: vi.fn(async () => EVENTS), origin: ORIGIN });

describe('parseCommand', () => {
	it('separa el comando de los argumentos', () => {
		expect(parseCommand('/evento taller de cuerdas')).toEqual({
			name: 'evento',
			args: 'taller de cuerdas'
		});
	});

	it('ignora el @usuario del bot y las mayúsculas', () => {
		expect(parseCommand('/Proximos@KinkyBot')).toEqual({ name: 'proximos', args: '' });
	});

	it('no es un comando si no empieza con /', () => {
		expect(parseCommand('hola')).toBeNull();
		expect(parseCommand(undefined)).toBeNull();
		expect(parseCommand(42)).toBeNull();
	});
});

describe('matchEvents', () => {
	it('encuentra por dirección exacta', () => {
		expect(matchEvents(EVENTS, 'fiesta-inventada-2031-02').map((e) => e.title)).toEqual([
			'Fiesta inventada'
		]);
	});

	it('encuentra por palabras del título, sin importar tildes ni mayúsculas', () => {
		expect(matchEvents(EVENTS, 'FIESTA').length).toBe(1);
		expect(matchEvents(EVENTS, 'cuerdas taller').length).toBe(1);
	});

	it('devuelve varios si hay varios, y ninguno si no hay', () => {
		expect(matchEvents(EVENTS, 'taller').length).toBe(2);
		expect(matchEvents(EVENTS, 'inexistente')).toEqual([]);
		expect(matchEvents(EVENTS, '   ')).toEqual([]);
	});
});

describe('matchEvents por fecha', () => {
	// 2031-01-10 es viernes; 2031-02-14, viernes; 2031-03-01, sábado (hora de Argentina).
	it('encuentra por día de la semana, con o sin tilde', () => {
		expect(matchEvents(EVENTS, 'sábado').map((e) => e.title)).toEqual(['Taller de teatro']);
		expect(matchEvents(EVENTS, 'SABADO').length).toBe(1);
		expect(matchEvents(EVENTS, 'sab').length).toBe(1);
		expect(matchEvents(EVENTS, 'viernes').length).toBe(2);
	});

	it('encuentra por día y mes en números', () => {
		expect(matchEvents(EVENTS, '14/2').map((e) => e.title)).toEqual(['Fiesta inventada']);
		expect(matchEvents(EVENTS, '01/03').map((e) => e.title)).toEqual(['Taller de teatro']);
		expect(matchEvents(EVENTS, '1-3-2031').length).toBe(1);
		expect(matchEvents(EVENTS, '15/10')).toEqual([]);
	});

	it('combina palabras del título y de fecha, y acepta pedazos de palabra', () => {
		expect(matchEvents(EVENTS, 'taller viernes').map((e) => e.title)).toEqual([
			'Taller de cuerdas'
		]);
		expect(matchEvents(EVENTS, 'cuer').length).toBe(1);
		expect(matchEvents(EVENTS, 'taller marzo').map((e) => e.title)).toEqual(['Taller de teatro']);
	});

	it('la fecha se lee en hora de Argentina', () => {
		expect(dateWords('2031-03-02T01:00:00Z')).toMatchObject({ day: 1, month: 3 });
		expect(dateWords('no es una fecha')).toBeNull();
	});
});

/**
 * @param {unknown} data
 * @param {object} [over]
 */
const tap = (data, over = {}) => ({
	update_id: 3,
	callback_query: {
		id: 'cb-1',
		data,
		message: { message_id: 99, chat: { id: 42, type: 'private' } },
		...over
	}
});

describe('handleUpdate con botones', () => {
	it('tocar un evento cambia el mensaje por su detalle', async () => {
		const res = await handleUpdate(tap('ev:fiesta-inventada-2031-02'), deps());
		expect(res).toMatchObject({
			method: 'editMessageText',
			chat_id: 42,
			message_id: 99,
			parse_mode: 'HTML'
		});
		expect(res?.text).toContain('<b>Fiesta inventada</b>');
		expect(res?.text).toContain('https://ejemplo.test/calendario/fiesta-inventada-2031-02');
		expect(res?.reply_markup?.inline_keyboard.at(-1)).toEqual([
			{ text: '« Próximos eventos', callback_data: 'ls' }
		]);
	});

	it('«Próximos eventos» vuelve a la lista con sus botones', async () => {
		const res = await handleUpdate(tap('ls'), deps());
		expect(res).toMatchObject({ method: 'editMessageText', message_id: 99 });
		expect(res?.text).toContain('<b>Próximos eventos</b>');
		expect(res?.reply_markup?.inline_keyboard).toHaveLength(3);
	});

	it('un evento que ya no está entre los próximos: «ya no está disponible»', async () => {
		const res = await handleUpdate(tap('ev:evento-que-ya-paso-2030-01'), deps());
		expect(res).toEqual({
			method: 'answerCallbackQuery',
			callback_query_id: 'cb-1',
			text: 'Ese evento ya no está disponible.'
		});
	});

	it('el id del botón se busca solo entre lo que da listUpcoming', async () => {
		const d = deps();
		await handleUpdate(tap('ev:taller-de-cuerdas-2031-01'), d);
		expect(d.listUpcoming).toHaveBeenCalledTimes(1);
	});

	it('datos raros o inventados no rompen nada', async () => {
		for (const data of ['', 'otra-cosa', 'ev:<script>', 'ev:' + 'a'.repeat(70), 'ev:', null]) {
			const res = await handleUpdate(tap(data), deps());
			expect(res?.method).toBe('answerCallbackQuery');
		}
	});

	it('sin id del botón no contesta', async () => {
		expect(await handleUpdate({ callback_query: { data: 'ls' } }, deps())).toBeNull();
	});

	it('sin mensaje que cambiar, contesta el botón', async () => {
		const res = await handleUpdate(
			tap('ev:fiesta-inventada-2031-02', { message: undefined }),
			deps()
		);
		expect(res?.method).toBe('answerCallbackQuery');
	});

	it('si falla la lectura de eventos, contesta el botón con un error sin detalles', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const res = await handleUpdate(tap('ls'), {
			listUpcoming: async () => {
				throw new Error('secreto interno');
			},
			origin: ORIGIN
		});
		expect(res).toMatchObject({ method: 'answerCallbackQuery' });
		expect(res?.text).toContain('Algo salió mal');
		expect(res?.text).not.toContain('secreto interno');
		spy.mockRestore();
	});

	it('con un origen sin https no pone el botón al sitio (Telegram lo rechazaría)', async () => {
		const res = await handleUpdate(tap('ev:fiesta-inventada-2031-02'), {
			listUpcoming: async () => EVENTS,
			origin: 'http://localhost:5173'
		});
		expect(res?.reply_markup?.inline_keyboard).toEqual([
			[{ text: '« Próximos eventos', callback_data: 'ls' }]
		]);
	});
});

describe('handleUpdate', () => {
	it('/start y /ayuda muestran la ayuda', async () => {
		for (const text of ['/start', '/ayuda']) {
			const res = await handleUpdate(update(text), deps());
			expect(res).toMatchObject({ method: 'sendMessage', chat_id: 42, parse_mode: 'HTML' });
			expect(res?.text).toContain('/proximos');
		}
	});

	it('/proximos lista los eventos', async () => {
		const res = await handleUpdate(update('/proximos'), deps());
		expect(res?.text).toContain('Taller de cuerdas');
		expect(res?.text).toContain('Fiesta inventada');
	});

	it('/evento sin nada muestra los próximos para elegir con botones', async () => {
		const res = await handleUpdate(update('/evento'), deps());
		expect(res?.text).toContain('Tocá el evento que querés ver');
		expect(res?.text).toContain('/evento taller de shibari');
		expect(
			res?.reply_markup?.inline_keyboard.map((/** @type {any} */ row) => row[0].callback_data)
		).toEqual([
			'ev:taller-de-cuerdas-2031-01',
			'ev:fiesta-inventada-2031-02',
			'ev:taller-de-teatro-2031-03'
		]);
	});

	it('/evento sin nada y sin eventos: avisa, sin botones', async () => {
		const res = await handleUpdate(update('/evento'), {
			listUpcoming: async () => [],
			origin: ORIGIN
		});
		expect(res?.text).toContain('no hay eventos próximos');
		expect(res).not.toHaveProperty('reply_markup');
	});

	it('/evento con una coincidencia muestra el detalle', async () => {
		const res = await handleUpdate(update('/evento fiesta'), deps());
		expect(res?.text).toContain('<b>Fiesta inventada</b>');
		expect(res?.text).toContain('https://ejemplo.test/calendario/fiesta-inventada-2031-02');
	});

	it('/evento con varias coincidencias deja elegir con un botón por cada una', async () => {
		const res = await handleUpdate(update('/evento taller'), deps());
		expect(res?.text).toContain('¿Cuál querés ver?');
		expect(res?.reply_markup?.inline_keyboard).toEqual([
			[{ text: 'Ver: Taller de cuerdas', callback_data: 'ev:taller-de-cuerdas-2031-01' }],
			[{ text: 'Ver: Taller de teatro', callback_data: 'ev:taller-de-teatro-2031-03' }]
		]);
	});

	it('/evento con una coincidencia trae el botón al sitio y a la lista', async () => {
		const res = await handleUpdate(update('/evento fiesta'), deps());
		expect(res?.reply_markup?.inline_keyboard).toEqual([
			[
				{
					text: 'Abrir en el sitio',
					url: 'https://ejemplo.test/calendario/fiesta-inventada-2031-02'
				}
			],
			[{ text: '« Próximos eventos', callback_data: 'ls' }]
		]);
	});

	it('/proximos trae un botón «Ver» por evento', async () => {
		const res = await handleUpdate(update('/proximos'), deps());
		const rows = res?.reply_markup?.inline_keyboard;
		expect(rows).toHaveLength(3);
		expect(rows[1]).toEqual([
			{ text: 'Ver: Fiesta inventada', callback_data: 'ev:fiesta-inventada-2031-02' }
		]);
	});

	it('/proximos sin eventos no trae botones', async () => {
		const res = await handleUpdate(update('/proximos'), {
			listUpcoming: async () => [],
			origin: ORIGIN
		});
		expect(res).not.toHaveProperty('reply_markup');
	});

	it('/evento sin coincidencias avisa', async () => {
		const res = await handleUpdate(update('/evento nada'), deps());
		expect(res?.text).toContain('No encontré ese evento');
	});

	it('un comando desconocido manda a /ayuda', async () => {
		const res = await handleUpdate(update('/inventado'), deps());
		expect(res?.text).toContain('/ayuda');
	});

	it('no contesta a mensajes que no son comandos ni a updates raros', async () => {
		expect(await handleUpdate(update('hola'), deps())).toBeNull();
		expect(await handleUpdate({ update_id: 2 }, deps())).toBeNull();
		expect(await handleUpdate(null, deps())).toBeNull();
		expect(await handleUpdate({ message: { text: '/proximos' } }, deps())).toBeNull();
	});

	it('si falla la lectura de eventos, contesta un error sin detalles', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const res = await handleUpdate(update('/proximos'), {
			listUpcoming: async () => {
				throw new Error('secreto interno');
			},
			origin: ORIGIN
		});
		expect(res?.text).toContain('Algo salió mal');
		expect(res?.text).not.toContain('secreto interno');
		spy.mockRestore();
	});
});
