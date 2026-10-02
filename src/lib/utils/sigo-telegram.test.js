/**
 * «Lo que sigo» y Telegram (fase 2 del bot), lo puro: la columna Telegram según la cuenta, las
 * casillas del formulario (solo si se mostraron) y las de la fila.
 */
import { describe, expect, it } from 'vitest';
import {
	NOTIFY_CHANNELS,
	TELEGRAM_FIELDS,
	notifyChannels,
	optionsFromForm,
	telegramOptionsFromRow
} from './sigo.js';

/** @param {readonly import('./sigo.js').NotifyChannel[]} channels */
const telegramOf = (channels) => channels.find((c) => c.id === 'telegram');

describe('notifyChannels', () => {
	it('sin el bot: las columnas de siempre (Telegram «Próximamente»)', () => {
		expect(notifyChannels(null)).toBe(NOTIFY_CHANNELS);
		expect(notifyChannels(undefined)).toBe(NOTIFY_CHANNELS);
	});

	it('con el bot y sin chat: apagada, «Sin conectar», con la nota de cómo conectarlo', () => {
		const tg = telegramOf(notifyChannels({ linked: false }));
		expect(tg).toMatchObject({ enabled: false, offLabel: 'Sin conectar', fields: {} });
		expect(tg?.note).toContain('conectá tu cuenta con el bot');
	});

	it('con el chat vinculado: prendida, con sus casillas y sin nota', () => {
		const channels = notifyChannels({ linked: true });
		expect(telegramOf(channels)).toMatchObject({ enabled: true, fields: TELEGRAM_FIELDS });
		expect(telegramOf(channels)?.note).toBeUndefined();
		// El mail no cambia.
		expect(channels[0]).toBe(NOTIFY_CHANNELS[0]);
	});
});

describe('optionsFromForm con Telegram', () => {
	it('sin la columna Telegram en el formulario, no trae sus casillas (quedan como estaban)', () => {
		const form = new URLSearchParams({ canal: 'mail', mail_nuevo: 'on' });
		expect(optionsFromForm(form)).toEqual({
			calendario: false,
			mail_nuevo: true,
			recordatorio: false
		});
	});

	it('con la columna, trae las dos (apagadas si no vinieron)', () => {
		const form = new URLSearchParams([
			['canal', 'mail'],
			['canal', 'telegram'],
			['telegram_recordatorio', 'on']
		]);
		expect(optionsFromForm(form)).toEqual({
			calendario: false,
			mail_nuevo: false,
			recordatorio: false,
			telegram_nuevo: false,
			telegram_recordatorio: true
		});
	});
});

describe('telegramOptionsFromRow', () => {
	it('lee tg_new y tg_reminder', () => {
		expect(telegramOptionsFromRow({ tg_new: 1, tg_reminder: 0 })).toEqual({
			telegram_nuevo: true,
			telegram_recordatorio: false
		});
		expect(telegramOptionsFromRow({})).toEqual({
			telegram_nuevo: false,
			telegram_recordatorio: false
		});
	});
});
