/**
 * «📊 Estado» y «🔔 Mis avisos» (decisión 0041): los botones (adminNav.js) y las pantallas
 * (adminBot.js), sin base. Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { NOTICE_CODES, NOTICE_KINDS, decodeAdminNav, encodeAdminNav } from './adminNav.js';
import {
	adminEventsScreen,
	adminNoticesScreen,
	adminResult,
	adminStatusScreen,
	noticeLabel
} from './adminBot.js';
import { adminEventChoices } from './adminData.js';
import { decodeNav, encodeNav, shortHash } from './nav.js';

const ORIGIN = 'https://ejemplo.test';
const NOW = Date.parse('2031-01-08T12:00:00-03:00');
const CTX = /** @type {const} */ ({ origin: ORIGIN, chat: 'private', now: NOW });

/** @param {number} i */
const choice = (i, over = {}) => ({
	slug: `evento-${i}`,
	hash: shortHash(`evento-${i}`),
	title: `Evento inventado ${i}`,
	start: new Date(NOW + (i + 1) * 86_400_000).toISOString(),
	today: false,
	cancelled: false,
	...over
});

/** @param {Partial<import('./adminData.js').EventStatus>} [over] */
const status = (over = {}) => ({
	types: [
		{
			id: 'general',
			name: 'General <b>',
			sold: 12,
			held: 2,
			capacity: 40,
			tiers: [
				{ id: 'p1', name: 'Preventa 1', sold: 10, quantity: 10, current: false },
				{ id: 'final', name: 'Final', sold: 2, quantity: null, current: true }
			]
		},
		{ id: 'gorra', name: 'A la gorra', sold: 3, held: 0, capacity: null, tiers: [] }
	],
	sold: 15,
	capacity: null,
	held: 2,
	expiring: 1,
	transfers: 2,
	review: 1,
	waitlist: 5,
	...over
});

/** Todos los textos de botones de una pantalla. @param {import('./screens.js').Screen} s */
const buttons = (s) => s.keyboard.flat();

describe('adminNav: los botones de admins', () => {
	const states = /** @type {import('./adminNav.js').AdminNavState[]} */ ([
		{ screen: 'admin_events', page: 0 },
		{ screen: 'admin_events', page: 12 },
		{ screen: 'admin_event', hash: shortHash('fiesta-inventada') },
		{ screen: 'admin_notices' },
		...Object.keys(NOTICE_CODES).map((code) => ({
			screen: /** @type {const} */ ('admin_notice'),
			code: /** @type {keyof typeof NOTICE_CODES} */ (code)
		}))
	]);

	it('ida y vuelta, cortos y sin confundirse con los de nav.js', () => {
		for (const state of states) {
			const data = encodeAdminNav(state);
			expect(decodeAdminNav(data), data).toEqual(state);
			expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
			expect(decodeNav(data), data).toBeNull();
		}
		// Y al revés: ningún botón de nav.js se lee como de admins.
		for (const data of [
			encodeNav({ screen: 'home' }),
			encodeNav({ screen: 'help' }),
			encodeNav({ screen: 'list', view: 'p', page: 1 }),
			encodeNav({ screen: 'event', id: 'fiesta-inventada', back: 'n' }),
			encodeNav({ screen: 'follow', id: 'fiesta-inventada' }),
			encodeNav({ screen: 'noop' })
		]) {
			expect(decodeAdminNav(data), data).toBeNull();
		}
	});

	it('lo roto o armado raro no se entiende', () => {
		for (const data of [
			'',
			'ax',
			'ax:',
			'ax:-1',
			'ax:1000',
			'ae:',
			'ae:ABC',
			'ae:../x',
			'ae:12345678',
			'an:z',
			'an:d:x',
			'an:',
			'ax:1:2',
			'a'.repeat(200),
			null,
			42
		]) {
			expect(decodeAdminNav(data), String(data)).toBeNull();
		}
	});

	it('los tipos de aviso: los cinco de las partes 2 a 4, en orden', () => {
		expect(NOTICE_KINDS).toEqual([
			'resumen_diario',
			'cada_venta',
			'transferencia',
			'dia_evento',
			'recordatorios'
		]);
		expect(NOTICE_KINDS.map(noticeLabel)).toEqual([
			'Resumen diario',
			'Cada venta',
			'Cada transferencia',
			'Día del evento',
			'Recordatorios'
		]);
	});
});

