import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	EMAIL_TEMPLATES,
	TEMPLATE_LINK_COLOR,
	findVariables,
	isSafeLinkUrl,
	renderBlockHtml,
	renderInlineHtml,
	renderPlain,
	sampleVars,
	templateDef,
	unknownVariables,
	validateTemplate
} from '$lib/utils/emailTemplates.js';
import * as email from './email.js';
import { emailCases, fixtureOrder, fixtureTickets } from './email.fixtures.js';
import { previewEmail } from './templatePreview.js';
import { MAIL_COLORS } from '$lib/server/email/layout.js';
import {
	deleteTemplateOverride,
	getTemplateOverride,
	listTemplateOverrides,
	saveTemplateOverride
} from './templates.js';

const golden = JSON.parse(readFileSync(new URL('./email.golden.json', import.meta.url), 'utf8'));

/** @param {string} fn @param {any} input */
const build = (fn, input) => /** @type {any} */ (email)[fn](input);

describe('sin plantilla guardada, los mails no cambian', () => {
	it.each(emailCases())('%s: igual byte a byte que antes de las plantillas', (name, fn, input) => {
		expect(build(fn, input)).toEqual(golden[name]);
		expect(build(fn, { ...input, template: null })).toEqual(golden[name]);
	});
});

describe('el lugar en los mails (salePlaceText, eventPlace.js)', () => {
	const order = fixtureOrder();
	const tickets = fixtureTickets();
	const base = {
		order,
		tickets,
		typeName: 'General',
		origin: 'https://kinkyvibe.example',
		contactEmail: 'c@example.com'
	};
	const event = { title: 'Evento', start: '2026-10-10T22:00:00-03:00' };

	it('«Nombre · Dirección», u «Online» si la venta lo trata como online', () => {
		const place = { location_name: 'Lugar de ejemplo', location: 'Calle Falsa 123' };
		expect(email.templateVars(order, { ...event, ...place }, 'General').lugar).toBe(
			'Lugar de ejemplo · Calle Falsa 123'
		);
		expect(email.templateVars(order, { ...event, ...place, online: true }, 'General').lugar).toBe(
			'Online'
		);
		const m = email.buildTicketEmail({ ...base, event: { ...event, ...place } });
		expect(m.text).toContain('Lugar de ejemplo · Calle Falsa 123');
		const r = email.buildReminderEmail({
			...base,
			reminder: { kind: 'hours_before', hours: 3, enabled: true },
			event: { ...event, online: true }
		});
		expect(r.text).toContain('Online');
	});

	it('el mismo texto en nombre y dirección va una sola vez (antes: «Casa · Casa»)', () => {
		const same = { ...event, location_name: 'Casa Inventada', location: 'Casa Inventada' };
		expect(email.templateVars(order, same, 'General').lugar).toBe('Casa Inventada');
		const m = email.buildTicketEmail({ ...base, event: same });
		expect(m.text).not.toContain('Casa Inventada · Casa Inventada');
		const r = email.buildReminderEmail({
			...base,
			reminder: { kind: 'hours_before', hours: 3, enabled: true },
			event: same
		});
		expect(r.text).not.toContain('Casa Inventada · Casa Inventada');
		expect(r.text).toContain('Casa Inventada');
	});
});

