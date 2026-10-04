/**
 * Plantillas de mails: las partes opcionales (etiqueta, botón, ayuda, pie) y lo que cambia por
 * evento. Orden: lo del evento → la plantilla general → el texto del código. Datos inventados.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	EMAIL_TEMPLATES,
	TEMPLATE_EXTRAS,
	TEMPLATE_LIMITS,
	mergeTemplates,
	templateKeys,
	validateTemplate
} from '$lib/utils/emailTemplates.js';
import * as email from './email.js';
import { emailCases } from './email.fixtures.js';
import { previewEmail } from './templatePreview.js';
import {
	deleteEventTemplateOverride,
	getEventTemplateOverride,
	getTemplateOverride,
	listEventTemplateOverrides,
	listTemplateOverrides,
	resolveTemplate,
	saveEventTemplateOverride,
	saveTemplateOverride
} from './templates.js';

const golden = JSON.parse(readFileSync(new URL('./email.golden.json', import.meta.url), 'utf8'));

/** @param {string} fn @param {any} input */
const build = (fn, input) => /** @type {any} */ (email)[fn](input);

/** Qué plantilla usa cada builder. */
/** @type {Record<string, import('$lib/utils/emailTemplates.js').TemplateId>} */
const TEMPLATE_OF = {
	buildTicketEmail: 'tickets',
	buildTransferEmail: 'transfer',
	buildStreamLinkEmail: 'stream',
	buildReminderEmail: 'reminder',
	buildRefundEmail: 'refund'
};

/** Etiqueta gris, botón y pie del HTML. */
const LABEL_RE = /<p style="[^"]*text-transform:uppercase[^"]*">([^<]*)<\/p>/;
const BUTTON_RE = /font-size:19px;font-weight:700;color:#ffffff;[^"]*">([^<]*)<\/a>/;
const WHY_RE = /text-align:center;">\n([^\n]*)<br>\n¿Dudas\?/;

describe('mergeTemplates: evento → general → código', () => {
	it('cada parte sale de la primera capa que tiene texto', () => {
		const general = { subject: 'G asunto', heading: 'G título', body: 'G texto', why: 'G pie' };
		const event = { heading: 'E título', button: 'E botón', body: '   ', why: '' };
		expect(mergeTemplates(event, general)).toEqual({
			subject: 'G asunto',
			heading: 'E título',
			body: 'G texto',
			button: 'E botón',
			why: 'G pie'
		});
		// Sin general: solo lo del evento (lo demás, el código).
		expect(mergeTemplates(event, null)).toEqual({ heading: 'E título', button: 'E botón' });
		// Nada en ninguna capa: null (el mail sale como siempre).
		expect(mergeTemplates(null, undefined)).toBeNull();
		expect(mergeTemplates({ subject: '', heading: ' ' }, null)).toBeNull();
	});
});

describe('las partes opcionales en los mails', () => {
	it.each(emailCases())('%s: sin nada propio, igual a la golden', (name, fn, input) => {
		// Una plantilla con todas las partes vacías es lo mismo que no tener plantilla.
		const empty = { subject: '', heading: '', body: '', label: '', button: '', help: '', why: '' };
		expect(build(fn, { ...input, template: empty })).toEqual(golden[name]);
		expect(build(fn, { ...input, template: {} })).toEqual(golden[name]);
	});

	it.each(emailCases())(
		'%s: etiqueta, botón y pie cambian el HTML (escapados) y no el texto plano',
		(name, fn, input) => {
			const id = TEMPLATE_OF[fn];
			const keys = templateKeys(id);
			const tpl = {
				label: 'Etiqueta <b>{{evento}}</b>',
				button: '**Botón** {{nombre}}',
				why: 'Te llega por **{{nombre}}**'
			};
			const m = build(fn, { ...input, template: tpl });
			const g = golden[name];
			// Lo que no se cambió sigue igual.
			expect(m.subject, name).toBe(g.subject);
			expect(m.text, name).toBe(g.text);
			expect(m.html.match(/<h1[^>]*>.*<\/h1>/)?.[0], name).toBe(
				g.html.match(/<h1[^>]*>.*<\/h1>/)?.[0]
			);
			// La etiqueta: texto solo, escapado.
			expect(m.html.match(LABEL_RE)?.[1], name).toBe(
				`Etiqueta &lt;b&gt;${email.escapeHtml(input.event.title)}&lt;/b&gt;`
			);
			// El pie: con negrita, la variable escapada.
			expect(m.html.match(WHY_RE)?.[1], name).toBe(
				'Te llega por <strong>Persona &lt;de&gt; &quot;Ejemplo&quot; &amp; Cía</strong>'
			);
			// El botón: texto solo (sin **), a donde iba siempre.
			const button = g.html.match(BUTTON_RE);
			if (keys.includes('button') && button) {
				expect(m.html.match(BUTTON_RE)?.[1], name).toBe(
					'Botón Persona &lt;de&gt; &quot;Ejemplo&quot; &amp; Cía'
				);
				const href = (/** @type {string} */ h) =>
					h.match(/<a href="([^"]*)"[^>]*font-size:19px/)?.[1];
				expect(href(m.html), name).toBe(href(g.html));
			} else {
				expect(m.html.match(BUTTON_RE)?.[1], name).toBe(button?.[1]);
			}
		}
	);

	it.each(emailCases())(
		'%s: la línea de ayuda propia va en el HTML y en el texto',
		(name, fn, input) => {
			const m = build(fn, { ...input, template: { help: 'Traé **agua** y a {{nombre}}' } });
			const g = golden[name];
			if (!templateKeys(TEMPLATE_OF[fn]).includes('help')) {
				// El reembolso no tiene botón ni línea de ayuda: se ignora.
				expect(m, name).toEqual(g);
				return;
			}
			expect(m.subject, name).toBe(g.subject);
			expect(m.html, name).toContain(
				'>Traé <strong>agua</strong> y a Persona &lt;de&gt; &quot;Ejemplo&quot; &amp; Cía</p>'
			);
			expect(m.text, name).toContain('Traé agua y a Persona <de> "Ejemplo" & Cía');
			expect(m.text, name).not.toContain('**');
			// Las entradas, los links y el número de orden siguen.
			for (const line of g.text
				.split('\n')
				.filter((/** @type {string} */ l) => /^Entrada \d|^Número de orden|^Link/.test(l)))
				expect(m.text, name).toContain(line);
		}
	);

	it('la transmisión con ayuda propia no pierde los links a cada entrada', () => {
		const [, fn, input] = /** @type {[string, string, any]} */ (
			emailCases().find(([n]) => n === 'stream')
		);
		const m = build(fn, { ...input, template: { help: 'Conectate 10 minutos antes.' } });
		for (const t of input.tickets)
			expect(m.html).toContain(`${input.origin}/entradas/t/${t.token}`);
	});

	it('el texto de siempre de cada parte coincide con el del código', () => {
		for (const [name, fn, input] of emailCases()) {
			const def = /** @type {any} */ (EMAIL_TEMPLATES.find((t) => t.id === TEMPLATE_OF[fn]));
			const g = golden[name];
			expect(g.html.match(LABEL_RE)?.[1], name).toBe(email.escapeHtml(def.extras.label.default));
			expect(g.html.match(WHY_RE)?.[1], name).toBe(email.escapeHtml(def.extras.why.default));
			// El botón de siempre (en presencial y sin confirmar) es el de la definición.
			const b = g.html.match(BUTTON_RE)?.[1];
			if (
				def.extras.button &&
				!input.event.online &&
				!input.confirmUrl &&
				fn !== 'buildStreamLinkEmail'
			)
				expect(b, name).toBe(email.escapeHtml(def.extras.button.default));
		}
	});
});