describe('adminEventChoices', () => {
	it('los de hoy y los que vienen, del más cercano al más lejano; sin los que ya pasaron', () => {
		/** @param {string} slug @param {number} offset @param {object} [more] */
		const ev = (slug, offset, more = {}) => ({
			slug,
			config: { title: `T ${slug}`, start: new Date(NOW + offset).toISOString(), ...more }
		});
		const out = adminEventChoices(
			[
				ev('lejos', 30 * 86_400_000),
				ev('paso', -3 * 86_400_000),
				ev('hoy', 2 * 3_600_000),
				ev('cancelado', 86_400_000, { status: 'cancelled' }),
				{ slug: 'sin-fecha', config: { title: 'x' } }
			],
			NOW
		);
		expect(out.map((c) => c.slug)).toEqual(['hoy', 'cancelado', 'lejos']);
		expect(out[0]).toMatchObject({ today: true, cancelled: false, hash: shortHash('hoy') });
		expect(out[1].cancelled).toBe(true);
	});
});

describe('las pantallas', () => {
	it('sin eventos: lo dice, con «Mis avisos» e «Inicio»', () => {
		const s = adminEventsScreen([], 0, CTX);
		expect(s.text).toContain('No hay eventos con venta de entradas');
		expect(buttons(s).map((b) => b.callback_data)).toEqual(['an', 'h']);
	});

	it('la lista: de a 5, un botón por evento (título escapado en el texto), paginada', () => {
		const many = Array.from({ length: 7 }, (_, i) =>
			choice(i, i === 0 ? { title: 'Fiesta <x> & más', cancelled: true } : {})
		);
		const first = adminEventsScreen(many, 0, CTX);
		expect(first.text).toContain('<b>Fiesta &lt;x&gt; &amp; más</b> · ❌ Cancelado');
		expect(first.keyboard.slice(0, 5).map((row) => row[0].callback_data)).toEqual(
			many.slice(0, 5).map((c) => `ae:${c.hash}`)
		);
		expect(first.keyboard[5].map((b) => b.callback_data ?? b.text)).toEqual(['1/2', 'ax:1']);
		const second = adminEventsScreen(many, 1, CTX);
		expect(second.keyboard.slice(0, 2).map((row) => row[0].text)).toEqual([
			'📊 Evento inventado 5',
			'📊 Evento inventado 6'
		]);
		for (const b of [...buttons(first), ...buttons(second)]) {
			expect(new TextEncoder().encode(b.text).length).toBeLessThanOrEqual(64);
		}
	});

	it('el estado: vendidas contra cupo por tipo y tramo, lo pendiente, panel y volver', () => {
		const s = adminStatusScreen(choice(1), status(), CTX);
		expect(s.text).toContain('<b>📊 Evento inventado 1</b>');
		expect(s.text).toContain('🎟 <b>General &lt;b&gt;</b>: 12 de 40 vendidas');
		expect(s.text).toContain('↳ Preventa 1: 10 de 10\n↳ Final: 2 ← a la venta');
		expect(s.text).toContain('🎟 <b>A la gorra</b>: 3 vendidas (sin cupo)');
		expect(s.text).toContain('<b>Total</b>: 15 vendidas');
		expect(s.text).toContain('⏳ Reservas sin pagar: 2 · vencen en la próxima hora: 1');
		expect(s.text).toContain('💸 Transferencias por confirmar: 2');
		expect(s.text).toContain('⚠️ Órdenes para revisar: 1');
		expect(s.text).toContain('📝 En la lista de espera: 5');
		expect(s.text).not.toContain('Sin reservas sin pagar');
		expect(s.keyboard).toEqual([
			[
				{ text: '🔄 Actualizar', callback_data: `ae:${choice(1).hash}` },
				{ text: 'Ver en el panel ↗', url: `${ORIGIN}/admin/eventos/evento-1` }
			],
			[
				{ text: '‹ Volver', callback_data: 'ax:0' },
				{ text: '🏠 Inicio', callback_data: 'h' }
			]
		]);
	});

	it('el estado sin nada pendiente, sin lista de espera (tabla que no existe) y con un solo tipo', () => {
		const s = adminStatusScreen(
			choice(2, { cancelled: true }),
			status({
				types: [{ id: 'g', name: 'General', sold: 0, held: 0, capacity: 30, tiers: [] }],
				sold: 0,
				capacity: 30,
				held: 0,
				expiring: 0,
				transfers: 0,
				review: 0,
				waitlist: null
			}),
			{ ...CTX, origin: 'http://localhost:5173' }
		);
		expect(s.text).toContain('❌ Cancelado');
		expect(s.text).toContain('🎟 <b>General</b>: 0 de 30 vendidas');
		expect(s.text).not.toContain('Total');
		expect(s.text).toContain('✅ Sin reservas sin pagar ni nada para revisar.');
		expect(s.text).not.toContain('lista de espera');
		expect(s.text).toContain('Solo cantidades');
		// Sin https, sin el link al panel (Telegram no acepta links locales).
		expect(buttons(s).some((b) => 'url' in b)).toBe(false);
	});

	it('Mis avisos: todos apagados por defecto, ✅ los prendidos', () => {
		const off = adminNoticesScreen(new Set());
		expect(off.keyboard.slice(0, 5).map((row) => row[0].text)).toEqual([
			'⬜ Resumen diario',
			'⬜ Cada venta',
			'⬜ Cada transferencia',
			'⬜ Día del evento',
			'⬜ Recordatorios'
		]);
		expect(off.keyboard.slice(0, 5).map((row) => row[0].callback_data)).toEqual([
			'an:d',
			'an:v',
			'an:t',
			'an:e',
			'an:r'
		]);
		expect(off.text).toContain('Vienen todos apagados');
		const on = adminNoticesScreen(new Set(['cada_venta']));
		expect(on.keyboard[1][0].text).toBe('✅ Cada venta');
		expect(on.keyboard[0][0].text).toBe('⬜ Resumen diario');
	});
});

