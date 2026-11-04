import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { writeGolden } from '$lib/testing/golden.js';
import {
	MAIL_LAYOUT_MARK,
	MAIL_LOGO_PATH,
	MAIL_PREHEADER_MARK,
	mailLayout,
	mailOptOut
} from './layout.js';
import { allMailCases } from './mails.fixtures.js';
import { buildTicketEmail, buildTransferEmail } from '$lib/server/tickets/email.js';
import { fixtureOrder, fixtureTickets } from '$lib/server/tickets/email.fixtures.js';
import { WHY_BOUGHT, WHY_FREE } from '$lib/utils/emailTemplates.js';

// Asunto y texto plano de cada mail ANTES de la plantilla común (ver mails.fixtures.js). Este
// archivo es el único que escribe mails.text.json: con UPDATE_EMAIL_GOLDEN=1 la regenera entera
// con los builders de hoy (docs/mails.md, «Cambiar un mail desde el código»); sin la variable,
// compara.
const TEXT_GOLDEN = new URL('./mails.text.json', import.meta.url);
if (process.env.UPDATE_EMAIL_GOLDEN === '1') {
	/** @type {Record<string, { subject: string, text: string }>} */
	const fresh = {};
	for (const [name, fn, input] of allMailCases()) {
		const { subject, text } = fn(input);
		fresh[name] = { subject, text };
	}
	writeGolden(TEXT_GOLDEN, fresh);
}
const textGolden = JSON.parse(readFileSync(TEXT_GOLDEN, 'utf8'));

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
				'buildDateChangeEmail',
				'buildFollowEmail',
				'buildFondoLinkEmail',
				'buildLoginCodeEmail',
				'buildNewEditionEmail',
				'buildProfileInviteEmail',
				'buildRefundEmail',
				'buildReminderEmail',
				'buildSeriesConfirmEmail',
				'buildStreamLinkEmail',
				'buildTicketEmail',
				'buildTransferEmail',
				'buildWaitlistClosedEmail',
				'buildWaitlistConfirmEmail',
				'buildWaitlistEndedEmail',
				'buildWaitlistExpiredEmail',
				'buildWaitlistOfferEmail',
				'buildWaitlistReminderEmail'
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
		expect(html).toContain('border-top:5px solid #f53dbb');
		// Sin hsl(): el Outlook de escritorio no lo entiende. Tema claro forzado («light only»).
		expect(html).not.toContain('hsl(');
		expect(html).toContain('<meta name="color-scheme" content="light only">');
		// El botón, con el color también como atributo (Outlook de escritorio).
		if (html.includes('font-size:19px;font-weight:700;color:#ffffff')) {
			expect(html).toContain('<td align="center" bgcolor="#f53dbb" style="border-radius:999px;');
		}
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

	it('los mails de una compra y los de la oferta llevan preencabezado, sin el título del evento', () => {
		const withPreheader = new Set([
			'buildTicketEmail',
			'buildReminderEmail',
			'buildDateChangeEmail',
			'buildWaitlistOfferEmail',
			'buildWaitlistReminderEmail',
			'buildBuyerMail'
		]);
		let seen = 0;
		for (const [name, fn, input] of cases) {
			if (!withPreheader.has(fn.name)) continue;
			seen++;
			const { html } = fn(input);
			const pre = html.split(`${MAIL_PREHEADER_MARK}>`)[1]?.split('<')[0];
			expect(pre, name).toBeTruthy();
			// El título puede ser sensible: no va en la vista previa de la bandeja.
			expect(pre, name).not.toContain('Fiesta');
			expect(pre, name).not.toMatch(/https?:|@/);
		}
		expect(seen).toBeGreaterThanOrEqual(withPreheader.size);
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

	it('preencabezado: oculto, escapado, primero en el body; sin él, no está', () => {
		const html = mailLayout({ ...base, preheader: 'Hola <b>vos</b> & todes' });
		expect(html).toContain(
			`<body style="margin:0;padding:0;background:#f4eff6;">\n<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f4eff6;" ${MAIL_PREHEADER_MARK}>Hola &lt;b&gt;vos&lt;/b&gt; &amp; todes</div>\n<table`
		);
		expect(mailLayout(base)).not.toContain(MAIL_PREHEADER_MARK);
		expect(mailLayout({ ...base, preheader: '' })).toBe(mailLayout(base));
	});

	it('sin botón ni baja, no los dibuja', () => {
		const html = mailLayout(base);
		expect(html).not.toContain('font-size:19px;font-weight:700');
		// En el pie, el único link es el del contacto.
		expect(html.slice(html.lastIndexOf('¿Dudas?')).match(/<a /g)).toHaveLength(1);
	});
});

