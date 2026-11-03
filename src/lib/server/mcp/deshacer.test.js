/**
 * Deshacer y editar todo lo que edita el panel, desde el conector de Claude (./historial.js,
 * ./edicion.js), de punta a punta con datos inventados en un D1 de miniflare y los guardados de
 * verdad del panel:
 *
 * - deshacer devuelve exactamente el texto de antes, y un deshacer también se deshace;
 * - un deshacer viejo (alguien guardó en el medio) no se aplica;
 * - cada tipo nuevo (evento entero, material, perfil, lugar, etiqueta, Kinkipedia, borradores) se
 *   guarda por el guardado del panel y queda en el historial como «Claude, confirmado por …»;
 * - lo que manda mails o mueve plata no se hace: cancelar un evento (también deshaciendo hasta una
 *   versión cancelada) y, con gente en la lista de espera, cambiar el cupo o el estado.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { fixtureFiles } from '$lib/server/contenido/testing.js';
import { runImport } from '$lib/server/contenido/importer.js';
import { ADMINS } from '$lib/server/auth';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const EVENT = 'fiesta-inventada-2031-01';
const MATERIAL = 'guia-inventada-de-nudos';
const [admin] = ADMINS;

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
	const now = Date.now();
	await runImport(
		t.db,
		'calendario',
		fixtureFiles('calendario').filter((f) => f.legacySlug === EVENT),
		{ actor: 'importacion', now }
	);
	// La guía de la semilla tiene un link viejo («1»): acá, uno que el formulario acepta.
	await runImport(
		t.db,
		'material',
		fixtureFiles('material')
			.filter((f) => f.legacySlug === MATERIAL)
			.map((f) => ({
				...f,
				raw: f.raw.replace(/^link: 1$/m, 'link: https://ejemplo.test/guia'),
				meta: { ...f.meta, link: 'https://ejemplo.test/guia' }
			})),
		{ actor: 'importacion', now }
	);
});
afterEach(() => {
	vi.resetModules();
});

/** @param {string} key @param {boolean} on */
const setFlag = (key, on) =>
	t.db
		.prepare(
			`INSERT INTO feature_flags (key, enabled, updated_at, updated_by) VALUES (?1, ?2, 0, 'test')
			ON CONFLICT (key) DO UPDATE SET enabled = excluded.enabled`
		)
		.bind(key, on ? 1 : 0)
		.run();

/** Los módulos con la base registrada (como hooks.server.js) y los interruptores. */
async function setup() {
	vi.resetModules();
	const repo = await import('$lib/server/contenido/repo.js');
	repo.setContentDB(t.db);
	await setFlag('conector_claude', true);
	await setFlag('conector_claude_edicion', true);
	const flags = await import('$lib/server/flags.js');
	flags.clearFlagCache();
	const rpc = await import('./rpc.js');
	const ctx = {
		db: t.db,
		user: { id: admin.id, login: admin.login },
		canEdit: true,
		fetch: globalThis.fetch,
		now: Date.now(),
		platform: /** @type {App.Platform} */ (/** @type {unknown} */ ({ env: { DB: t.db } })),
		origin: 'https://ejemplo.test'
	};
	let n = 0;
	/** @param {string} name @param {Record<string, unknown>} args */
	const call = async (name, args) => {
		const r = /** @type {any} */ (
			await rpc.handleMessage(
				{ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } },
				{ ...ctx, now: Date.now() }
			)
		);
		return /** @type {{ isError: boolean, structuredContent?: any, content: { text: string }[] }} */ (
			r.result
		);
	};
	/**
	 * Vista previa y aplicar (con «confirmado por»); devuelve las dos respuestas.
	 * @param {Record<string, unknown>} args
	 * @param {string | null} [confirmedBy]
	 */
	const change = async (args, confirmedBy = 'Mel') => {
		const preview = await call('vista_previa', args);
		expect(preview.isError, preview.content[0].text).toBe(false);
		const { hash, version } = preview.structuredContent;
		const applied = await call('aplicar', {
			...args,
			hash,
			version,
			...(confirmedBy ? { confirmado_por: confirmedBy } : {})
		});
		return { preview, applied };
	};
	return { repo, call, change };
}