describe('con plantilla', () => {
	const order = fixtureOrder();
	const tickets = fixtureTickets();
	const event = { title: 'Fiesta <b>de</b> prueba', start: '2026-10-10T22:00:00-03:00' };
	const base = {
		order,
		tickets,
		event,
		typeName: 'General',
		origin: 'https://kinkyvibe.example',
		contactEmail: 'c@example.com'
	};

	it('cambia asunto, título y texto; el resto (QR, links, orden, política) queda igual', () => {
		const m = email.buildTicketEmail({
			...base,
			template: {
				subject: '¡{{nombre}}, acá están tus entradas para {{evento}}!',
				heading: 'Hola, {{nombre}}',
				body: 'Te esperamos el **{{fecha}}**.\n\nTraé agua.\nY ganas.'
			}
		});
		expect(m.subject).toBe(
			'¡Persona <de> "Ejemplo" & Cía, acá están tus entradas para Fiesta <b>de</b> prueba!'
		);
		// Variables escapadas en el HTML.
		expect(m.html).toContain('Hola, Persona &lt;de&gt; &quot;Ejemplo&quot; &amp; Cía</h1>');
		expect(m.html).toContain('<p>Te esperamos el <strong>sábado');
		expect(m.html).toContain('<p>Traé agua.<br>Y ganas.</p>');
		expect(m.html).not.toContain('gracias por tu compra');
		expect(m.html).not.toContain('<b>de</b>');
		// Lo que pone el código sigue ahí.
		const original = golden['tickets-presencial'];
		for (const part of [
			`${base.origin}/entradas/t/${tickets[0].token}/qr.gif`,
			'7HQ 4XM',
			`Número de orden: ${order.id}`,
			'Total: $'
		]) {
			expect(original.html).toContain(part);
			expect(m.html).toContain(part);
		}
		// Texto plano: sin ** y sin escapar.
		expect(m.text.startsWith('Hola, Persona <de> "Ejemplo" & Cía\n\nTe esperamos el sábado')).toBe(
			true
		);
		expect(m.text).toContain(`Número de orden: ${order.id}`);
	});

	it('cada builder usa su plantilla', () => {
		const tpl = { subject: 'Asunto {{evento}}', heading: 'Título', body: 'Cuerpo {{nombre}}' };
		for (const [name, fn, input] of emailCases()) {
			const m = build(fn, { ...input, template: tpl });
			expect(m.subject, name).toBe(`Asunto ${input.event.title}`);
			expect(m.html, name).toContain('>Título</h1>');
			expect(m.html, name).toContain('<p>Cuerpo Persona &lt;de&gt;');
			expect(m.text, name).toContain('Cuerpo Persona <de>');
		}
	});

	it('el texto original de cada plantilla, aplicado, dice lo mismo que el mail de siempre', () => {
		// No es byte a byte (el código tiene casos especiales), pero el saludo tiene que coincidir.
		const m = email.buildTicketEmail({ ...base, template: templateDef('tickets')?.defaults });
		expect(m.subject).toBe(
			golden['tickets-presencial'].subject.replace('Fiesta <b>de</b> prueba', event.title)
		);
		expect(m.html).toContain(
			'<p>Hola Persona &lt;de&gt; &quot;Ejemplo&quot; &amp; Cía, gracias por tu compra.</p>'
		);
	});
});

describe('formato seguro', () => {
	const vars = { nombre: '**<script>alert(1)</script>**', evento: 'A & B' };
	it('escapa las variables y el texto; las variables nunca se interpretan', () => {
		expect(renderInlineHtml('<i>{{nombre}}</i> **{{evento}}**', vars)).toBe(
			'&lt;i&gt;**&lt;script&gt;alert(1)&lt;/script&gt;**&lt;/i&gt; <strong>A &amp; B</strong>'
		);
		expect(renderInlineHtml('{{nombre}}', vars)).not.toContain('<strong>');
	});
	it('párrafos, saltos y variables desconocidas', () => {
		expect(renderBlockHtml('uno\ndos\n\n\ntres {{nada}}', vars)).toBe(
			'<p>uno<br>dos</p>\n\t\t<p>tres </p>'
		);
		expect(renderPlain('**Hola** {{evento}}', vars)).toBe('Hola A & B');
	});
	it('encuentra variables (con espacios) y marca las que no existen', () => {
		expect(findVariables('{{ nombre }} y {{evento}} y {{nombre}}')).toEqual(['nombre', 'evento']);
		expect(unknownVariables('stream', { body: '{{nombre}} {{total}} {{xyz}}' })).toEqual([
			'total',
			'xyz'
		]);
	});
	it('valida: vacío, largo, variables que no existen, llaves sin cerrar', () => {
		const ok = validateTemplate('tickets', {
			subject: ' Hola\n{{evento}} ',
			heading: 'x',
			body: 'a\r\n\r\n\r\n\r\nb'
		});
		expect(ok).toEqual({
			ok: true,
			value: { subject: 'Hola {{evento}}', heading: 'x', body: 'a\n\nb' }
		});
		const bad = /** @type {any} */ (
			validateTemplate('refund', {
				subject: '',
				heading: 'y'.repeat(201),
				body: 'Hola {{nombre}} {{link_estado}} {{ ojo'
			})
		);
		expect(bad.ok).toBe(false);
		expect(bad.errors.subject).toMatch(/vacío/);
		expect(bad.errors.heading).toMatch(/200/);
		expect(bad.errors.body).toMatch(/\{\{link_estado\}\}/);
		expect(
			/** @type {any} */ (
				validateTemplate('refund', { subject: 'a', heading: 'b', body: 'c {{ d' })
			).errors.body
		).toMatch(/sin cerrar/);
		expect(
			validateTemplate(/** @type {any} */ ('otro'), { subject: 'a', heading: 'b', body: 'c' }).ok
		).toBe(false);
	});
	it('los textos originales solo usan variables de su plantilla', () => {
		for (const t of EMAIL_TEMPLATES) {
			expect(validateTemplate(t.id, t.defaults), t.id).toMatchObject({ ok: true });
			expect(Object.keys(sampleVars(t.id)).length).toBe(t.vars.length);
		}
	});
});

