/**
 * Los cambios del conector de Claude de punta a punta (./edicion.js), con eventos inventados en un
 * D1 de miniflare y el guardado de verdad del panel (la acción «Guardar» de la pestaña Editar y
 * «Crear» de Ventas → Códigos):
 *
 * - sin «Conector de Claude: cambios», las herramientas ni aparecen (y llamarlas falla);
 * - vista previa → aplicar guarda exactamente lo que se vio, con «Claude, confirmado por …» en el
 *   historial y en Actividad;
 * - una vista previa vieja (alguien guardó en el medio) no se aplica;
 * - entradas distintas o una huella tocada no se aplican;
 * - el tope por día corta, y un cambio que no se guarda no cuenta;
 * - crear un código pasa por la validación del panel.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { fixtureFiles } from '$lib/server/contenido/testing.js';
import { runImport } from '$lib/server/contenido/importer.js';
import { ADMINS } from '$lib/server/auth';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const SLUG = 'fiesta-inventada-2031-01';
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
	await runImport(
		t.db,
		'calendario',
		fixtureFiles('calendario').filter(
			(f) => !['sin-importar-2031-07', 'roto-2031-06'].includes(f.legacySlug)
		),
		{ actor: 'importacion', now: Date.now() }
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
async function setup({ edit = true } = {}) {
	vi.resetModules();
	const repo = await import('$lib/server/contenido/repo.js');
	repo.setContentDB(t.db);
	await setFlag('conector_claude', true);
	await setFlag('conector_claude_edicion', edit);
	const flags = await import('$lib/server/flags.js');
	flags.clearFlagCache();
	const rpc = await import('./rpc.js');
	const revisions = await import('$lib/server/contenido/revisions.js');
	const ctx = {
		db: t.db,
		user: { id: admin.id, login: admin.login },
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
	const list = async () =>
		/** @type {any} */ (
			await rpc.handleMessage({ jsonrpc: '2.0', id: ++n, method: 'tools/list' }, ctx)
		).result.tools.map((/** @type {{ name: string }} */ x) => x.name);
	return { repo, rpc, revisions, call, list };
}

/** @param {string} slug */
const eventRow = async (slug) =>
	/** @type {any} */ (
		await t.db
			.prepare(
				`SELECT o.id, o.title, o.version, o.data FROM objects o
				LEFT JOIN content_sources s ON s.object_id = o.id
				WHERE o.type = 'evento' AND (s.legacy_slug = ?1 OR o.slug = ?1)`
			)
			.bind(slug)
			.first()
	);

const change = {
	operacion: 'editar_evento',
	evento: SLUG,
	cambios: { titulo: 'Fiesta Inventada Renovada', precios: [{ tipo: 'General', precio: 1200 }] }
};

