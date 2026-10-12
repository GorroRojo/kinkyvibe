import { describe, expect, it } from 'vitest';
import {
	DEFAULT_WAITLIST_SETTINGS,
	effectiveWaitlistSettings,
	holdUntil,
	parseEventWaitlist,
	parseHoldTiers,
	parseWaitlistSettings,
	tierHoldHours,
	waitlistCutoff,
	waitlistSettingsProblem
} from './waitlistHold.js';

const H = 60 * 60 * 1000;
const MIN = 60 * 1000;
const START = Date.parse('2026-11-14T21:00:00-03:00');
const settings = parseWaitlistSettings('');

/** @param {number} untilStart ms antes del comienzo */
const at = (untilStart) => START - untilStart;

describe('holdUntil: tramos por defecto', () => {
	// [cuánto falta para el comienzo, resultado esperado]
	/** @type {[string, number, import('./waitlistHold.js').HoldResult | ((now: number) => import('./waitlistHold.js').HoldResult)][]} */
	const table = [
		['30 días', 30 * 24 * H, (now) => ({ kind: 'hold', until: now + 24 * H })],
		['7 días + 1 ms', 168 * H + 1, (now) => ({ kind: 'hold', until: now + 24 * H })],
		['7 días justos', 168 * H, (now) => ({ kind: 'hold', until: now + 24 * H })],
		['7 días − 1 ms', 168 * H - 1, (now) => ({ kind: 'hold', until: now + 12 * H })],
		['3 días', 72 * H, (now) => ({ kind: 'hold', until: now + 12 * H })],
		['48 h justas', 48 * H, (now) => ({ kind: 'hold', until: now + 12 * H })],
		['48 h − 1 ms', 48 * H - 1, (now) => ({ kind: 'hold', until: now + 2 * H })],
		['24 h', 24 * H, (now) => ({ kind: 'hold', until: now + 2 * H })],
		['7 h', 7 * H, (now) => ({ kind: 'hold', until: now + 2 * H })],
		['6 h justas', 6 * H, (now) => ({ kind: 'hold', until: now + 2 * H })],
		['6 h − 1 ms', 6 * H - 1, { kind: 'broadcast' }],
		['2 h', 2 * H, { kind: 'broadcast' }],
		['30 min + 1 ms', 30 * MIN + 1, { kind: 'broadcast' }],
		['30 min justos (cierre)', 30 * MIN, { kind: 'closed' }],
		['10 min', 10 * MIN, { kind: 'closed' }],
		['ya empezó', -H, { kind: 'closed' }]
	];
	for (const [name, untilStart, expected] of table) {
		it(name, () => {
			const now = at(untilStart);
			const want = typeof expected === 'function' ? expected(now) : expected;
			expect(holdUntil({ now, start: START, salesClose: null, settings })).toEqual(want);
		});
	}

	it('la reserva nunca pasa del cierre (comienzo − 30 min)', () => {
		// Un tramo de 12 h con 12 h por delante: corta en el cierre.
		const tiers = [{ overHours: 6, holdHours: 12 }];
		const now = at(12 * H);
		expect(
			holdUntil({ now, start: START, salesClose: null, settings: { ...settings, tiers } })
		).toEqual({ kind: 'hold', until: START - 30 * MIN });
	});

	it('el cierre de la venta antes del comienzo acorta la reserva y cierra la lista', () => {
		const salesClose = START - 3 * 24 * H;
		// Faltan 4 días: 12 h, pero la venta cierra en 1 día → 12 h igual.
		let now = at(4 * 24 * H);
		expect(holdUntil({ now, start: START, salesClose, settings })).toEqual({
			kind: 'hold',
			until: now + 12 * H
		});
		// Faltan 3 días y 5 h: 12 h cortadas a las 5 h que quedan de venta.
		now = at(3 * 24 * H + 5 * H);
		expect(holdUntil({ now, start: START, salesClose, settings })).toEqual({
			kind: 'hold',
			until: salesClose
		});
		// Venta cerrada: la lista también.
		now = salesClose;
		expect(holdUntil({ now, start: START, salesClose, settings })).toEqual({ kind: 'closed' });
		expect(
			holdUntil({ now: START - 10 * H, start: START, salesClose: new Date(salesClose), settings })
		).toEqual({ kind: 'closed' });
	});

	it('un cierre de venta después del comienzo no estira nada', () => {
		const now = at(H);
		expect(holdUntil({ now, start: START, salesClose: START + 2 * H, settings })).toEqual({
			kind: 'broadcast'
		});
		expect(holdUntil({ now: at(10 * MIN), start: START, salesClose: START + H, settings })).toEqual(
			{ kind: 'closed' }
		);
	});

	it('acepta el comienzo como texto ISO o Date', () => {
		const now = at(72 * H);
		const want = { kind: 'hold', until: now + 12 * H };
		expect(holdUntil({ now, start: '2026-11-14T21:00-03:00', settings })).toEqual(want);
		expect(holdUntil({ now, start: new Date(START), settings })).toEqual(want);
	});

	it('sin comienzo: el tramo más largo y solo el cierre de la venta', () => {
		const now = START;
		expect(holdUntil({ now, start: null, salesClose: null, settings })).toEqual({
			kind: 'hold',
			until: now + 24 * H
		});
		expect(holdUntil({ now, start: 'no-es-fecha', salesClose: now + H, settings })).toEqual({
			kind: 'hold',
			until: now + H
		});
		expect(holdUntil({ now, start: null, salesClose: now, settings })).toEqual({ kind: 'closed' });
	});
});