/** El texto de un post como lo da el panel. @param {any} repo @param {string} category @param {string} slug */
const rawOf = async (repo, category, slug) =>
	/** @type {{ raw: string }} */ (await repo.findDbPost(t.db, category, slug)).raw;

/** La última versión del historial de un objeto. @param {number} id */
const lastRevision = (id) =>
	/** @type {Promise<any>} */ (
		t.db
			.prepare(
				'SELECT version, source, saved_by, confirmed_by, edges FROM object_revisions WHERE object_id = ?1 ORDER BY version DESC LIMIT 1'
			)
			.bind(id)
			.first()
	);

/** El id de un objeto por tipo y dirección (vieja o propia). @param {string} type @param {string} slug */
const objectId = async (type, slug) =>
	Number(
		/** @type {any} */ (
			await t.db
				.prepare(
					`SELECT o.id FROM objects o LEFT JOIN content_sources s ON s.object_id = o.id
					WHERE o.type = ?1 AND (s.legacy_slug = ?2 OR o.slug = ?2) LIMIT 1`
				)
				.bind(type, slug)
				.first()
		).id
	);

/** «Claude, confirmado por Mel» en la última versión, a nombre de le admin. @param {number} id */
async function expectClaudeRevision(id, confirmedBy = 'Mel') {
	const rev = await lastRevision(id);
	expect(rev).toMatchObject({ source: 'claude', saved_by: admin.login, confirmed_by: confirmedBy });
	const { revisionAuthorLabel } = await import('$lib/server/contenido/revisions.js');
	expect(
		revisionAuthorLabel({
			savedBy: rev.saved_by,
			source: rev.source,
			confirmedBy: rev.confirmed_by
		})
	).toBe(`Claude, confirmado por ${confirmedBy}`);
	return rev;
}

