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

/**
 * Lo que ayuda a que Gmail («Copiar código») y Mail de Apple detecten el código (docs/mails.md,
 * «Códigos copiables»): «código» en el asunto y, en el texto plano y en el HTML, el código solo en
 * su renglón, primero, justo después de una frase con «código».
 */
describe('mails con código: el código se puede detectar y copiar', () => {
	const cases = /** @type {const} */ ([
		[
			'ingresar',
			buildLoginCodeEmail({ code: '482913', now: NOW }),
			'Tu código para entrar a Kinky Vibe es:'
		],
		[
			'confirmar',
			buildConfirmCodeEmail({ code: '482913', purpose: 'delete', now: NOW }),
			'Para confirmar que querés borrar tu cuenta, escribí este código en Mi rincón:'
		]
	]);

	it.each(cases)('%s: «código» en el asunto, sin el código', (_, m) => {
		expect(m.subject).toMatch(/^Tu código para /);
		expect(m.subject).not.toContain('482913');
	});

	it.each(cases)('%s: texto plano, la frase y el código solo en su renglón', (_, m, intro) => {
		const lines = m.text.split('\n');
		expect(lines.slice(0, 3)).toEqual([intro, '', '482913']);
		// El código aparece una sola vez y ningún otro renglón es solo un número.
		expect(m.text.split('482913')).toHaveLength(2);
		expect(lines.filter((l) => /^\d+$/.test(l))).toEqual(['482913']);
	});

	it.each(cases)('%s: HTML, el código primero y solo en su recuadro', (_, m, intro) => {
		const body = m.html.slice(m.html.indexOf('</h1>') + '</h1>'.length);
		const parts = body.match(/^\s*<p>([^<]*)<\/p>\s*<p style="([^"]*)">([^<]*)<\/p>/);
		expect(parts?.[1]).toBe(intro);
		expect(parts?.[2]).toContain("font-family:'Courier New',monospace;font-size:32px");
		expect(parts?.[3]).toBe('482913');
		expect(m.html.split('482913')).toHaveLength(2);
	});
});