describe('links en las plantillas', () => {
	const vars = {
		nombre: 'Persona <de> Ejemplo',
		evento: 'A & B',
		link_estado: 'https://ejemplo.test/x?a=1&b=2'
	};
	const A = (/** @type {string} */ href, /** @type {string} */ text) =>
		`<a href="${href}" style="color:${TEMPLATE_LINK_COLOR};">${text}</a>`;

	it('el color es el de los links de la plantilla común', () => {
		expect(TEMPLATE_LINK_COLOR).toBe(MAIL_COLORS.link);
	});

	it('https, http, mailto y tel van como link en el HTML y como «texto (dirección)» en el plano', () => {
		const text =
			'Mirá [la guía](https://ejemplo.test/guia?a=1&b=2), [la vieja](http://ejemplo.test), [escribinos](mailto:hola@ejemplo.test) o [llamanos](tel:+541100000000).';
		expect(renderInlineHtml(text, vars)).toBe(
			`Mirá ${A('https://ejemplo.test/guia?a=1&amp;b=2', 'la guía')}, ${A('http://ejemplo.test', 'la vieja')}, ${A('mailto:hola@ejemplo.test', 'escribinos')} o ${A('tel:+541100000000', 'llamanos')}.`
		);
		expect(renderPlain(text, vars, { links: true })).toBe(
			'Mirá la guía (https://ejemplo.test/guia?a=1&b=2), la vieja (http://ejemplo.test), escribinos (mailto:hola@ejemplo.test) o llamanos (tel:+541100000000).'
		);
	});

	it('javascript: y otras direcciones no son links: se ven como texto (y no se pueden guardar)', () => {
		for (const url of [
			'javascript:alert(1)',
			'javascript:alert',
			'data:text/html,hola',
			'ftp://x.test',
			'//x.test',
			'JaVaScRiPt:void'
		]) {
			const text = `[clic](${url})`;
			expect(isSafeLinkUrl(url), url).toBe(false);
			expect(renderInlineHtml(text, vars), url).not.toContain('<a');
			expect(renderPlain(text, vars, { links: true }), url).toBe(text);
			const r = /** @type {any} */ (
				validateTemplate('tickets', { subject: 'a', heading: 'b', body: `Hola ${text}` })
			);
			expect(r.ok, url).toBe(false);
			expect(r.errors.body, url).toMatch(/https:\/\/, http:\/\/, mailto: o tel:/);
		}
		expect(renderInlineHtml('[clic](javascript:alert)', vars)).toBe('[clic](javascript:alert)');
	});

	it('las variables: en el texto del link se escapan; como dirección, su valor se revisa', () => {
		expect(renderInlineHtml('[{{nombre}}]({{link_estado}})', vars)).toBe(
			A('https://ejemplo.test/x?a=1&amp;b=2', 'Persona &lt;de&gt; Ejemplo')
		);
		expect(renderInlineHtml('[ver]({{nombre}})', vars)).toBe('[ver](Persona &lt;de&gt; Ejemplo)');
		// Un valor con forma de link nunca se vuelve link.
		expect(renderInlineHtml('{{nombre}}', { nombre: '[x](https://malo.test)' })).toBe(
			'[x](https://malo.test)'
		);
		expect(
			validateTemplate('transfer', {
				subject: 'a',
				heading: 'b',
				body: 'Mirá [tu compra]({{link_estado}}).'
			}).ok
		).toBe(true);
	});

	it('el asunto no los interpreta; HTML sigue rechazado; negrita adentro del link', () => {
		const ok = validateTemplate('tickets', {
			subject: 'Mirá [esto](javascript:alert)',
			heading: 'b',
			body: '[**guía**](https://ejemplo.test)'
		});
		expect(ok.ok).toBe(true);
		expect(renderInlineHtml('[**guía**](https://ejemplo.test)', vars)).toBe(
			A('https://ejemplo.test', '<strong>guía</strong>')
		);
		const html = /** @type {any} */ (
			validateTemplate('tickets', {
				subject: 'a',
				heading: 'b',
				body: '<a href="https://ejemplo.test">guía</a>'
			})
		);
		expect(html.errors.body).toMatch(/No se puede usar HTML/);
	});

	it('en un mail: link en el HTML, «texto (dirección)» en el plano y el asunto tal cual', () => {
		const m = email.buildTicketEmail({
			order: fixtureOrder(),
			tickets: fixtureTickets(),
			event: { title: 'Fiesta de prueba', start: '2026-10-10T22:00:00-03:00' },
			typeName: 'General',
			origin: 'https://kinkyvibe.example',
			contactEmail: 'c@example.com',
			template: {
				subject: 'Mirá [la guía](https://ejemplo.test/guia)',
				heading: 'Hola',
				body: 'Leé [la guía](https://ejemplo.test/guia) antes de venir.',
				help: 'Dudas: [escribinos](mailto:hola@ejemplo.test).'
			}
		});
		expect(m.subject).toBe('Mirá [la guía](https://ejemplo.test/guia)');
		expect(m.html).toContain(
			`<p>Leé ${A('https://ejemplo.test/guia', 'la guía')} antes de venir.</p>`
		);
		expect(m.html).toContain(`Dudas: ${A('mailto:hola@ejemplo.test', 'escribinos')}.`);
		expect(m.text).toContain('Leé la guía (https://ejemplo.test/guia) antes de venir.');
		expect(m.text).toContain('Dudas: escribinos (mailto:hola@ejemplo.test).');
	});
});

