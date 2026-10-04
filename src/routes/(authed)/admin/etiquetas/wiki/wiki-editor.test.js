/**
 * Etiquetas › «Entrada de la Kinkipedia» (/admin/etiquetas/wiki/<dirección>): el texto de la wiki
 * se edita y se guarda en la base al momento (sin GitHub), con historial, registro en Actividad y
 * control de versión; se puede escribir la entrada de una etiqueta que no tenía y sacarla. Solo
 * admins. D1 de miniflare; etiquetas y textos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { importTags } from '$lib/server/etiquetas/importer.js';
import { listRevisions } from '$lib/server/contenido/revisions.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

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
	await importTags(
		t.db,
		{
			rawTags: [
				{ id: 'root', children: ['termino inventado', 'sin texto inventado'] },
				{ id: 'termino inventado' },
				{ id: 'sin texto inventado', description: 'Una descripción corta inventada.' }
			],
			wikiFiles: [
				{
					name: 'termino-inventado',
					raw: '---\ntitle: Término Inventado\nwiki: termino inventado\nsummary: Resumen.\nlayout: wiki\ncategory: wiki\n---\n\nTexto viejo.\n'
				}
			]
		},
		{ actor: 'prueba' }
	);
});
afterEach(() => {
	vi.resetModules();
});

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

/**
 * @param {{ term: string, form?: Record<string, string>, user?: any }} o
 */
function fakeEvent({ term, form, user }) {
	const url = new URL(`/admin/etiquetas/wiki/${term}`, 'https://kinkyvibe.ar');
	return /** @type {any} */ ({
		url,
		params: { term },
		platform: t.platform,
		locals: { user: user === undefined ? admin : user, user_token: 'token-de-prueba' },
		setHeaders: () => {},
		request: new Request(url, {
			method: form ? 'POST' : 'GET',
			body: form ? new URLSearchParams(form) : undefined
		})
	});
}

/** @param {() => unknown} fn */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return /** @type {any} */ (e);
	}
}

/** @param {string} key */
async function tagData(key) {
	const row = await t.db
		.prepare(
			"SELECT id, data FROM objects WHERE type = 'etiqueta' AND json_extract(data, '$.key') = ?1"
		)
		.bind(key)
		.first();
	return { id: Number(row?.id), data: JSON.parse(String(row?.data)) };
}

/** @param {any} values @param {Record<string, string>} [changes] */
const formOf = (values, changes = {}) => ({
	title: values.title,
	summary: values.summary,
	authors: values.authors,
	tags: values.tags,
	body: values.body,
	version: String(values.version),
	...changes
});

describe('Etiquetas › Entrada de la Kinkipedia', () => {
	it('guarda en la base al momento, con historial y Actividad; si alguien guardó en el medio, 409', async () => {
		const m = await import('./[term]/+page.server.js');
		const opened = /** @type {any} */ (await m.load(fakeEvent({ term: 'termino-inventado' })));
		expect(opened).toMatchObject({
			exists: true,
			tag: { key: 'termino inventado', slug: 'termino-inventado' },
			values: { title: 'Término Inventado', summary: 'Resumen.', body: 'Texto viejo.' }
		});
		const saved = /** @type {any} */ (
			await m.actions.guardar(
				fakeEvent({
					term: 'termino-inventado',
					form: formOf(opened.values, { body: 'Texto nuevo con [[sin texto inventado]].' })
				})
			)
		);
		expect(saved.wiki.ok).toBe(true);
		const { id, data } = await tagData('termino inventado');
		expect(data).toMatchObject({
			key: 'termino inventado',
			body: 'Texto nuevo con [[sin texto inventado]].',
			wiki_title: 'Término Inventado',
			// Lo guarda une admin del panel (superadmin, decisión 0003): HTML libre.
			wiki_body_html: 'libre'
		});
		expect((await listRevisions(t.db, id))[0]).toMatchObject({ source: 'panel' });
		const audit = await t.db
			.prepare("SELECT summary FROM admin_audit WHERE action = 'wiki.update'")
			.all();
		expect(audit.results).toEqual([
			{ summary: 'Editó la entrada de la Kinkipedia de «termino inventado»' }
		]);

		// Otra pestaña con la versión vieja: no pisa nada.
		const stale = /** @type {any} */ (
			await m.actions.guardar(
				fakeEvent({ term: 'termino-inventado', form: formOf(opened.values, { body: 'Pisado.' }) })
			)
		);
		expect(stale.status).toBe(409);
		expect(stale.data.wiki.values.body).toBe('Pisado.');
		expect((await tagData('termino inventado')).data.body).toBe(
			'Texto nuevo con [[sin texto inventado]].'
		);
	});

	it('escribe la entrada de una etiqueta que no tenía, sin tocar la etiqueta, y la saca', async () => {
		const m = await import('./[term]/+page.server.js');
		const opened = /** @type {any} */ (await m.load(fakeEvent({ term: 'sin-texto-inventado' })));
		expect(opened.exists).toBe(false);
		const saved = /** @type {any} */ (
			await m.actions.guardar(
				fakeEvent({
					term: 'sin-texto-inventado',
					form: formOf(opened.values, {
						title: 'Sin Texto',
						summary: 'Ahora sí.',
						authors: 'Alguien Inventade',
						body: '## Uno\n\nTexto.'
					})
				})
			)
		);
		expect(saved.wiki.ok).toBe(true);
		const after = await tagData('sin texto inventado');
		expect(after.data).toMatchObject({
			description: 'Una descripción corta inventada.',
			wiki_title: 'Sin Texto',
			wiki_summary: 'Ahora sí.',
			wiki_authors: ['Alguien Inventade'],
			body: '## Uno\n\nTexto.'
		});
		const again = /** @type {any} */ (await m.load(fakeEvent({ term: 'sin-texto-inventado' })));
		const removed = /** @type {any} */ (
			await m.actions.sacar(fakeEvent({ term: 'sin-texto-inventado', form: formOf(again.values) }))
		);
		expect(removed.wiki.ok).toBe(true);
		const gone = await tagData('sin texto inventado');
		expect(gone.data).toEqual({
			key: 'sin texto inventado',
			description: 'Una descripción corta inventada.'
		});
	});

	it('solo admins; una dirección sin etiqueta da 404', async () => {
		const m = await import('./[term]/+page.server.js');
		const anon = await thrown(() => m.load(fakeEvent({ term: 'termino-inventado', user: null })));
		expect(anon?.status).toBe(303);
		const intruder = { id: 1, login: 'alguien-que-no-es-admin' };
		const no = await thrown(() =>
			m.actions.guardar(fakeEvent({ term: 'termino-inventado', form: {}, user: intruder }))
		);
		expect(no?.status).toBe(403);
		const missing = await thrown(() => m.load(fakeEvent({ term: 'no-existe-inventada' })));
		expect(missing?.status).toBe(404);
	});
});
