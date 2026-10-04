/**
 * El pie de los mails que se cambia en Ajustes → Mails (`withMailFooter`, layout.js): sin nada
 * cargado, cada mail sale byte a byte igual; con textos propios, cambian solo la línea de contacto
 * y la firma (el «por qué te llega» de cada plantilla no), con el mismo formato seguro. Lo pone
 * `deliver()` al mandar (lo que se le manda a Resend se captura: no sale nada) y la vista previa.
 * Textos y direcciones inventados; D1 de miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveSalesSettings, validateSalesSettings } from '$lib/server/tickets/settings.js';
import { DEFAULT_MAIL_FOOTER, MAIL_COLORS, mailLayout, withMailFooter } from './layout.js';
import { allMailCases } from './mails.fixtures.js';

vi.mock('$env/dynamic/private', () => ({ env: { RESEND_API_KEY: 're_inventada' } }));

const LINK = `style="color:${MAIL_COLORS.link};"`;
const FOOTER = {
	contact: 'Consultas: {{contacto}} o [Instagram](https://instagram.example/kv)',
	signoff: '**Kinky Vibe** · CABA'
};

describe('withMailFooter', () => {
	const cases = allMailCases();

	it.each(cases)('%s: sin pie propio, el mismo HTML byte a byte', (name, fn, input) => {
		const { html } = fn(input);
		expect(withMailFooter(html, null)).toBe(html);
		expect(withMailFooter(html, undefined)).toBe(html);
		expect(withMailFooter(html, { contact: '', signoff: '  ' })).toBe(html);
	});

	it.each(cases)(
		'%s: con pie propio cambian el contacto y la firma, nada más',
		(name, fn, input) => {
			const { html } = fn(input);
			const out = withMailFooter(html, FOOTER);
			const contact = /** @type {RegExpMatchArray} */ (
				html.match(/¿Dudas\? Escribinos a (<a href="mailto:[^"]+" [^>]+>[^<]+<\/a>)/)
			);
			expect(out).not.toContain('¿Dudas? Escribinos a');
			expect(out).toContain(
				`Consultas: ${contact[1]} o <a href="https://instagram.example/kv" ${LINK}>Instagram</a><br>`
			);
			expect(out).toContain(
				`<span style="color:${MAIL_COLORS.faint};"><strong>Kinky Vibe</strong> · CABA</span>`
			);
			expect(out).not.toContain('Kinky Vibe · Buenos Aires');
			// Lo de arriba del pie (la tarjeta y el «por qué te llega») no cambia.
			const cut = html.lastIndexOf('¿Dudas?');
			expect(out.slice(0, cut)).toBe(html.slice(0, cut));
		}
	);

	it('solo la firma, o solo el contacto', () => {
		const html = mailLayout({
			label: 'Tu código',
			titleHtml: 'Hola',
			whyHtml: 'Te llega porque sí.'
		});
		const onlySign = withMailFooter(html, { signoff: 'Kinky Vibe' });
		expect(onlySign).toContain('¿Dudas? Escribinos a <a href="mailto:');
		expect(onlySign).toContain(`<span style="color:${MAIL_COLORS.faint};">Kinky Vibe</span>`);
		const onlyContact = withMailFooter(html, { contact: 'Escribinos: {{contacto}}' });
		expect(onlyContact).toContain('Escribinos: <a href="mailto:');
		expect(onlyContact).toContain('Kinky Vibe · Buenos Aires');
	});

	it('el texto propio va escapado y un link que no es http(s), mailto: o tel: queda como texto', () => {
		const html = mailLayout({ label: 'x', titleHtml: 'Hola', whyHtml: 'Por algo.' });
		const out = withMailFooter(html, {
			contact: '<b>{{contacto}}</b> [mal](javascript:alert)',
			signoff: 'A & B'
		});
		expect(out).toContain('&lt;b&gt;<a href="mailto:');
		expect(out).toContain('[mal](javascript:alert)');
		expect(out).not.toContain('href="javascript');
		expect(out).toContain('>A &amp; B</span>');
	});

	it('si la tarjeta tiene algo parecido, cambia solo lo del pie (el último)', () => {
		const line = `¿Dudas? Escribinos a <a href="mailto:a@ejemplo.test" ${LINK}>a@ejemplo.test</a><br>`;
		const html = mailLayout({
			label: 'x',
			titleHtml: 'Hola',
			contentHtml: `\n${line}\n<span style="color:${MAIL_COLORS.faint};">Kinky Vibe · Buenos Aires</span>`,
			whyHtml: 'Por algo.'
		});
		const out = withMailFooter(html, { contact: 'Otro {{contacto}}', signoff: 'Otra firma' });
		expect(out.split(line)).toHaveLength(2);
		expect(out.split('Kinky Vibe · Buenos Aires')).toHaveLength(2);
		expect(out.indexOf(line)).toBeLessThan(out.indexOf('Otro <a'));
	});

	it('el pie de siempre es el que dice la plantilla común', () => {
		const html = mailLayout({
			label: 'x',
			titleHtml: 'Hola',
			whyHtml: 'Por algo.',
			contactEmail: 'c@ejemplo.test'
		});
		expect(html).toContain(
			DEFAULT_MAIL_FOOTER.contact.replace('{{contacto}}', '<a href="mailto:c@ejemplo.test"')
		);
		expect(html).toContain(DEFAULT_MAIL_FOOTER.signoff);
	});
});