describe('vista previa', () => {
	it('arma cada mail con datos de ejemplo, con y sin plantilla', () => {
		for (const t of EMAIL_TEMPLATES) {
			const ctx = { origin: 'https://kinkyvibe.example', contactEmail: 'c@example.com', now: 0 };
			const def = previewEmail(t.id, null, ctx);
			const custom = previewEmail(t.id, { subject: 'S', heading: 'H', body: 'B' }, ctx);
			expect(def.html).toContain('Persona de Ejemplo');
			expect(custom.subject).toBe('S');
			expect(custom.html).toContain('>H</h1>');
		}
	});
});

describe('guardar y restaurar (D1)', () => {
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

	it('guarda, reemplaza, lista y borra', async () => {
		expect(await getTemplateOverride(t.db, 'tickets')).toBeNull();
		const v = { subject: 'a', heading: 'b', body: 'c' };
		await saveTemplateOverride(t.db, 'tickets', v, { by: 'x', now: 1 });
		await saveTemplateOverride(t.db, 'tickets', { ...v, body: 'd' }, { by: 'y', now: 2 });
		expect(await getTemplateOverride(t.db, 'tickets')).toEqual({ ...v, body: 'd' });
		const all = await listTemplateOverrides(t.db);
		expect([...all.keys()]).toEqual(['tickets']);
		expect(all.get('tickets')).toMatchObject({ updatedAt: 2, updatedBy: 'y' });
		expect(await deleteTemplateOverride(t.db, 'tickets')).toBe(true);
		expect(await deleteTemplateOverride(t.db, 'tickets')).toBe(false);
		expect(await getTemplateOverride(t.db, 'tickets')).toBeNull();
	});

	it('sin la tabla (migración pendiente) o sin base: sin plantilla, sin romper', async () => {
		const bare = await createTestDB({ migrate: false });
		try {
			expect(await getTemplateOverride(bare.db, 'tickets')).toBeNull();
			expect((await listTemplateOverrides(bare.db)).size).toBe(0);
		} finally {
			await bare.dispose();
		}
		expect(await getTemplateOverride(null, 'tickets')).toBeNull();
	});
});