describe('validar las partes', () => {
	it('las opcionales pueden quedar vacías; con texto, se limpian (una línea)', () => {
		const ok = validateTemplate('tickets', {
			subject: 'a',
			heading: 'b',
			body: 'c',
			label: '  Tus\nentradas ',
			button: '',
			help: 'Una\r\nlínea'
		});
		expect(ok).toEqual({
			ok: true,
			value: { subject: 'a', heading: 'b', body: 'c', label: 'Tus entradas', help: 'Una línea' }
		});
	});

	it('las partes que ese mail no tiene no se guardan (el reembolso no tiene botón)', () => {
		const v = validateTemplate('refund', {
			subject: 'a',
			heading: 'b',
			body: 'c',
			button: 'Botón',
			help: 'Ayuda',
			why: 'Pie'
		});
		expect(v).toEqual({ ok: true, value: { subject: 'a', heading: 'b', body: 'c', why: 'Pie' } });
		expect(templateKeys('refund')).not.toContain('button');
		for (const t of EMAIL_TEMPLATES) expect(templateKeys(t.id)).toContain('label');
	});

	it('largo, variables que no existen, llaves sin cerrar', () => {
		const bad = /** @type {any} */ (
			validateTemplate('stream', {
				subject: 'a',
				heading: 'b',
				body: 'c',
				label: 'x'.repeat(TEMPLATE_LIMITS.label + 1),
				button: 'Ver {{total}}',
				help: 'Hola {{ nombre',
				why: 'y'.repeat(TEMPLATE_LIMITS.why + 1)
			})
		);
		expect(bad.ok).toBe(false);
		expect(bad.errors.label).toMatch(String(TEMPLATE_LIMITS.label));
		expect(bad.errors.button).toMatch(/\{\{total\}\}/);
		expect(bad.errors.help).toMatch(/sin cerrar/);
		expect(bad.errors.why).toMatch(String(TEMPLATE_LIMITS.why));
	});

	it('no acepta HTML en ninguna parte (los < sueltos sí)', () => {
		for (const key of ['subject', 'heading', 'body', ...TEMPLATE_EXTRAS]) {
			for (const html of [
				'<a href="https://example.com">acá</a>',
				'hola</p>',
				'<img src=x onerror=alert(1)>',
				'<!-- nada -->',
				'<br/>'
			]) {
				const form = { subject: 'a', heading: 'b', body: 'c', [key]: html };
				const v = /** @type {any} */ (validateTemplate('tickets', form));
				expect(v.ok, `${key}: ${html}`).toBe(false);
				expect(v.errors[key], `${key}: ${html}`).toMatch(/HTML/);
			}
		}
		expect(
			validateTemplate('tickets', {
				subject: 'a <3 b',
				heading: '2 < 3 > 1',
				body: 'c',
				help: '<3'
			}).ok
		).toBe(true);
	});

	it('por evento todo puede quedar vacío; en la general, asunto, título y texto no', () => {
		expect(validateTemplate('reminder', {}, { optional: true })).toEqual({
			ok: true,
			value: { subject: '', heading: '', body: '' }
		});
		const general = /** @type {any} */ (validateTemplate('reminder', { label: 'x' }));
		expect(general.ok).toBe(false);
		expect(Object.keys(general.errors).sort()).toEqual(['body', 'heading', 'subject']);
		// Por evento también se valida lo que tiene texto.
		const bad = /** @type {any} */ (
			validateTemplate('reminder', { heading: '<b>hola</b>' }, { optional: true })
		);
		expect(bad.errors.heading).toMatch(/HTML/);
	});

	it('las partes opcionales de siempre son válidas', () => {
		for (const t of EMAIL_TEMPLATES) {
			const extras = Object.fromEntries(
				Object.entries(t.extras).map(([k, e]) => [k, /** @type {any} */ (e).default])
			);
			expect(validateTemplate(t.id, { ...t.defaults, ...extras }), t.id).toMatchObject({
				ok: true
			});
		}
	});
});