describe('«No fui yo» en el pie (mails a una dirección sin confirmar)', () => {
	const URL_OPT_OUT = 'https://kinkyvibe.example/mails/no-fui-yo/abc.def';
	const LEAD = 'Alguien escribió tu mail por error.';
	const TAIL = 'no te mandamos más mails de Kinky Vibe a esta dirección.';

	it('mailOptOut: sin link, nada; con link, la línea (escapada) y su texto plano', () => {
		expect(mailOptOut(null, '¿No te anotaste vos?')).toEqual({ html: '', text: [] });
		const line = mailOptOut(`${URL_OPT_OUT}?a=1&b=2`, '¿No te anotaste vos?');
		expect(line.html).toBe(
			`¿No te anotaste vos? ${LEAD} <a href="${URL_OPT_OUT}?a=1&amp;b=2" style="color:#570bda;">Tocá acá</a> y ${TAIL}`
		);
		expect(line.text.join('\n')).toContain(`¿No te anotaste vos? ${LEAD}`);
		expect(line.text.join('\n')).toContain(`${URL_OPT_OUT}?a=1&b=2`);
		// Va en el pie, después de la baja y antes de la firma.
		const html = mailLayout({
			label: 'x',
			titleHtml: 'x',
			whyHtml: 'Por qué',
			unsubscribeHtml: 'BAJA',
			optOutHtml: line.html
		});
		expect(html.indexOf('BAJA')).toBeLessThan(html.indexOf(LEAD));
		expect(html.indexOf(LEAD)).toBeLessThan(html.indexOf('Kinky Vibe · Buenos Aires'));
	});

	it('entradas gratis: «se pidieron entradas gratis», nunca «compraste», y la línea con el link', () => {
		const free = buildTicketEmail({
			order: fixtureOrder({ payment_method: 'gratis', total: 0 }),
			tickets: fixtureTickets(),
			event: { title: 'Fiesta de prueba', start: '2026-10-10T22:00:00-03:00' },
			typeName: 'Libre',
			origin: 'https://kinkyvibe.example',
			contactEmail: 'contacto@example.com',
			optOutUrl: URL_OPT_OUT
		});
		expect(free.html).toContain(WHY_FREE);
		expect(free.html).not.toContain(WHY_BOUGHT);
		expect(free.html).toContain('¿No pediste vos estas entradas?');
		expect(free.html).toContain(URL_OPT_OUT);
		expect(free.text).toContain(URL_OPT_OUT);
		// Una compra pagada: como siempre.
		const paid = buildTicketEmail({
			order: fixtureOrder(),
			tickets: fixtureTickets(),
			event: { title: 'Fiesta de prueba', start: '2026-10-10T22:00:00-03:00' },
			typeName: 'General',
			origin: 'https://kinkyvibe.example',
			contactEmail: 'contacto@example.com'
		});
		expect(paid.html).toContain(WHY_BOUGHT);
		expect(paid.html).not.toContain(LEAD);
	});

	it('reserva por transferencia: la línea con el link', () => {
		const m = buildTransferEmail({
			order: fixtureOrder({ payment_method: 'transferencia', status: 'awaiting_transfer' }),
			event: { title: 'Fiesta de prueba', start: '2026-10-10T22:00:00-03:00' },
			typeName: 'General',
			transferInfo: 'Alias: EJEMPLO.PRUEBA',
			contactEmail: 'contacto@example.com',
			origin: 'https://kinkyvibe.example',
			optOutUrl: URL_OPT_OUT
		});
		expect(m.html).toContain(`¿No reservaste vos? ${LEAD}`);
		expect(m.text).toContain(URL_OPT_OUT);
	});
});