describe('Ajustes → Mails: validar el pie', () => {
	it('acepta texto, negrita, links y {{contacto}} (solo en la línea de contacto)', () => {
		expect(
			validateSalesSettings({
				mail_footer_contact:
					' Consultas:  {{contacto}} o [Instagram](https://instagram.example/kv) ',
				mail_footer_signoff: '**Kinky Vibe** · CABA'
			})
		).toEqual({
			ok: true,
			value: {
				mail_footer_contact: 'Consultas: {{contacto}} o [Instagram](https://instagram.example/kv)',
				mail_footer_signoff: '**Kinky Vibe** · CABA'
			}
		});
		expect(validateSalesSettings({ mail_footer_contact: '', mail_footer_signoff: '' })).toEqual({
			ok: true,
			value: { mail_footer_contact: '', mail_footer_signoff: '' }
		});
	});

	it('rechaza HTML, variables que no existen, links peligrosos y textos largos', () => {
		const bad = /** @type {any} */ (
			validateSalesSettings({
				mail_footer_contact: '<a href="https://x.example">x</a>',
				mail_footer_signoff: '{{contacto}}'
			})
		);
		expect(bad.ok).toBe(false);
		expect(bad.errors.mail_footer_contact).toMatch(/No se puede usar HTML/);
		expect(bad.errors.mail_footer_signoff).toMatch(/\{\{contacto\}\}/);
		const js = /** @type {any} */ (
			validateSalesSettings({
				mail_footer_contact: '[x](javascript:alert(1))',
				mail_footer_signoff: 'y'.repeat(121)
			})
		);
		expect(js.errors.mail_footer_contact).toMatch(/https:\/\/, http:\/\/, mailto: o tel:/);
		expect(js.errors.mail_footer_signoff).toMatch(/120/);
	});
});

describe('al mandar y en la vista previa', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	beforeAll(async () => {
		t = await createTestDB();
	});
	afterAll(async () => {
		await t?.dispose();
	});
	beforeEach(async () => {
		await resetDB(t.db);
	});

	/** Lo que le llega a Resend. */
	function capture() {
		/** @type {any[]} */
		const sent = [];
		const fetchFn = /** @type {typeof fetch} */ (
			/** @type {unknown} */ (
				async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
					sent.push(JSON.parse(String(init.body)));
					return new Response('{"id":"inventado"}', { status: 200 });
				}
			)
		);
		return { sent, fetchFn };
	}

	it('deliver() pone el pie de los ajustes; sin ajustes, el mail tal cual', async () => {
		const tickets = await import('$lib/server/tickets/index.js');
		const [, fn, input] = allMailCases()[0];
		const message = fn(input);
		const a = capture();
		expect(
			await tickets.sendTestEmail({
				db: t.db,
				fetch: a.fetchFn,
				to: 'prueba@ejemplo.test',
				message
			})
		).toBe('sent');
		expect(a.sent[0].html).toBe(message.html);
		expect(a.sent[0].text).toBe(message.text);

		await saveSalesSettings(
			t.db,
			{ mail_footer_contact: FOOTER.contact, mail_footer_signoff: FOOTER.signoff },
			{ by: 'admin-de-prueba' }
		);
		const b = capture();
		await tickets.sendTestEmail({ db: t.db, fetch: b.fetchFn, to: 'prueba@ejemplo.test', message });
		expect(b.sent[0].html).toBe(withMailFooter(message.html, FOOTER));
		expect(b.sent[0].html).toContain('<strong>Kinky Vibe</strong> · CABA');
		// El texto plano no pasa por la plantilla común.
		expect(b.sent[0].text).toBe(message.text);
		expect(await tickets.mailFooter(t.db)).toEqual(FOOTER);
	});

	it('la vista previa de las plantillas muestra el pie de los ajustes', async () => {
		const { previewEmail } = await import('$lib/server/tickets/templatePreview.js');
		const ctx = { origin: 'https://kinkyvibe.example', contactEmail: 'c@ejemplo.test', now: 0 };
		const plain = previewEmail('tickets', null, ctx);
		expect(plain.html).toContain('Kinky Vibe · Buenos Aires');
		const withFooter = previewEmail('tickets', null, { ...ctx, footer: FOOTER });
		expect(withFooter.html).toBe(withMailFooter(plain.html, FOOTER));
		expect(withFooter.html).toContain('Consultas: <a href="mailto:c@ejemplo.test"');
	});
});