describe('los interruptores', () => {
	it('sin «cambios» prendido, solo están las de lectura y vista_previa no anda', async () => {
		const s = await setup({ edit: false });
		const names = await s.list();
		expect(names).toContain('leer');
		expect(names).not.toContain('vista_previa');
		expect(names).not.toContain('aplicar');
		const r = await s.call('vista_previa', change);
		expect(r.isError).toBe(true);
	});

	it('con los dos prendidos, aparecen con sus anotaciones', async () => {
		const s = await setup();
		const tools = /** @type {any} */ (
			await s.rpc.handleMessage(
				{ jsonrpc: '2.0', id: 1, method: 'tools/list' },
				/** @type {any} */ ({ db: t.db })
			)
		).result.tools;
		const aplicar = tools.find((/** @type {any} */ x) => x.name === 'aplicar');
		const vista = tools.find((/** @type {any} */ x) => x.name === 'vista_previa');
		expect(aplicar.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
		expect(vista.annotations).toMatchObject({ readOnlyHint: true });
	});
});

describe('vista previa y aplicar', () => {
	it('guarda lo que se vio, por el guardado del panel, con «confirmado por» en el historial', async () => {
		const s = await setup();
		const before = await eventRow(SLUG);
		const p = await s.call('vista_previa', change);
		expect(p.isError).toBe(false);
		const prev = p.structuredContent;
		expect(prev.resumen).toContain('Cambiar en «Fiesta Inventada de Prueba»');
		expect(prev.resumen).toContain(
			'título: Fiesta Inventada de Prueba → Fiesta Inventada Renovada'
		);
		expect(prev.resumen).toMatch(/precio de «General»: \$\s?1\.000 → \$\s?1\.200/);
		expect(prev.hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
		// La vista previa no guarda nada.
		expect((await eventRow(SLUG)).version).toBe(before.version);

		const a = await s.call('aplicar', {
			...change,
			hash: prev.hash,
			version: prev.version,
			confirmado_por: 'Mel',
			pedido: 'subí la general a 1200 y cambiá el nombre'
		});
		expect(a.isError).toBe(false);
		expect(a.structuredContent.aplicado).toBe(true);

		const after = await eventRow(SLUG);
		expect(after.version).toBe(before.version + 1);
		expect(after.title).toBe('Fiesta Inventada Renovada');
		expect(JSON.parse(after.data).extra.tickets[0].price).toBe(1200);

		const [rev] = await s.revisions.listRevisions(t.db, after.id, { limit: 1 });
		expect(rev).toMatchObject({ source: 'claude', confirmedBy: 'Mel', savedBy: admin.login });
		expect(s.revisions.revisionAuthorLabel(rev)).toBe('Claude, confirmado por Mel');
		expect(s.revisions.revisionAuthorLabel(rev, { withAdmin: true })).toBe(
			`Claude, confirmado por Mel (autorizó @${admin.login})`
		);

		const audit = await t.db
			.prepare(
				`SELECT actor_login, summary, detail FROM admin_audit WHERE action = 'conector.aplicar'`
			)
			.all();
		expect(audit.results).toHaveLength(1);
		expect(audit.results[0].actor_login).toBe(admin.login);
		expect(audit.results[0].summary).toMatch(/^Claude, confirmado por Mel: editó el evento/);
		// El pedido no queda en Actividad (solo su largo).
		expect(String(audit.results[0].detail)).not.toContain('subí la general');
	});

	it('sin «confirmado por», el historial dice solo «Claude»', async () => {
		const s = await setup();
		const prev = (await s.call('vista_previa', change)).structuredContent;
		const a = await s.call('aplicar', { ...change, hash: prev.hash, version: prev.version });
		expect(a.structuredContent.aplicado).toBe(true);
		const [rev] = await s.revisions.listRevisions(t.db, (await eventRow(SLUG)).id, { limit: 1 });
		expect(rev.confirmedBy).toBeNull();
		expect(s.revisions.revisionAuthorLabel(rev)).toBe('Claude');
		// Los guardados de siempre se siguen mostrando igual.
		expect(s.revisions.revisionAuthorLabel({ savedBy: 'alguien', source: 'panel' })).toBe(
			'@alguien'
		);
	});

	it('una vista previa vieja no se aplica (alguien guardó en el medio)', async () => {
		const s = await setup();
		const prev = (await s.call('vista_previa', change)).structuredContent;
		// Otro cambio en el medio (por ejemplo desde el panel, o por el mismo conector).
		const other = {
			operacion: 'editar_evento',
			evento: SLUG,
			cambios: { visibilidad: 'no_listado' }
		};
		const p2 = (await s.call('vista_previa', other)).structuredContent;
		expect(
			(await s.call('aplicar', { ...other, hash: p2.hash, version: p2.version })).isError
		).toBe(false);
		const version = (await eventRow(SLUG)).version;

		const a = await s.call('aplicar', { ...change, hash: prev.hash, version: prev.version });
		expect(a.isError).toBe(true);
		expect(a.structuredContent).toMatchObject({ aplicado: false, motivo: 'cambió' });
		expect((await eventRow(SLUG)).version).toBe(version);
	});

	it('entradas distintas de la vista previa o una huella tocada no se aplican', async () => {
		const s = await setup();
		const before = (await eventRow(SLUG)).version;
		const prev = (await s.call('vista_previa', change)).structuredContent;
		const otherPrice = {
			...change,
			cambios: { ...change.cambios, precios: [{ tipo: 'General', precio: 1 }] }
		};
		const a = await s.call('aplicar', { ...otherPrice, hash: prev.hash, version: prev.version });
		expect(a.structuredContent).toMatchObject({ aplicado: false, motivo: 'no coincide' });
		const flipped = (prev.hash[0] === 'A' ? 'B' : 'A') + prev.hash.slice(1);
		const b = await s.call('aplicar', { ...change, hash: flipped, version: prev.version });
		expect(b.structuredContent).toMatchObject({ aplicado: false, motivo: 'no coincide' });
		expect((await eventRow(SLUG)).version).toBe(before);
		// Todo queda en Actividad.
		const refused = await t.db
			.prepare(`SELECT count(*) AS n FROM admin_audit WHERE action = 'conector.aplicar'`)
			.first();
		expect(Number(refused?.n)).toBe(2);
	});

	it('el tope por día corta con un mensaje claro y no guarda nada', async () => {
		const s = await setup();
		const { DAILY_BUCKET } = await import('./cambios.js');
		// 50 cambios ya aplicados en esta hora.
		const slot = Math.floor(Date.now() / 1000 / 3600) * 3600;
		await t.db
			.prepare('INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?1, ?2, 50)')
			.bind(DAILY_BUCKET, slot)
			.run();
		const before = (await eventRow(SLUG)).version;
		const prev = (await s.call('vista_previa', change)).structuredContent;
		const a = await s.call('aplicar', { ...change, hash: prev.hash, version: prev.version });
		expect(a.isError).toBe(true);
		expect(a.structuredContent.motivo).toBe('tope por día');
		expect(a.structuredContent.mensaje).toMatch(/tope de 50 cambios por día/);
		expect((await eventRow(SLUG)).version).toBe(before);
	});

	it('valida con las reglas del panel antes de mostrar nada', async () => {
		const s = await setup();
		const bad = await s.call('vista_previa', {
			operacion: 'editar_evento',
			evento: SLUG,
			cambios: { inicio: '2031-01-10T22:00', fin: '2031-01-09T10:00' }
		});
		expect(bad.isError).toBe(true);
		expect(bad.content[0].text).toMatch(/Fecha y hora/);
		const unknown = await s.call('vista_previa', {
			operacion: 'editar_evento',
			evento: SLUG,
			cambios: { cupo: 10 }
		});
		expect(unknown.isError).toBe(true);
		const tipo = await s.call('vista_previa', {
			operacion: 'editar_evento',
			evento: SLUG,
			cambios: { precios: [{ tipo: 'VIP', precio: 10 }] }
		});
		expect(tipo.content[0].text).toMatch(/No hay un tipo de entrada «VIP»/);
	});

	it('mover el inicio mueve el fin igual (y lo muestra)', async () => {
		const s = await setup();
		const p = await s.call('vista_previa', {
			operacion: 'editar_evento',
			evento: SLUG,
			cambios: { inicio: '2031-01-17T22:00' }
		});
		expect(p.isError).toBe(false);
		expect(p.structuredContent.resumen).toMatch(
			/viernes 17 de enero de 2031, de 22:00 a 04:00 \(del sábado 18/
		);
	});
});

describe('crear un código', () => {
	it('vista previa y aplicar, por el alta del panel', async () => {
		const s = await setup();
		const args = {
			operacion: 'crear_codigo',
			evento: SLUG,
			cambios: { codigo: 'amigues10', tipo: 'porcentaje', valor: 10, usos_maximos: 20 }
		};
		const p = await s.call('vista_previa', args);
		expect(p.isError).toBe(false);
		expect(p.structuredContent.resumen).toContain('Crear el código de descuento AMIGUES10');
		const a = await s.call('aplicar', {
			...args,
			hash: p.structuredContent.hash,
			version: p.structuredContent.version,
			confirmado_por: 'Pau'
		});
		expect(a.structuredContent.aplicado).toBe(true);
		const row = /** @type {any} */ (
			await t.db.prepare(`SELECT * FROM discount_codes WHERE code = 'AMIGUES10'`).first()
		);
		expect(row).toMatchObject({
			kind: 'percent',
			value: 10,
			max_uses: 20,
			created_by: admin.login
		});
		// Una segunda vez ya no se puede: ya existe.
		const again = await s.call('vista_previa', args);
		expect(again.content[0].text).toMatch(/Ya existe un código AMIGUES10/);
	});

	it('con la validación del formulario del panel', async () => {
		const s = await setup();
		const r = await s.call('vista_previa', {
			operacion: 'crear_codigo',
			cambios: { codigo: 'X', tipo: 'porcentaje', valor: 150 }
		});
		expect(r.isError).toBe(true);
		expect(r.content[0].text).toMatch(/codigo: Entre 3 y 32/);
		expect(r.content[0].text).toMatch(/valor: Un número entero entre 1 y 100/);
	});
});