describe('vista previa', () => {
	const ctx = { origin: 'https://kinkyvibe.example', contactEmail: 'c@example.com', now: 0 };

	it('con un evento, usa su título y su fecha; la compra sigue siendo de ejemplo', () => {
		const m = previewEmail('tickets', null, {
			...ctx,
			event: { title: 'Evento Inventado', start: '2026-11-07T21:00:00-03:00', location: 'Lugar X' }
		});
		expect(m.subject).toBe('Tus entradas para Evento Inventado');
		expect(m.html).toContain('Evento Inventado');
		expect(m.html).toContain('noviembre');
		expect(m.html).toContain('Persona de Ejemplo');
		expect(m.html).not.toContain('Fiesta de ejemplo');
	});

	it('muestra lo junto: lo del evento sobre la general', () => {
		const general = {
			subject: 'General {{evento}}',
			heading: 'Título general',
			body: 'Texto general',
			label: 'Etiqueta general'
		};
		for (const t of EMAIL_TEMPLATES) {
			const m = previewEmail(t.id, mergeTemplates({ heading: 'Título del evento' }, general), ctx);
			expect(m.subject, t.id).toBe('General Fiesta de ejemplo');
			expect(m.html, t.id).toContain('>Título del evento</h1>');
			expect(m.html, t.id).toContain('<p>Texto general</p>');
			expect(m.html.match(LABEL_RE)?.[1], t.id).toBe('Etiqueta general');
		}
	});
});

