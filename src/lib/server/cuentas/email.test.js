/**
 * Los mails con código dicen cuándo vencen con la hora exacta, en hora de Argentina (no sabemos
 * la zona de quien lo lee). Reloj fijo; el código es inventado.
 */
import { describe, expect, it } from 'vitest';
import { buildConfirmCodeEmail, buildLoginCodeEmail } from './email.js';
import { CODE_TTL_MS } from './codes.js';

// Viernes 2 de octubre de 2026, 14:25 en Argentina.
const NOW = Date.UTC(2026, 9, 2, 17, 25);
const EXPIRES =
	'Vence en 10 minutos (a las 14:35, hora de Argentina y Uruguay). Sirve una sola vez.';

describe('mails con código', () => {
	it('ingresar: vence en N minutos, a qué hora y en qué zona', () => {
		const m = buildLoginCodeEmail({ code: '123456', now: NOW, expiresAt: NOW + CODE_TTL_MS });
		expect(m.text).toContain(`Escribilo en la página donde lo pediste. ${EXPIRES}`);
		expect(m.html).toContain(EXPIRES);
		// Nada del código en el asunto (se ve en las notificaciones).
		expect(m.subject).not.toContain('123456');
	});

	it('confirmar una acción: lo mismo', () => {
		const m = buildConfirmCodeEmail({
			code: '654321',
			purpose: 'password',
			now: NOW,
			expiresAt: NOW + CODE_TTL_MS
		});
		expect(m.text).toContain(EXPIRES);
		expect(m.html).toContain(EXPIRES);
	});

	it('sin `expiresAt`, `now` + la duración del código', () => {
		expect(buildLoginCodeEmail({ code: '1', now: NOW }).text).toContain(EXPIRES);
	});

	it('cerca de la medianoche dice el día', () => {
		const late = Date.UTC(2026, 9, 3, 2, 58); // 23:58 en Argentina
		expect(buildLoginCodeEmail({ code: '1', now: late }).text).toContain(
			'Vence en 10 minutos (el sábado 3 de octubre a las 00:08, hora de Argentina y Uruguay).'
		);
	});
});
