import { describe, expect, it } from 'vitest';
import {
	KINKYVIBE_TAG,
	TIP_MAX,
	TIP_DESTINATION,
	TIP_DESTINATIONS,
	TIP_DESTINATION_LABELS,
	TIP_MESSAGE_MAX,
	TIP_MIN,
	TIP_PRESETS,
	isKinkyVibePost,
	showEventTip,
	monthLabel,
	parseTipAmount,
	parseTipMessage,
	tipPost,
	tipPostPath,
	validateTip
} from './propinas.js';
import { KINKYVIBE_TAG as EDITOR_TAG } from './ticketsEditor.js';
import { formatARS } from '$lib/utils/money.js';

describe('parseTipAmount', () => {
	it('acepta los montos sugeridos y los formatos de pesos', () => {
		for (const p of TIP_PRESETS) expect(parseTipAmount(String(p))).toEqual({ ok: true, amount: p });
		expect(parseTipAmount('2.000')).toEqual({ ok: true, amount: 2000 });
		expect(parseTipAmount('$ 3.500')).toEqual({ ok: true, amount: 3500 });
		expect(parseTipAmount(' 750 ')).toEqual({ ok: true, amount: 750 });
	});

	it('respeta el mínimo y el máximo (inclusive)', () => {
		expect(parseTipAmount(String(TIP_MIN))).toEqual({ ok: true, amount: TIP_MIN });
		expect(parseTipAmount(String(TIP_MAX))).toEqual({ ok: true, amount: TIP_MAX });
		expect(parseTipAmount(String(TIP_MIN - 1))).toMatchObject({ ok: false });
		expect(parseTipAmount(String(TIP_MAX + 1))).toMatchObject({ ok: false });
		expect(parseTipAmount('499')).toEqual({ ok: false, error: `El mínimo es ${formatARS(500)}.` });
		expect(parseTipAmount('500001')).toEqual({
			ok: false,
			error: `El máximo es ${formatARS(500000)}.`
		});
	});

	it('rechaza lo que no es un entero de pesos', () => {
		for (const bad of ['', '0', '-1000', '10,5', '1e5', 'mil', '2000.5', null, undefined, NaN]) {
			expect(parseTipAmount(bad).ok).toBe(false);
		}
	});
});

describe('parseTipMessage', () => {
	it('vacío = null; recorta espacios y saca caracteres de control', () => {
		expect(parseTipMessage('   ')).toEqual({ ok: true, message: null });
		expect(parseTipMessage(undefined)).toEqual({ ok: true, message: null });
		expect(parseTipMessage('  ¡Gracias!\u0000\u0007 ')).toEqual({ ok: true, message: '¡Gracias!' });
		expect(parseTipMessage('hola\r\nchau')).toEqual({ ok: true, message: 'hola\nchau' });
	});

	it(`hasta ${TIP_MESSAGE_MAX} caracteres (contando emojis como uno)`, () => {
		expect(parseTipMessage('a'.repeat(TIP_MESSAGE_MAX)).ok).toBe(true);
		expect(parseTipMessage('✨'.repeat(TIP_MESSAGE_MAX)).ok).toBe(true);
		expect(parseTipMessage('a'.repeat(TIP_MESSAGE_MAX + 1)).ok).toBe(false);
	});
});

describe('validateTip', () => {
	const base = { category: 'material', slug: 'una-guia', message: '' };

	it('un monto sugerido u "otro" con el monto escrito', () => {
		expect(validateTip({ ...base, amount: '2000' })).toEqual({
			ok: true,
			amount: 2000,
			message: null,
			category: 'material',
			slug: 'una-guia',
			destination: 'fondo'
		});
		expect(validateTip({ ...base, amount: 'otro', custom: '1.234' })).toMatchObject({
			ok: true,
			amount: 1234
		});
	});

	it('sin monto, con monto fuera de rango o con una publicación rara: errores por campo', () => {
		expect(validateTip({ ...base })).toEqual({ ok: false, errors: { amount: 'Elegí un monto.' } });
		expect(validateTip({ ...base, amount: 'otro', custom: '100' })).toEqual({
			ok: false,
			errors: { amount: `El mínimo es ${formatARS(500)}.` }
		});
		const bad = validateTip({ amount: '1000', category: 'wiki', slug: '../secretos' });
		expect(bad).toMatchObject({ ok: false, errors: { post: expect.any(String) } });
	});
});