describe('adminResult', () => {
	const who = { id: 1, login: 'admin-inventade' };
	/** @param {Set<string>} [start] */
	const fakeAdmin = (start = new Set()) => {
		/** @type {Set<any>} */
		let on = new Set(start);
		return {
			who: async () => who,
			events: async () => [choice(1), choice(2)],
			status: async (/** @type {string} */ slug) => (slug === 'evento-2' ? null : status()),
			notices: async () => new Set(on),
			setNotice: async (
				/** @type {number} */ _id,
				/** @type {any} */ kind,
				/** @type {boolean} */ value
			) => {
				on = new Set(on);
				if (value) on.add(kind);
				else on.delete(kind);
				return new Set(on);
			}
		};
	};

	it('un evento que no está entre los próximos (o ya no vende): lo mismo que un botón viejo', async () => {
		const admin = fakeAdmin();
		expect(await adminResult({ screen: 'admin_event', hash: 'zzzz' }, who, CTX, admin)).toEqual({
			toast: 'Ese evento ya no está disponible.'
		});
		expect(
			await adminResult({ screen: 'admin_event', hash: choice(2).hash }, who, CTX, admin)
		).toEqual({ toast: 'Ese evento ya no está disponible.' });
		const ok = await adminResult({ screen: 'admin_event', hash: choice(1).hash }, who, CTX, admin);
		expect('screen' in ok && ok.screen.text).toContain('Evento inventado 1');
	});

	it('prender y apagar un aviso: cambia el botón y avisa', async () => {
		const admin = fakeAdmin();
		const on = await adminResult({ screen: 'admin_notice', code: 'v' }, who, CTX, admin);
		expect(on).toMatchObject({ toast: 'Prendido: Cada venta' });
		expect('screen' in on && on.screen.keyboard[1][0].text).toBe('✅ Cada venta');
		const off = await adminResult({ screen: 'admin_notice', code: 'v' }, who, CTX, admin);
		expect(off).toMatchObject({ toast: 'Apagado: Cada venta' });
		expect('screen' in off && off.screen.keyboard[1][0].text).toBe('⬜ Cada venta');
	});
});