describe('guardar por evento y resolver (D1)', () => {
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

	it('la general guarda y lee las partes opcionales', async () => {
		const v = { subject: 'a', heading: 'b', body: 'c', button: 'Botón', why: 'Pie' };
		await saveTemplateOverride(t.db, 'tickets', v, { by: 'x', now: 1 });
		expect(await getTemplateOverride(t.db, 'tickets')).toEqual(v);
		expect((await listTemplateOverrides(t.db)).get('tickets')).toMatchObject(v);
		// Al reemplazarla sin ellas, quedan vacías.
		await saveTemplateOverride(
			t.db,
			'tickets',
			{ subject: 'a', heading: 'b', body: 'c' },
			{ by: 'x' }
		);
		expect(await getTemplateOverride(t.db, 'tickets')).toEqual({
			subject: 'a',
			heading: 'b',
			body: 'c'
		});
	});

	it('guarda, reemplaza, lista y borra lo de un evento; todo vacío = borrar', async () => {
		expect(await getEventTemplateOverride(t.db, 'fiesta-a', 'reminder')).toBeNull();
		expect(
			await saveEventTemplateOverride(
				t.db,
				'fiesta-a',
				'reminder',
				{ subject: '', heading: 'Nos vemos', body: '', help: 'Traé agua' },
				{ by: 'x', now: 5 }
			)
		).toBe(true);
		expect(await getEventTemplateOverride(t.db, 'fiesta-a', 'reminder')).toEqual({
			heading: 'Nos vemos',
			help: 'Traé agua'
		});
		// Otro evento y otro mail no se enteran.
		expect(await getEventTemplateOverride(t.db, 'fiesta-b', 'reminder')).toBeNull();
		expect(await getEventTemplateOverride(t.db, 'fiesta-a', 'tickets')).toBeNull();
		const list = await listEventTemplateOverrides(t.db, 'fiesta-a');
		expect([...list.keys()]).toEqual(['reminder']);
		expect(list.get('reminder')).toMatchObject({ updatedAt: 5, updatedBy: 'x' });

		expect(
			await saveEventTemplateOverride(
				t.db,
				'fiesta-a',
				'reminder',
				{ subject: '', heading: '', body: '' },
				{ by: 'y' }
			)
		).toBe(false);
		expect(await getEventTemplateOverride(t.db, 'fiesta-a', 'reminder')).toBeNull();
		expect(await deleteEventTemplateOverride(t.db, 'fiesta-a', 'reminder')).toBe(false);
	});

	it('resolveTemplate: evento → general → código', async () => {
		// Nada guardado: null (el mail sale como siempre).
		expect(await resolveTemplate(t.db, 'fiesta-a', 'tickets')).toBeNull();
		// Solo el evento.
		await saveEventTemplateOverride(
			t.db,
			'fiesta-a',
			'tickets',
			{ subject: '', heading: 'Del evento', body: '', button: 'Botón del evento' },
			{ by: 'x' }
		);
		expect(await resolveTemplate(t.db, 'fiesta-a', 'tickets')).toEqual({
			heading: 'Del evento',
			button: 'Botón del evento'
		});
		// Con general: lo que el evento no cambia sale de la general.
		await saveTemplateOverride(
			t.db,
			'tickets',
			{ subject: 'General', heading: 'Título general', body: 'Texto general', why: 'Pie general' },
			{ by: 'x' }
		);
		expect(await resolveTemplate(t.db, 'fiesta-a', 'tickets')).toEqual({
			subject: 'General',
			heading: 'Del evento',
			body: 'Texto general',
			button: 'Botón del evento',
			why: 'Pie general'
		});
		// Otro evento: solo la general.
		expect(await resolveTemplate(t.db, 'fiesta-b', 'tickets')).toEqual({
			subject: 'General',
			heading: 'Título general',
			body: 'Texto general',
			why: 'Pie general'
		});
		// Sin evento (o sin slug): la general.
		expect(await resolveTemplate(t.db, null, 'tickets')).toMatchObject({
			heading: 'Título general'
		});

		// Y el mail armado con lo resuelto.
		const [, fn, input] = /** @type {[string, string, any]} */ (emailCases()[0]);
		const m = build(fn, { ...input, template: await resolveTemplate(t.db, 'fiesta-a', 'tickets') });
		expect(m.subject).toBe('General');
		expect(m.html).toContain('>Del evento</h1>');
		expect(m.html.match(BUTTON_RE)?.[1]).toBe('Botón del evento');
		expect(m.html.match(WHY_RE)?.[1]).toBe('Pie general');
	});

	it('sin la migración 0034: la general se sigue leyendo; lo del evento, nada', async () => {
		const bare = await createTestDB({ migrate: false });
		try {
			await bare.db.exec(
				'CREATE TABLE email_templates (id TEXT PRIMARY KEY NOT NULL, subject TEXT NOT NULL, heading TEXT NOT NULL, body TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL)'
			);
			await bare.db
				.prepare(
					"INSERT INTO email_templates VALUES ('tickets', 'Asunto', 'Título', 'Texto', 1, 'x')"
				)
				.run();
			const v = { subject: 'Asunto', heading: 'Título', body: 'Texto' };
			expect(await getTemplateOverride(bare.db, 'tickets')).toEqual(v);
			expect((await listTemplateOverrides(bare.db)).get('tickets')).toMatchObject(v);
			expect(await getEventTemplateOverride(bare.db, 'fiesta-a', 'tickets')).toBeNull();
			expect((await listEventTemplateOverrides(bare.db, 'fiesta-a')).size).toBe(0);
			expect(await resolveTemplate(bare.db, 'fiesta-a', 'tickets')).toEqual(v);
		} finally {
			await bare.dispose();
		}
		expect(await resolveTemplate(null, 'fiesta-a', 'tickets')).toBeNull();
	});
});