describe('deshacer', () => {
	it('vuelve exactamente al texto de antes, y el deshacer también se deshace', async () => {
		const s = await setup();
		const original = await rawOf(s.repo, 'calendario', EVENT);
		const { applied } = await s.change({
			operacion: 'editar_objeto',
			tipo: 'evento',
			objeto: EVENT,
			cambios: {
				titulo: 'Fiesta Renovada',
				descripcion: 'Un texto **nuevo** para la fiesta inventada.',
				estado: 'agotadas'
			}
		});
		expect(applied.isError, applied.content[0].text).toBe(false);
		const edited = await rawOf(s.repo, 'calendario', EVENT);
		expect(edited).not.toBe(original);
		expect(edited).toMatch(/title: Fiesta Renovada/);

		// El historial muestra la versión de Claude y a cuál vuelve deshacer.
		const h = await s.call('historial', { tipo: 'evento', objeto: EVENT });
		expect(h.isError).toBe(false);
		const [last] = h.structuredContent.versiones;
		expect(last).toMatchObject({ es_la_actual: true, origen: 'conector de Claude' });
		expect(last.quien).toBe(`Claude, confirmado por Mel (autorizó @${admin.login})`);
		expect(last.cambios).toEqual(expect.arrayContaining(['título', 'estado']));
		expect(
			h.structuredContent.versiones.some((/** @type {any} */ v) => v.deshacer_vuelve_aca)
		).toBe(true);

		const undo = await s.change({ operacion: 'deshacer', tipo: 'evento', objeto: EVENT });
		expect(undo.preview.structuredContent.resumen).toMatch(
			/Volver el evento «Fiesta Renovada» a la versión/
		);
		expect(undo.preview.structuredContent.resumen).toMatch(
			/título: Fiesta Renovada → Fiesta Inventada de Prueba/
		);
		expect(undo.applied.isError, undo.applied.content[0].text).toBe(false);
		expect(await rawOf(s.repo, 'calendario', EVENT)).toBe(original);
		await expectClaudeRevision(await objectId('evento', EVENT));

		// Deshacer el deshacer: vuelve lo editado.
		const redo = await s.change({ operacion: 'deshacer', tipo: 'evento', objeto: EVENT }, 'Juan');
		expect(redo.applied.isError, redo.applied.content[0].text).toBe(false);
		expect(await rawOf(s.repo, 'calendario', EVENT)).toBe(edited);
		await expectClaudeRevision(await objectId('evento', EVENT), 'Juan');
	});

	it('un deshacer viejo (alguien guardó en el medio) no se aplica', async () => {
		const s = await setup();
		await s.change({
			operacion: 'editar_objeto',
			tipo: 'evento',
			objeto: EVENT,
			cambios: { titulo: 'Primera' }
		});
		const preview = await s.call('vista_previa', {
			operacion: 'deshacer',
			tipo: 'evento',
			objeto: EVENT
		});
		expect(preview.isError).toBe(false);
		// Alguien guarda en el medio.
		await s.change({
			operacion: 'editar_objeto',
			tipo: 'evento',
			objeto: EVENT,
			cambios: { titulo: 'Segunda' }
		});
		const before = await rawOf(s.repo, 'calendario', EVENT);
		const r = await s.call('aplicar', {
			operacion: 'deshacer',
			tipo: 'evento',
			objeto: EVENT,
			hash: preview.structuredContent.hash,
			version: preview.structuredContent.version
		});
		expect(r.isError).toBe(true);
		expect(r.structuredContent).toMatchObject({ aplicado: false, motivo: 'cambió' });
		expect(await rawOf(s.repo, 'calendario', EVENT)).toBe(before);
	});

	it('a una versión elegida, y no hay nada que deshacer en la primera', async () => {
		const s = await setup();
		const id = await objectId('material', MATERIAL);
		const first = /** @type {any} */ (await lastRevision(id)).version;
		const original = await rawOf(s.repo, 'material', MATERIAL);
		await s.change({
			operacion: 'editar_objeto',
			tipo: 'material',
			objeto: MATERIAL,
			cambios: { titulo: 'Uno' }
		});
		await s.change({
			operacion: 'editar_objeto',
			tipo: 'material',
			objeto: MATERIAL,
			cambios: { titulo: 'Dos' }
		});
		const back = await s.change({
			operacion: 'deshacer',
			tipo: 'material',
			objeto: MATERIAL,
			a_version: first
		});
		expect(back.applied.isError, back.applied.content[0].text).toBe(false);
		expect(await rawOf(s.repo, 'material', MATERIAL)).toBe(original);
		// Un objeto sin versión anterior: nada que deshacer.
		const none = await s.call('vista_previa', {
			operacion: 'deshacer',
			tipo: 'material',
			objeto: MATERIAL,
			a_version: 9999
		});
		expect(none.isError).toBe(true);
		expect(none.content[0].text).toMatch(/No hay una versión 9999/);
	});
});

describe('a qué versión vuelve deshacer', () => {
	/** @param {Partial<import('$lib/server/contenido/revisions.js').Revision>} r */
	const rev = (r) =>
		/** @type {import('$lib/server/contenido/revisions.js').Revision} */ ({
			slug: 'x',
			title: 'X',
			data: {},
			visibility: 'public',
			deleted: false,
			savedBy: 'alguien',
			source: 'panel',
			confirmedBy: null,
			edges: [],
			...r
		});

	it('el lugar del mismo «Guardar» cuenta como parte de ese guardado; dos guardados seguidos, no', async () => {
		const { undoTarget } = await import('./historial.js');
		const older = rev({ version: 1, savedAt: 0, data: { a: 1 } });
		const text = rev({ version: 2, savedAt: 1000, data: { a: 2 } });
		const venue = rev({ version: 3, savedAt: 1500, data: { a: 2 }, source: 'lugar' });
		expect(undoTarget([venue, text, older], 3)?.version).toBe(1);
		const again = rev({ version: 3, savedAt: 1500, data: { a: 1 }, source: 'panel' });
		expect(undoTarget([again, text, older], 3)?.version).toBe(2);
		// Lo de ahora no quedó en el historial: vuelve a lo último que sí.
		expect(undoTarget([text, older], 5)?.version).toBe(2);
		expect(undoTarget([older], 1)).toBeNull();
	});
});