describe('holdUntil: ajustes del evento', () => {
	it('«todes a la vez» avisa a toda la lista desde el principio', () => {
		const s = effectiveWaitlistSettings(settings, { scope: 'event', allAtOnce: true });
		expect(s.mode).toBe('all');
		expect(holdUntil({ now: at(30 * 24 * H), start: START, settings: s })).toEqual({
			kind: 'broadcast'
		});
		// Pasado el cierre, cerrada igual.
		expect(holdUntil({ now: at(10 * MIN), start: START, settings: s })).toEqual({ kind: 'closed' });
	});

	it('el modo global «all» también', () => {
		const s = parseWaitlistSettings({ mode: 'all' });
		expect(holdUntil({ now: at(30 * 24 * H), start: START, settings: s })).toEqual({
			kind: 'broadcast'
		});
	});

	it('los tramos son siempre los de Ajustes (gorrite, 12/10: no se eligen por evento)', () => {
		// Un evento con `tiers` de antes (a mano): se ignoran.
		const s = effectiveWaitlistSettings(
			settings,
			/** @type {any} */ ({
				scope: 'type',
				allAtOnce: false,
				tiers: [{ overHours: 72, holdHours: 6 }]
			})
		);
		expect(s.mode).toBe('one');
		expect(s.tiers).toEqual(settings.tiers);
		expect(holdUntil({ now: at(10 * 24 * H), start: START, settings: s })).toEqual({
			kind: 'hold',
			until: at(10 * 24 * H) + 24 * H
		});
		// Sin lista del evento, los globales; no toca los de Ajustes.
		expect(effectiveWaitlistSettings(settings, null).tiers).toEqual(settings.tiers);
		expect(DEFAULT_WAITLIST_SETTINGS.tiers[0]).toEqual({ overHours: 168, holdHours: 24 });
	});

	it('cierre y aviso a todes configurables', () => {
		const s = parseWaitlistSettings({ broadcastUnderHours: 0, endBeforeStartMinutes: 0 });
		// Sin aviso a todes: hasta el comienzo con reserva (cortada en el comienzo).
		expect(holdUntil({ now: at(H), start: START, settings: s })).toEqual({
			kind: 'hold',
			until: START
		});
		expect(holdUntil({ now: START, start: START, settings: s })).toEqual({ kind: 'closed' });
		expect(waitlistCutoff({ start: START, salesClose: null, settings: s })).toBe(START);
		expect(waitlistCutoff({ start: null, salesClose: null, settings: s })).toBeNull();
	});
});

describe('holdUntil: propiedades', () => {
	// Generador determinístico (sin depender del azar de la corrida).
	let seed = 12345;
	const rand = () => {
		seed = (seed * 1103515245 + 12345) % 2 ** 31;
		return seed / 2 ** 31;
	};

	it('con reserva: siempre después de ahora y nunca después del cierre', () => {
		for (let i = 0; i < 2000; i++) {
			const nTiers = 1 + Math.floor(rand() * 4);
			const tiers = Array.from({ length: nTiers }, (_, k) => ({
				overHours: k * 24 + Math.floor(rand() * 24),
				holdHours: 1 + Math.floor(rand() * 48)
			}));
			const parsedTiers = parseHoldTiers(tiers);
			if (!parsedTiers) continue;
			const s = {
				mode: /** @type {'one'} */ ('one'),
				tiers: parsedTiers,
				broadcastUnderHours: Math.floor(rand() * 12),
				endBeforeStartMinutes: Math.floor(rand() * 120)
			};
			const now = START - Math.floor(rand() * 40 * 24 * H) + 2 * H;
			const salesClose = rand() < 0.5 ? null : START - Math.floor(rand() * 10 * 24 * H);
			const r = holdUntil({ now, start: START, salesClose, settings: s });
			const cutoff = /** @type {number} */ (
				waitlistCutoff({ start: START, salesClose, settings: s })
			);
			if (now >= cutoff) {
				expect(r).toEqual({ kind: 'closed' });
				continue;
			}
			if (START - now < s.broadcastUnderHours * H) {
				expect(r).toEqual({ kind: 'broadcast' });
				continue;
			}
			expect(r.kind).toBe('hold');
			const until = /** @type {{ until: number }} */ (r).until;
			expect(until).toBeGreaterThan(now);
			expect(until).toBeLessThanOrEqual(cutoff);
			expect(until - now).toBeLessThanOrEqual(tierHoldHours(s.tiers, START - now) * H);
		}
	});

	it('más tiempo por delante nunca da una reserva más corta (tramos por defecto, sin cortes)', () => {
		let prev = 0;
		for (let h = 7; h <= 24 * 30; h++) {
			const r = holdUntil({ now: at(h * H), start: START, settings });
			expect(r.kind).toBe('hold');
			const len = /** @type {{ until: number }} */ (r).until - at(h * H);
			expect(len).toBeGreaterThanOrEqual(prev);
			prev = len;
		}
	});
});

