/**
 * Plantillas de mails de un evento (pestaña "Plantillas de mails" de la ficha): solo admins,
 * valida (nada de HTML), guarda solo lo que cambia, "volver a la plantilla general" borra, y la
 * vista previa muestra lo junto (evento → general → código) con el evento de verdad.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { getEventTemplateOverride, saveTemplateOverride } from '$lib/server/tickets/templates.js';
import { runImport } from '$lib/server/contenido/importer.js';
import { setContentDB } from '$lib/server/contenido/repo.js';
import { actions, load } from './+page.server.js';
import { POST } from './vista-previa/+server.js';

// Evento de prueba del repo que vende entradas (solo en dev/tests, nunca en el sitio publicado),
// importado a la base de prueba.
const EVENT = 'prueba-entradas-2026-12';
const ADMIN = { id: 4594048, login: 'GorroRojo', name: null, avatar_url: '' };

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
/** El evento de prueba del repo, como lo importa la base (de donde salen los eventos). */
const source = {
	raw: /** @type {Record<string, string>} */ (
		import.meta.glob('/src/lib/posts/calendario/prueba-entradas-2026-12.md', {
			query: '?raw',
			import: 'default',
			eager: true
		})
	)[`/src/lib/posts/calendario/${EVENT}.md`],
	meta: /** @type {Record<string, any>} */ (
		import.meta.glob('/src/lib/posts/calendario/prueba-entradas-2026-12.md', {
			import: 'metadata',
			eager: true
		})
	)[`/src/lib/posts/calendario/${EVENT}.md`]
};

beforeEach(async () => {
	await resetDB(t.db);
	setContentDB(t.db);
	await runImport(t.db, 'calendario', [{ legacySlug: EVENT, ...source }], { actor: 'prueba' });
});

/**
 * @param {{ user?: any, form?: Record<string, string>, id?: string, action?: string }} [opts]
 */
function event({ user = ADMIN, form = {}, id = 'reminder', action = 'save' } = {}) {
	const body = new FormData();
	for (const [k, v] of Object.entries(form)) body.set(k, v);
	const url = new URL(`https://kinkyvibe.ar/admin/eventos/${EVENT}/mails/${id}`);
	return /** @type {any} */ ({
		locals: user ? { user, user_token: 't' } : {},
		url,
		params: { slug: EVENT, id },
		platform: t.platform,
		request: new Request(`${url.href}?/${action}`, { method: 'POST', body }),
		fetch: vi.fn(async () => new Response('{}', { status: 404 })),
		setHeaders: () => {}
	});
}

/** @param {() => any} fn */
async function thrown(fn) {
	try {
		await fn();
	} catch (e) {
		return e;
	}
	throw new Error('no tiró');
}

describe('plantillas de mails de un evento', () => {
	it('sin sesión: al login; sin ser admin: 403. No guarda nada', async () => {
		const form = { heading: 'Hola' };
		expect(isRedirect(await thrown(() => actions.save(event({ user: null, form }))))).toBe(true);
		const notAdmin = await thrown(() =>
			actions.save(event({ user: { id: 1, login: 'otra', name: null, avatar_url: '' }, form }))
		);
		expect(isHttpError(notAdmin) && notAdmin.status).toBe(403);
		expect(await getEventTemplateOverride(t.db, EVENT, 'reminder')).toBeNull();
	});

	it('un mail o un evento que no existe: 404', async () => {
		const noMail = await thrown(() => actions.save(event({ id: 'otro' })));
		expect(isHttpError(noMail) && noMail.status).toBe(404);
	});

	it('guarda solo lo que cambia; HTML no; todo vacío vuelve a la general', async () => {
		const bad = /** @type {any} */ (
			await actions.save(event({ form: { heading: '<a href="https://example.com">x</a>' } }))
		);
		expect(bad.status).toBe(400);
		expect(bad.data.errors.heading).toMatch(/HTML/);
		expect(await getEventTemplateOverride(t.db, EVENT, 'reminder')).toBeNull();

		const ok = /** @type {any} */ (
			await actions.save(
				event({ form: { subject: '', heading: '¡{{evento}} {{cuando}}!', help: 'Traé agua' } })
			)
		);
		expect(ok).toMatchObject({ ok: true, reset: false });
		expect(await getEventTemplateOverride(t.db, EVENT, 'reminder')).toEqual({
			heading: '¡{{evento}} {{cuando}}!',
			help: 'Traé agua'
		});

		const data = /** @type {any} */ (await load(event()));
		expect(data.saved).toMatchObject({
			heading: '¡{{evento}} {{cuando}}!',
			updatedBy: 'GorroRojo'
		});
		// Lo que sale si queda vacío: el texto de siempre (no hay plantilla general).
		expect(data.inherited.subject).toBe('Recordatorio: {{evento}} {{cuando}}');
		expect(data.inherited.label).toBe('Recordatorio');

		const cleared = /** @type {any} */ (await actions.save(event({ form: {} })));
		expect(cleared).toMatchObject({ ok: true, reset: true });
		expect(await getEventTemplateOverride(t.db, EVENT, 'reminder')).toBeNull();

		const { results } = await t.db
			.prepare('SELECT action FROM admin_audit WHERE target_id = ?1 ORDER BY id')
			.bind(`${EVENT}/reminder`)
			.all();
		expect(results.map((r) => r.action)).toEqual(['template.event_save', 'template.event_reset']);
	});

	it('volver a la plantilla general borra lo del evento', async () => {
		await actions.save(event({ form: { button: 'Mis entradas' } }));
		expect(await getEventTemplateOverride(t.db, EVENT, 'reminder')).not.toBeNull();
		const r = /** @type {any} */ (await actions.reset(event({ action: 'reset' })));
		expect(r).toMatchObject({ ok: true, reset: true });
		expect(await getEventTemplateOverride(t.db, EVENT, 'reminder')).toBeNull();
	});

	it('lo heredado y la vista previa usan la plantilla general', async () => {
		await saveTemplateOverride(
			t.db,
			'reminder',
			{
				subject: 'General: {{evento}}',
				heading: 'Título general',
				body: 'Texto general',
				label: 'Etiqueta general'
			},
			{ by: 'x' }
		);
		const data = /** @type {any} */ (await load(event()));
		expect(data.hasGeneral).toBe(true);
		expect(data.inherited).toMatchObject({
			subject: 'General: {{evento}}',
			label: 'Etiqueta general',
			why: 'Te llega porque compraste entradas en kinkyvibe.ar.'
		});

		const req = event();
		req.request = new Request(`${req.url.href}/vista-previa`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ heading: 'Del evento <b>', body: '' })
		});
		const res = await POST(req);
		const preview = await res.json();
		// Con HTML no se puede guardar, pero la vista previa lo muestra escapado.
		expect(preview.errors.heading).toMatch(/HTML/);
		expect(preview.html).toContain('>Del evento &lt;b&gt;</h1>');
		expect(preview.html).toContain('<p>Texto general</p>');
		expect(preview.html).toContain('>Etiqueta general</p>');
		// El evento de verdad (la compra es de ejemplo).
		expect(preview.subject).toMatch(/^General: /);
		expect(preview.subject).not.toContain('Fiesta de ejemplo');
		expect(preview.html).toContain('Persona de Ejemplo');
	});
});