describe('editar todo lo que edita el panel', () => {
	it('evento: etiquetas, estado, cupo y entradas a la gorra, por el «Guardar» del panel', async () => {
		const s = await setup();
		const { preview, applied } = await s.change({
			operacion: 'editar_objeto',
			tipo: 'evento',
			objeto: EVENT,
			cambios: {
				estado: 'agotadas',
				entradas: [
					{ tipo: 'General', cupo: 50 },
					{ tipo: 'Solidaria', a_la_gorra: { minimo: 0, sugerido: 500 }, cupo: 10 }
				],
				resumen: 'Un resumen nuevo'
			}
		});
		expect(preview.structuredContent.resumen).toMatch(/cupo de «General»: 30 → 50/);
		expect(preview.structuredContent.resumen).toMatch(/entrada nueva «Solidaria»: a la gorra/);
		expect(applied.isError, applied.content[0].text).toBe(false);
		const raw = await rawOf(s.repo, 'calendario', EVENT);
		expect(raw).toMatch(/status: agotadas/);
		expect(raw).toMatch(/capacity: 50/);
		expect(raw).toMatch(/name: Solidaria/);
		expect(raw).toMatch(/summary: Un resumen nuevo/);
		await expectClaudeRevision(await objectId('evento', EVENT));
	});

	it('evento: la imagen de la biblioteca, y deshacerla devuelve la de antes', async () => {
		const s = await setup();
		const { saveObject } = await import('$lib/server/objects/save.js');
		const hash = 'c'.repeat(64);
		const image = await saveObject(
			t.db,
			{
				type: 'imagen',
				slug: hash,
				title: 'Imagen Inventada de la Fiesta',
				data: { key: `img/${hash}.webp`, mime: 'image/webp', size: 10, width: 1, height: 1 }
			},
			{ actor: 'test' }
		);
		const original = await rawOf(s.repo, 'calendario', EVENT);
		const set = await s.change({
			operacion: 'editar_objeto',
			tipo: 'evento',
			objeto: EVENT,
			cambios: { imagen: 'Imagen Inventada de la Fiesta' }
		});
		expect(set.preview.structuredContent.resumen).toMatch(
			/imagen: sin imagen → Imagen Inventada de la Fiesta/
		);
		expect(set.applied.isError, set.applied.content[0].text).toBe(false);
		const id = await objectId('evento', EVENT);
		const portada = () =>
			t.db
				.prepare(`SELECT to_id FROM edges WHERE from_id = ?1 AND kind = 'portada'`)
				.bind(id)
				.first();
		expect(/** @type {any} */ (await portada())?.to_id).toBe(image.id);
		const undo = await s.change({ operacion: 'deshacer', tipo: 'evento', objeto: EVENT });
		expect(undo.applied.isError, undo.applied.content[0].text).toBe(false);
		expect(await portada()).toBeNull();
		expect(await rawOf(s.repo, 'calendario', EVENT)).toBe(original);
	});

	it('material: título, etiquetas y personas', async () => {
		const s = await setup();
		const { applied } = await s.change({
			operacion: 'editar_objeto',
			tipo: 'material',
			objeto: 'Guía Inventada de Nudos',
			cambios: {
				titulo: 'Guía Inventada de Nudos (2.ª edición)',
				etiquetas: ['español', 'gratis', 'descargable', 'bondage', 'shibari'],
				personas: [{ nombre: 'Persona Inventada', rol: 'Autore' }]
			}
		});
		expect(applied.isError, applied.content[0].text).toBe(false);
		const raw = await rawOf(s.repo, 'material', MATERIAL);
		expect(raw).toMatch(/title: Guía Inventada de Nudos \(2\.ª edición\)/);
		expect(raw).toMatch(/- shibari/);
		const rev = await expectClaudeRevision(await objectId('material', MATERIAL));
		expect(JSON.parse(rev.edges)).toEqual(expect.any(Array));
	});

	it('perfil y lugar: por «Guardar» del editor de perfiles', async () => {
		const s = await setup();
		const { createProfileFromPanel, emptyFormValues } =
			await import('$lib/server/amigues/editor.js');
		const persona = await createProfileFromPanel(
			t.db,
			{ ...emptyFormValues('persona'), title: 'Persona Inventada Dos' },
			{ actor: 'test' }
		);
		const lugar = await createProfileFromPanel(
			t.db,
			{ ...emptyFormValues('lugar'), title: 'Salón Inventado Dos' },
			{ actor: 'test' }
		);
		if (!persona.ok || !lugar.ok) throw new Error('no se crearon los perfiles');
		const p = await s.change({
			operacion: 'editar_objeto',
			tipo: 'perfil',
			objeto: persona.profile.slug,
			cambios: { bio: 'Una bio inventada.', pronombres: 'elle', etiquetas: ['bondage'] }
		});
		expect(p.applied.isError, p.applied.content[0].text).toBe(false);
		expect(p.preview.structuredContent.resumen).toMatch(/bio: \(vacío\) → Una bio inventada\./);
		const l = await s.change({
			operacion: 'editar_objeto',
			tipo: 'lugar',
			objeto: 'Salón Inventado Dos',
			cambios: { direccion: 'Calle Inventada 456', barrio: 'Barrio Inventado' }
		});
		expect(l.applied.isError, l.applied.content[0].text).toBe(false);
		const read = await s.call('leer', { nombre: persona.profile.slug, tipo: 'perfil' });
		expect(read.structuredContent.datos).toMatchObject({
			bio: 'Una bio inventada.',
			pronouns: 'elle'
		});
		await expectClaudeRevision(persona.profile.id);
		await expectClaudeRevision(lugar.profile.id);
		// Un perfil no se edita como lugar.
		const wrong = await s.call('vista_previa', {
			operacion: 'editar_objeto',
			tipo: 'lugar',
			objeto: persona.profile.slug,
			cambios: { direccion: 'x' }
		});
		expect(wrong.isError).toBe(true);
		// Y se deshace.
		const undo = await s.change({
			operacion: 'deshacer',
			tipo: 'perfil',
			objeto: persona.profile.slug
		});
		expect(undo.applied.isError, undo.applied.content[0].text).toBe(false);
		const back = await s.call('leer', { nombre: persona.profile.slug, tipo: 'perfil' });
		expect(back.structuredContent.datos.bio).toBeUndefined();
	});

	it('etiqueta y Kinkipedia: por los guardados de Etiquetas', async () => {
		const s = await setup();
		const { importTags } = await import('$lib/server/etiquetas/importer.js');
		await importTags(
			t.db,
			{ rawTags: [{ id: 'root', children: ['Etiqueta Inventada'] }, { id: 'Etiqueta Inventada' }] },
			{ actor: 'test' }
		);
		const tag = await s.change({
			operacion: 'editar_objeto',
			tipo: 'etiqueta',
			objeto: 'Etiqueta Inventada',
			cambios: { icono: '🎭', descripcion: 'Una etiqueta inventada.' }
		});
		expect(tag.applied.isError, tag.applied.content[0].text).toBe(false);
		const id = Number(
			/** @type {any} */ (
				await t.db
					.prepare(
						`SELECT id FROM objects WHERE type = 'etiqueta' AND json_extract(data, '$.key') = ?1`
					)
					.bind('Etiqueta Inventada')
					.first()
			).id
		);
		await expectClaudeRevision(id);
		const wiki = await s.change({
			operacion: 'editar_objeto',
			tipo: 'kinkipedia',
			objeto: 'Etiqueta Inventada',
			cambios: { titulo: 'Qué es la etiqueta inventada', texto: 'Un texto de la wiki.' }
		});
		expect(wiki.applied.isError, wiki.applied.content[0].text).toBe(false);
		const row = /** @type {any} */ (
			await t.db.prepare('SELECT data FROM objects WHERE id = ?1').bind(id).first()
		);
		expect(JSON.parse(row.data)).toMatchObject({
			icon: '🎭',
			body: 'Un texto de la wiki.',
			wiki_title: 'Qué es la etiqueta inventada'
		});
		await expectClaudeRevision(id);
		// Deshacer la Kinkipedia la saca (antes no tenía entrada) y deja la etiqueta.
		const undo = await s.change({
			operacion: 'deshacer',
			tipo: 'kinkipedia',
			objeto: 'Etiqueta Inventada'
		});
		expect(undo.applied.isError, undo.applied.content[0].text).toBe(false);
		const after = JSON.parse(
			/** @type {any} */ (
				await t.db.prepare('SELECT data FROM objects WHERE id = ?1').bind(id).first()
			).data
		);
		expect(after.body ?? '').toBe('');
		expect(after.icon).toBe('🎭');
	});

	it('borradores: evento, material y perfil, sin publicar', async () => {
		const s = await setup();
		const ev = await s.change({
			operacion: 'crear_borrador',
			tipo: 'evento',
			cambios: {
				titulo: 'Taller Inventado Nuevo',
				inicio: '2031-03-05T19:00',
				fin: '2031-03-05T22:00'
			}
		});
		expect(ev.applied.isError, ev.applied.content[0].text).toBe(false);
		const slug = ev.applied.structuredContent.creado;
		expect(slug).toBeTruthy();
		const evRaw = await rawOf(s.repo, 'calendario', slug);
		expect(evRaw).toMatch(/force_unlisted: true/);
		expect(evRaw).toMatch(/borrador: true/);
		await expectClaudeRevision(await objectId('evento', slug));

		const mat = await s.change({
			operacion: 'crear_borrador',
			tipo: 'material',
			cambios: {
				titulo: 'Fanzine Inventado',
				etiquetas: ['español', 'gratis', 'fanzine'],
				personas: [{ nombre: 'KinkyVibe', rol: 'Autore' }],
				descripcion: 'Un fanzine que no existe.'
			}
		});
		expect(mat.applied.isError, mat.applied.content[0].text).toBe(false);
		expect(mat.applied.structuredContent.creado).toBe('fanzine-inventado');
		expect(await rawOf(s.repo, 'material', 'fanzine-inventado')).toMatch(/force_unlisted: true/);
		await expectClaudeRevision(await objectId('material', 'fanzine-inventado'));

		const per = await s.change({
			operacion: 'crear_borrador',
			tipo: 'lugar',
			cambios: { titulo: 'Sótano Inventado', direccion: 'Calle Falsa 123' }
		});
		expect(per.applied.isError, per.applied.content[0].text).toBe(false);
		const row = /** @type {any} */ (
			await t.db
				.prepare(`SELECT id, visibility, data FROM objects WHERE type = 'perfil' AND title = ?1`)
				.bind('Sótano Inventado')
				.first()
		);
		expect(row.visibility).toBe('hidden');
		expect(JSON.parse(row.data)).toMatchObject({ kind: 'lugar', address: 'Calle Falsa 123' });
		await expectClaudeRevision(Number(row.id));
		// Un borrador recién creado no tiene versión anterior: no se deshace.
		const none = await s.call('vista_previa', {
			operacion: 'deshacer',
			tipo: 'lugar',
			objeto: 'Sótano Inventado'
		});
		expect(none.isError).toBe(true);
		expect(none.content[0].text).toMatch(/es la primera/);
	});
});

