import { describe, expect, it, vi } from 'vitest';
import { handleUpdate, matchEvents, parseCommand } from './router.js';

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

	it('/evento sin nada pide el nombre', async () => {
		const d = deps();
		const res = await handleUpdate(update('/evento'), d);
		expect(res?.text).toContain('Decime qué evento');
		expect(d.listUpcoming).not.toHaveBeenCalled();
	});

	it('/evento con una coincidencia muestra el detalle', async () => {
		const res = await handleUpdate(update('/evento fiesta'), deps());
		expect(res?.text).toContain('<b>Fiesta inventada</b>');
		expect(res?.text).toContain('https://ejemplo.test/calendario/fiesta-inventada-2031-02');
	});

	it('/evento con varias coincidencias deja elegir', async () => {
		const res = await handleUpdate(update('/evento taller'), deps());
		expect(res?.text).toContain('¿Cuál querés ver?');
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
