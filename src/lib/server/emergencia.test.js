/**
 * Pausas de emergencia (emergencia.js): qué cuenta como prendida y qué texto se muestra. Y una
 * guarda: la pausa de la venta solo se mira donde se crean órdenes desde el sitio público (la
 * puerta, la carga a mano, los webhooks y los reembolsos no la miran nunca).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TICKETS_PAUSED_MESSAGE,
	MAX_PAUSE_TEXT,
	emergencyPauses,
	mailsPaused,
	mailsPausedNote,
	pauseText,
	ticketsPausedMessage
} from './emergencia.js';

describe('pauseText', () => {
	it('vacía, ausente, solo espacios o 0: apagada', () => {
		for (const raw of [undefined, null, '', '   ', '0', ' 0 ', '\n'])
			expect(pauseText(raw)).toBe(null);
	});

	it('cualquier otro texto: prendida, limpio y recortado', () => {
		expect(pauseText('  Volvemos   en un rato ')).toBe('Volvemos en un rato');
		expect(pauseText('Línea 1\nLínea 2\t')).toBe('Línea 1 Línea 2');
		expect(pauseText('x'.repeat(MAX_PAUSE_TEXT + 50))).toHaveLength(MAX_PAUSE_TEXT);
		expect(pauseText('1')).toBe('1');
	});
});

describe('ticketsPausedMessage', () => {
	it('el texto de la variable es lo que ven les compradores', () => {
		expect(ticketsPausedMessage({ TICKETS_PAUSED: 'Volvemos en un rato' })).toBe(
			'Volvemos en un rato'
		);
	});

	it('con 1, un texto por defecto; sin la variable o con 0, nada', () => {
		expect(ticketsPausedMessage({ TICKETS_PAUSED: '1' })).toBe(DEFAULT_TICKETS_PAUSED_MESSAGE);
		expect(ticketsPausedMessage({})).toBe(null);
		expect(ticketsPausedMessage({ TICKETS_PAUSED: '0' })).toBe(null);
	});

	it('no depende de la de los mails (y al revés)', () => {
		expect(ticketsPausedMessage({ MAILS_PAUSED: '1' })).toBe(null);
		expect(mailsPaused({ TICKETS_PAUSED: '1' })).toBe(false);
	});
});

describe('mailsPaused', () => {
	it('prendida con cualquier texto; la nota queda para el panel', () => {
		expect(mailsPaused({ MAILS_PAUSED: '1' })).toBe(true);
		expect(mailsPausedNote({ MAILS_PAUSED: 'Se mandó mal un aviso' })).toBe(
			'Se mandó mal un aviso'
		);
		expect(mailsPaused({ MAILS_PAUSED: '' })).toBe(false);
		expect(mailsPaused({ MAILS_PAUSED: '0' })).toBe(false);
	});

	it('emergencyPauses junta las dos', () => {
		expect(emergencyPauses({ TICKETS_PAUSED: 'Pausa', MAILS_PAUSED: '1' })).toEqual({
			tickets: 'Pausa',
			mails: '1'
		});
		expect(emergencyPauses({})).toEqual({ tickets: null, mails: null });
	});
});

/** @param {string} dir @returns {string[]} */
function sourceFiles(dir) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return /\.(js|svelte)$/.test(name) && !/\.test\.js$/.test(name) ? [path] : [];
	});
}

describe('dónde se mira la pausa de la venta', () => {
	it('solo en la compra pública, la lista de espera y el cron (nunca en la puerta, la carga a mano, los webhooks ni los reembolsos)', () => {
		const users = sourceFiles('src')
			.filter((f) => /ticketsPausedMessage\(/.test(readFileSync(f, 'utf8')))
			.map((f) => f.replaceAll('\\', '/'))
			.sort();
		expect(users).toEqual([
			'src/lib/server/emergencia.js',
			'src/lib/server/tickets/checkout.js',
			'src/lib/server/tickets/waitlistEngine.js',
			'src/routes/api/cron/recordatorios/+server.js'
		]);
	});

	it('la pausa de los mails no está en deliver() (los mails de cada compra salen siempre)', () => {
		const index = readFileSync('src/lib/server/tickets/index.js', 'utf8');
		const deliverBody = index.slice(
			index.indexOf('async function deliver('),
			index.indexOf('export function deliverEmail(')
		);
		expect(deliverBody).not.toMatch(/mailsPaused|MAILS_PAUSED/);
	});
});
