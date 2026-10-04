import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAIL_LAYOUT_MARK, MAIL_LOGO_PATH, mailLayout } from './layout.js';
import { allMailCases } from './mails.fixtures.js';

// Asunto y texto plano de cada mail ANTES de la plantilla común (ver mails.fixtures.js).
const textGolden = JSON.parse(readFileSync(new URL('./mails.text.json', import.meta.url), 'utf8'));

/** Etiqueta gris de arriba de la tarjeta. */
const LABEL_RE = /<p style="[^"]*text-transform:uppercase[^"]*">([^<]+)<\/p>/;

describe('todos los mails usan la plantilla común', () => {
	const cases = allMailCases();

	it('cubre todos los builders de mails', () => {
		const builders = new Set(cases.map(([, fn]) => fn.name));
		expect([...builders].sort()).toEqual(
			[
				'buildBuyerMail',
				'buildConfirmCodeEmail',
				'buildFollowEmail',
				'buildLoginCodeEmail',
				'buildNewEditionEmail',
				'buildProfileInviteEmail',
				'buildRefundEmail',
				'buildReminderEmail',
				'buildSeriesConfirmEmail',
				'buildStreamLinkEmail',
				'buildTicketEmail',
				'buildTransferEmail'
			].sort()
		);
		expect(Object.keys(textGolden).sort()).toEqual(cases.map(([name]) => name).sort());
	});

	it.each(cases)('%s: logo, etiqueta, tarjeta y pie', (name, fn, input) => {
		const { html } = fn(input);
		expect(html.startsWith('<!doctype html><html lang="es"><head><meta charset="utf-8">')).toBe(
			true
		);
		expect(html).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">');
		expect(html).toContain(MAIL_LAYOUT_MARK);
		// Logo: URL absoluta https del sitio, nunca data:; alt legible si se bloquean imágenes.
		const logo = html.match(/<img src="([^"]+)" width="56" height="56" alt="Kinky Vibe"/);
		expect(logo).not.toBeNull();
		expect(logo?.[1]).toMatch(/^https:\/\/[^/]+\/android-chrome-192x192\.png$/);
		expect(logo?.[1].endsWith(MAIL_LOGO_PATH)).toBe(true);
		expect(html).not.toMatch(/src="data:/);
		// Fondo lila, tarjeta con borde rosa, Lato con fallback.
		expect(html).toContain('background:#f4eff6');
		expect(html).toContain('max-width:560px');
		expect(html).toContain('border-top:5px solid hsl(319,90%,60%)');
		expect(html).toContain("font-family:Lato,'Helvetica Neue',Helvetica,Arial,sans-serif");
		// Etiqueta, título y un solo botón como mucho.
		expect(html.match(LABEL_RE)?.[1]).toBeTruthy();
		expect(html.match(/<h1 /g)).toHaveLength(1);
		expect((html.match(/font-size:19px;font-weight:700;color:#ffffff/g) ?? []).length).toBeLessThan(
			2
		);
		// Pie: por qué llega, contacto y la marca en dos palabras.
		expect(html).toMatch(/(Te llega|Te escribimos) porque /);
		expect(html).toMatch(/¿Dudas\? Escribinos a <a href="mailto:[^"]+@[^"]+"/);
		expect(html).toContain('Kinky Vibe · Buenos Aires');
	});

	it.each(cases)('%s: el asunto y el texto plano no cambian', (name, fn, input) => {
		const { subject, text } = fn(input);
		expect({ subject, text }).toEqual(textGolden[name]);
	});

	it('los mails con baja la siguen teniendo en el pie', () => {
		for (const [name, fn, input] of cases) {
			const unsubscribe = input.unsubscribeUrl ?? input.stopUrl;
			if (!unsubscribe) continue;
			const { html } = fn(input);
			const footer = html.slice(html.lastIndexOf('¿Dudas?'));
			expect(footer, name).toContain(`href="${unsubscribe.replaceAll('&', '&amp;')}"`);
		}
	});

	it('el mail de entradas lleva el QR y el código dentro de la tarjeta', () => {
		const [, fn, input] = cases.find(([name]) => name === 'tickets/tickets-presencial') ?? [];
		const { html } = /** @type {any} */ (fn)(input);
		const card = html.slice(html.indexOf('border-top:5px'), html.indexOf('¿Dudas?'));
		expect(card).toContain('/qr.gif');
		expect(card).toContain('7HQ 4XM');
	});
});

describe('mailLayout', () => {
	const base = { label: 'Tu código', titleHtml: 'Hola', whyHtml: 'Te llega porque sí.' };

	it('usa el origen que recibe para el logo', () => {
		expect(mailLayout({ ...base, origin: 'https://kinkyvibe.example/' })).toContain(
			'src="https://kinkyvibe.example/android-chrome-192x192.png"'
		);
	});

	it('escapa la etiqueta, el botón y el contacto', () => {
		const html = mailLayout({
			...base,
			label: '<b>x</b>',
			button: { href: 'https://e.example/?a=1&b="2"', label: 'Ir <ya>' },
			contactEmail: 'a&b@example.com'
		});
		expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
		expect(html).toContain('href="https://e.example/?a=1&amp;b=&quot;2&quot;"');
		expect(html).toContain('>Ir &lt;ya&gt;</a>');
		expect(html).toContain('mailto:a&amp;b@example.com');
	});

	it('sin botón ni baja, no los dibuja', () => {
		const html = mailLayout(base);
		expect(html).not.toContain('font-size:19px;font-weight:700');
		// En el pie, el único link es el del contacto.
		expect(html.slice(html.lastIndexOf('¿Dudas?')).match(/<a /g)).toHaveLength(1);
	});
});