describe('destino de la propina', () => {
	const base = { amount: '2000', category: 'material', slug: 'una-guia', message: '' };

	it('toda propina nueva va al Fondo; los destinos viejos se siguen nombrando', () => {
		expect(TIP_DESTINATION).toBe('fondo');
		expect(TIP_DESTINATIONS).toEqual(['kinkyvibe', 'fondo']);
		expect(TIP_DESTINATION_LABELS).toEqual({
			kinkyvibe: 'Para KinkyVibe',
			fondo: 'Para el Fondo'
		});
	});

	it('validateTip siempre devuelve el Fondo e ignora lo que llegue en `destination`', () => {
		for (const destination of [undefined, '', 'fondo', 'kinkyvibe', 'mi-bolsillo', 1, {}]) {
			expect(validateTip({ ...base, destination })).toEqual({
				ok: true,
				amount: 2000,
				message: null,
				category: 'material',
				slug: 'una-guia',
				destination: 'fondo'
			});
		}
		// Un destino raro no suma un error: los errores siguen siendo solo de monto, mensaje y publicación.
		expect(validateTip({ ...base, amount: '', destination: 'nope' })).toEqual({
			ok: false,
			errors: { amount: 'Elegí un monto.' }
		});
	});
});

describe('publicación de la propina', () => {
	it('tipPost solo acepta material/calendario y slugs sin barras ni puntos', () => {
		expect(tipPost('calendario', 'fiesta-2026')).toEqual({
			category: 'calendario',
			slug: 'fiesta-2026'
		});
		expect(tipPost('amigues', 'x')).toBeNull();
		expect(tipPost('material', '../x')).toBeNull();
		expect(tipPost('material', 'a/b')).toBeNull();
		expect(tipPost('material', '')).toBeNull();
		expect(tipPost('material', 'https://otra.web')).toBeNull();
	});

	it('tipPostPath arma siempre una ruta del sitio', () => {
		expect(tipPostPath('material', 'una guia')).toBe('/material/una%20guia');
		expect(tipPostPath('calendario', 'fiesta')).toBe('/calendario/fiesta');
		// Una categoría desconocida no arma otra ruta (ni otra web).
		expect(tipPostPath('//otra.web', 'x')).toBe('/material/x');
	});

	it('isKinkyVibePost mira la etiqueta KinkyVibe (la misma que el editor de entradas)', () => {
		expect(KINKYVIBE_TAG).toBe(EDITOR_TAG);
		expect(isKinkyVibePost({ tags: ['Online', 'KinkyVibe'] })).toBe(true);
		expect(isKinkyVibePost({ tags: ['Online'] })).toBe(false);
		expect(isKinkyVibePost({})).toBe(false);
		expect(isKinkyVibePost(null)).toBe(false);
	});
});

describe('monthLabel', () => {
	it('nombre del mes en castellano', () => {
		expect(monthLabel('2026-10')).toBe('octubre de 2026');
		expect(monthLabel('2027-01')).toBe('enero de 2027');
		expect(monthLabel('2026-13')).toBe('2026-13');
		expect(monthLabel('raro')).toBe('raro');
	});
});

describe('showEventTip', () => {
	it('solo eventos de KinkyVibe totalmente gratis', () => {
		expect(showEventTip({ tags: ['KinkyVibe', 'gratis'] })).toBe(true);
		expect(showEventTip({ tags: ['KinkyVibe', 'pago'] })).toBe(false);
		expect(showEventTip({ tags: ['KinkyVibe', 'a la gorra'] })).toBe(false);
		expect(showEventTip({ tags: ['KinkyVibe', 'gratis', 'pago'] })).toBe(false);
		expect(showEventTip({ tags: ['KinkyVibe'] })).toBe(false);
		expect(showEventTip({ tags: ['gratis'] })).toBe(false);
		expect(showEventTip({})).toBe(false);
		expect(showEventTip(null)).toBe(false);
	});
});