describe('ajustes globales (ticket_settings.waitlist)', () => {
	it('vacío o roto: los de por defecto', () => {
		const d = {
			mode: 'one',
			tiers: [
				{ overHours: 168, holdHours: 24 },
				{ overHours: 48, holdHours: 12 },
				{ overHours: 6, holdHours: 2 }
			],
			broadcastUnderHours: 6,
			endBeforeStartMinutes: 30
		};
		for (const raw of ['', null, undefined, '{', '[]', '"x"', '{"mode":"otro"}', '{"tiers":[]}'])
			expect(parseWaitlistSettings(raw)).toEqual(d);
		// Un campo mal invalida todo (no se mezcla).
		expect(parseWaitlistSettings('{"mode":"all","endBeforeStartMinutes":-1}')).toEqual(d);
	});

	it('lee lo guardado y completa lo que falta', () => {
		expect(
			parseWaitlistSettings(
				JSON.stringify({ tiers: [{ overHours: 24, holdHours: 3 }], endBeforeStartMinutes: 60 })
			)
		).toEqual({
			mode: 'one',
			tiers: [{ overHours: 24, holdHours: 3 }],
			broadcastUnderHours: 6,
			endBeforeStartMinutes: 60
		});
	});

	it('waitlistSettingsProblem', () => {
		expect(waitlistSettingsProblem('')).toBeNull();
		expect(waitlistSettingsProblem('{"mode":"all"}')).toBeNull();
		expect(waitlistSettingsProblem('{"mode":"todes"}')).toMatch(/no se entienden/);
		expect(waitlistSettingsProblem('nope')).toMatch(/no se entienden/);
	});

	it('tramos: ordenados, sin repetidos, enteros y en rango', () => {
		expect(
			parseHoldTiers([
				{ overHours: 6, holdHours: 2 },
				{ overHours: '48', holdHours: 12 }
			])
		).toEqual([
			{ overHours: 48, holdHours: 12 },
			{ overHours: 6, holdHours: 2 }
		]);
		for (const bad of [
			[],
			[{ overHours: 6, holdHours: 0 }],
			[{ overHours: 6, holdHours: 1.5 }],
			[{ overHours: -1, holdHours: 2 }],
			[{ overHours: 6, holdHours: 24 * 8 }],
			[
				{ overHours: 6, holdHours: 2 },
				{ overHours: 6, holdHours: 3 }
			],
			Array.from({ length: 7 }, (_, i) => ({ overHours: i, holdHours: 1 })),
			[null],
			'6:2'
		])
			expect(parseHoldTiers(bad), JSON.stringify(bad)).toBeNull();
	});
});

describe('lista del evento (lista_espera)', () => {
	it('atajos y objeto', () => {
		expect(parseEventWaitlist('evento')).toEqual({ scope: 'event', allAtOnce: false });
		expect(parseEventWaitlist(' Tipo ')).toEqual({ scope: 'type', allAtOnce: false });
		expect(
			parseEventWaitlist({
				alcance: 'tipo',
				todes_a_la_vez: true,
				reservas: [{ overHours: 24, holdHours: 4 }]
			})
		).toEqual({ scope: 'type', allAtOnce: true });
		// `reservas` (de antes del 12/10) se ignora, aunque no se entienda.
		expect(parseEventWaitlist({ alcance: 'evento', reservas: 'mucho' })).toEqual({
			scope: 'event',
			allAtOnce: false
		});
	});

	it('sin lista o algo que no se entiende: null (nunca frena la venta)', () => {
		for (const raw of [
			undefined,
			null,
			false,
			'',
			true,
			'si',
			42,
			[],
			{},
			{ alcance: 'otro' },
			{ alcance: 'evento', todes_a_la_vez: 'sí' }
		])
			expect(parseEventWaitlist(raw), JSON.stringify(raw)).toBeNull();
	});
});