describe('nada que mande mails o mueva plata', () => {
	it('no cancela un evento (ni con `estado`, ni con `propiedades`, ni deshaciendo)', async () => {
		const s = await setup();
		const before = await rawOf(s.repo, 'calendario', EVENT);
		for (const cambios of [{ estado: 'cancelado' }, { propiedades: { status: 'cancelado' } }]) {
			const r = await s.call('vista_previa', {
				operacion: 'editar_objeto',
				tipo: 'evento',
				objeto: EVENT,
				cambios
			});
			expect(r.isError).toBe(true);
			expect(r.content[0].text).toMatch(/Cancelar un evento no se hace|campo de `cambios`/);
		}
		// Cancelado desde el panel (no por el conector), después reabierto por Claude: deshacer
		// volvería a cancelarlo, y eso no.
		const { savePanelEvent } = await import('./editarEvento.js');
		const file = /** @type {any} */ (await s.repo.findDbPost(t.db, 'calendario', EVENT));
		const ctx = {
			db: t.db,
			user: { id: admin.id, login: admin.login },
			fetch: globalThis.fetch,
			now: Date.now(),
			platform: /** @type {App.Platform} */ (/** @type {unknown} */ ({ env: { DB: t.db } })),
			origin: 'https://ejemplo.test'
		};
		const cancelled = await savePanelEvent(ctx, {
			slug: EVENT,
			content: file.raw.replace('status: abierto', 'status: cancelado'),
			sha: file.sha,
			venue: null
		});
		expect(cancelled.ok).toBe(true);
		const reopen = await s.change({
			operacion: 'editar_objeto',
			tipo: 'evento',
			objeto: EVENT,
			cambios: { estado: 'abierto' }
		});
		expect(reopen.applied.isError, reopen.applied.content[0].text).toBe(false);
		const undo = await s.call('vista_previa', {
			operacion: 'deshacer',
			tipo: 'evento',
			objeto: EVENT
		});
		expect(undo.isError).toBe(true);
		expect(undo.content[0].text).toMatch(/Cancelar un evento no se hace desde el conector/);
		expect(await rawOf(s.repo, 'calendario', EVENT)).toMatch(/status: abierto/);
		expect(before).toMatch(/status: abierto/);
	});

	it('con gente en la lista de espera, no cambia el cupo ni el estado (sí el precio)', async () => {
		const s = await setup();
		await t.db
			.prepare(
				`INSERT INTO waitlist_entries (id, event_slug, email, status, confirmed_at, created_at, updated_at)
				VALUES (?1, ?2, 'fila@ejemplo.test', 'waiting', 1, 1, 1)`
			)
			.bind(crypto.randomUUID(), EVENT)
			.run();
		for (const cambios of [{ entradas: [{ tipo: 'General', cupo: 60 }] }, { estado: 'agotadas' }]) {
			const r = await s.call('vista_previa', {
				operacion: 'editar_objeto',
				tipo: 'evento',
				objeto: EVENT,
				cambios
			});
			expect(r.isError).toBe(true);
			expect(r.content[0].text).toMatch(/lista de espera/);
		}
		const price = await s.change({
			operacion: 'editar_objeto',
			tipo: 'evento',
			objeto: EVENT,
			cambios: { precios: [{ tipo: 'General', precio: 1500 }] }
		});
		expect(price.applied.isError, price.applied.content[0].text).toBe(false);
	});

	it('no hay operaciones de ventas, reembolsos ni mails', async () => {
		const { OPERATIONS } = await import('./edicion.js');
		expect([...OPERATIONS].sort()).toEqual(
			['crear_borrador', 'crear_codigo', 'deshacer', 'editar_evento', 'editar_objeto'].sort()
		);
	});
});
