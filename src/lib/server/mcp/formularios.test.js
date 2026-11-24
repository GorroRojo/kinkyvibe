/**
 * Formularios desde el conector de Claude (./formularios.js), de punta a punta con un D1 de
 * miniflare y las acciones de verdad del panel (Comunidad › Formularios). Datos inventados
 * (example.com):
 *
 * - solo con el interruptor `formularios` (y los del conector): apagado, ni aparecen;
 * - la vista previa no guarda nada; `aplicar` con otra huella u otra versión no guarda;
 * - un formulario nuevo nace cerrado (abrirlo es otra edición) y queda en Actividad como en el
 *   panel, a nombre de le admin;
 * - «Varias opciones» con las reglas del panel (hasta 40 opciones, sin «|»);
 * - cambiar la privacidad o las preguntas de uno con respuestas muestra el aviso;
 * - `leer` y `buscar` dan cuántas respuestas hay, nunca las respuestas ni quién respondió.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const meta = {
	title: 'Fiesta Inventada',
	start: '2099-12-01T20:00-03:00',
	status: 'abierto',
	location: 'Lugar de prueba',
	payment_methods: ['transferencia'],
	tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 10 }]
};
const EVENT = 'fiesta-inventada-2099';

vi.mock('$lib/server/tickets/events.js', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	return {
		...actual,
		isTestEventSlug: () => false,
		getEventMeta: async (/** @type {string} */ slug) => (slug === EVENT ? meta : null),
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			slug === EVENT ? parseTicketConfig(meta, opts) : null,
		listTicketedEvents: async () => [{ slug: EVENT, config: parseTicketConfig(meta, {}) }]
	};
});
vi.mock('$lib/server/eventos/index.js', () => ({
	listEvents: async () => [{ slug: EVENT, title: meta.title, start: meta.start }]
}));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { clearFlagCache } from '$lib/server/flags.js';
import { getForm, saveForm, saveResponse } from '$lib/server/formularios/store.js';
import { handleMessage } from './rpc.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const [admin] = ADMINS;

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

/** @param {string} key @param {boolean} on */
const setFlag = async (key, on) => {
	await t.db
		.prepare(
			`INSERT INTO feature_flags (key, enabled, updated_at, updated_by) VALUES (?1, ?2, 0, 'test')
			ON CONFLICT (key) DO UPDATE SET enabled = excluded.enabled`
		)
		.bind(key, on ? 1 : 0)
		.run();
	clearFlagCache();
};

beforeEach(async () => {
	await resetDB(t.db);
	await setFlag('conector_claude', true);
	await setFlag('conector_claude_edicion', true);
	await setFlag('formularios', true);
});

const ctx = (/** @type {{ canEdit?: boolean }} */ { canEdit = true } = {}) => ({
	db: t.db,
	user: { id: admin.id, login: admin.login },
	canEdit,
	fetch: globalThis.fetch,
	now: Date.now(),
	platform: /** @type {App.Platform} */ (/** @type {unknown} */ ({ env: { DB: t.db } })),
	origin: 'https://ejemplo.test'
});

let n = 0;
/** @param {string} method @param {Record<string, unknown>} params @param {{ canEdit?: boolean }} [opts] */
const rpc = async (method, params, opts) =>
	/** @type {any} */ (
		await handleMessage({ jsonrpc: '2.0', id: ++n, method, params }, /** @type {any} */ (ctx(opts)))
	).result;

/** @param {string} name @param {Record<string, unknown>} args @param {{ canEdit?: boolean }} [opts] */
const call = async (name, args, opts) =>
	/** @type {{ isError: boolean, structuredContent?: any, content: { text: string }[] }} */ (
		await rpc('tools/call', { name, arguments: args }, opts)
	);

/** Vista previa y aplicar; devuelve las dos respuestas. @param {Record<string, unknown>} args */
const change = async (args) => {
	const preview = await call('vista_previa', args);
	expect(preview.isError, preview.content[0].text).toBe(false);
	const { hash, version } = preview.structuredContent;
	const applied = await call('aplicar', { ...args, hash, version, confirmado_por: 'Mel' });
	return { preview, applied };
};

const formCount = async () =>
	Number(/** @type {any} */ (await t.db.prepare('SELECT COUNT(*) AS n FROM forms').first()).n);

/** El formulario por su dirección. @param {string} slug */
const formBySlug = async (slug) => {
	const row = /** @type {any} */ (
		await t.db.prepare('SELECT id FROM forms WHERE slug = ?1').bind(slug).first()
	);
	return row ? getForm(t.db, Number(row.id)) : null;
};

/** Las filas de Actividad (acción y quién). */
const audit = async () =>
	/** @type {{ action: string, actor_login: string, summary: string }[]} */ (
		(await t.db.prepare('SELECT action, actor_login, summary FROM admin_audit ORDER BY id').all())
			.results
	);

const QUESTIONS = [
	{ pregunta: '¿Qué te gustaría aprender?', tipo: 'texto', obligatoria: true },
	{
		pregunta: '¿Qué días podés?',
		tipo: 'varias_opciones',
		opciones: ['Lunes', 'Miércoles', 'Sábado']
	}
];

/** Crea uno por el conector y lo devuelve. */
async function createForm(extra = {}) {
	const { applied } = await change({
		operacion: 'crear_borrador',
		tipo: 'formulario',
		cambios: { nombre: 'Propuestas de taller', preguntas: QUESTIONS, ...extra }
	});
	expect(applied.isError, applied.content[0].text).toBe(false);
	return /** @type {NonNullable<Awaited<ReturnType<typeof getForm>>>} */ (
		await formBySlug(applied.structuredContent.creado)
	);
}

describe('el interruptor `formularios`', () => {
	it('apagado, los formularios no aparecen ni andan', async () => {
		await setFlag('formularios', false);
		const { tools } = await rpc('tools/list', {});
		const byName = Object.fromEntries(tools.map((/** @type {any} */ x) => [x.name, x]));
		expect(byName.buscar.inputSchema.properties.tipo.enum).not.toContain('formulario');
		expect(byName.vista_previa.inputSchema.properties.tipo.enum).not.toContain('formulario');
		expect(JSON.stringify(tools)).not.toMatch(/formulario/i);
		const init = await rpc('initialize', {});
		expect(init.instructions).not.toMatch(/formulario/);

		const preview = await call('vista_previa', {
			operacion: 'crear_borrador',
			tipo: 'formulario',
			cambios: { nombre: 'Algo' }
		});
		expect(preview.isError).toBe(true);
		expect(preview.content[0].text).toMatch(/formularios están apagados/);
		const read = await call('leer', { nombre: 'algo', tipo: 'formulario' });
		expect(read.isError).toBe(true);
		expect(await formCount()).toBe(0);
	});

	it('prendido, aparecen en buscar, leer y los cambios (y en las instrucciones)', async () => {
		const { tools } = await rpc('tools/list', {});
		const byName = Object.fromEntries(tools.map((/** @type {any} */ x) => [x.name, x]));
		for (const name of ['buscar', 'leer', 'vista_previa', 'aplicar'])
			expect(byName[name].inputSchema.properties.tipo.enum).toContain('formulario');
		expect(byName.historial.inputSchema.properties.tipo.enum).not.toContain('formulario');
		expect(byName.vista_previa.inputSchema.properties.cambios.description).toMatch(
			/varias_opciones/
		);
		expect((await rpc('initialize', {})).instructions).toMatch(/tipo: formulario/);
	});

	it('sin los cambios del conector (o con una conexión de solo lectura), no se crea nada', async () => {
		const args = {
			operacion: 'crear_borrador',
			tipo: 'formulario',
			cambios: { nombre: 'Algo' }
		};
		const readOnly = await call('vista_previa', args, { canEdit: false });
		expect(readOnly.isError).toBe(true);
		expect(readOnly.content[0].text).toMatch(/solo tiene permiso de lectura/);
		await setFlag('conector_claude_edicion', false);
		const { tools } = await rpc('tools/list', {});
		expect(tools.map((/** @type {any} */ x) => x.name)).not.toContain('vista_previa');
		expect((await call('vista_previa', args)).isError).toBe(true);
		expect(await formCount()).toBe(0);
	});
});

describe('crear', () => {
	it('la vista previa no guarda nada; aplicar lo crea cerrado, por el panel y en Actividad', async () => {
		const args = {
			operacion: 'crear_borrador',
			tipo: 'formulario',
			cambios: {
				nombre: 'Propuestas de taller',
				texto: 'Contanos qué querés dar.',
				quien_responde: 'entrada',
				evento: 'Fiesta Inventada',
				privacidad: 'que_elija',
				quien_ve: 'organizadores',
				preguntas: QUESTIONS
			}
		};
		const preview = await call('vista_previa', args);
		expect(preview.isError, preview.content[0].text).toBe(false);
		expect(preview.structuredContent.version).toBe('nuevo');
		expect(preview.structuredContent.resumen).toMatch(/nace cerrado/);
		expect(await formCount()).toBe(0);
		expect((await audit()).map((a) => a.action)).toEqual(['conector.vista_previa']);

		const { hash, version } = preview.structuredContent;
		const applied = await call('aplicar', { ...args, hash, version });
		expect(applied.isError, applied.content[0].text).toBe(false);
		expect(applied.structuredContent.creado).toBe('propuestas-de-taller');
		const form = await formBySlug('propuestas-de-taller');
		expect(form).toMatchObject({
			kind: 'form',
			title: 'Propuestas de taller',
			intro: 'Contanos qué querés dar.',
			access: 'ticket',
			eventSlug: EVENT,
			privacy: 'choose',
			audience: 'organizers',
			open: false
		});
		expect(form?.questions.map((q) => [q.kind, q.label, q.required])).toEqual([
			['text', '¿Qué te gustaría aprender?', true],
			['multi', '¿Qué días podés?', false]
		]);
		const rows = await audit();
		expect(rows.map((a) => a.action)).toEqual([
			'conector.vista_previa',
			'form.create',
			'form.save',
			'conector.aplicar'
		]);
		expect(rows.every((a) => a.actor_login === admin.login)).toBe(true);
		expect(rows.at(-1)?.summary).toMatch(/creó el formulario «Propuestas de taller» \(cerrado\)/);
	});

	it('nace cerrado: `abierto: true` al crear no se acepta', async () => {
		const r = await call('vista_previa', {
			operacion: 'crear_borrador',
			tipo: 'formulario',
			cambios: { nombre: 'Algo', abierto: true, preguntas: QUESTIONS }
		});
		expect(r.isError).toBe(true);
		expect(r.content[0].text).toMatch(/nace cerrado/);
	});

	it('las reglas del panel: el nombre, la dirección usada, el evento', async () => {
		const prev = (/** @type {Record<string, unknown>} */ cambios) =>
			call('vista_previa', { operacion: 'crear_borrador', tipo: 'formulario', cambios });
		expect((await prev({ nombre: 'A' })).content[0].text).toMatch(/nombre/);
		expect((await prev({ nombre: 'Algo', quien_responde: 'entrada' })).content[0].text).toMatch(
			/Elegí el evento/
		);
		await createForm();
		const taken = await prev({ nombre: 'Otro', direccion: 'propuestas-de-taller' });
		expect(taken.content[0].text).toMatch(/ya la usa otro formulario/);
	});
});

describe('«Varias opciones»', () => {
	const prev = (/** @type {unknown[]} */ opciones) =>
		call('vista_previa', {
			operacion: 'crear_borrador',
			tipo: 'formulario',
			cambios: {
				nombre: 'Muchas opciones',
				preguntas: [{ pregunta: '¿Cuáles?', tipo: 'varias_opciones', opciones }]
			}
		});
	const options = (/** @type {number} */ k) => Array.from({ length: k }, (_, i) => `Opción ${i}`);

	it('hasta 40 opciones', async () => {
		expect((await prev(options(40))).isError).toBe(false);
		const over = await prev(options(41));
		expect(over.isError).toBe(true);
		expect(over.content[0].text).toMatch(/Hasta 40 opciones/);
	});

	it('ninguna con «|»', async () => {
		const r = await prev(['Una | otra', 'Tercera']);
		expect(r.isError).toBe(true);
		expect(r.content[0].text).toMatch(/«\|»/);
	});
});

describe('editar', () => {
	it('abrirlo es una edición; aplicar con otra huella o versión no guarda', async () => {
		const form = await createForm();
		const args = {
			operacion: 'editar_objeto',
			tipo: 'formulario',
			objeto: 'Propuestas de taller',
			cambios: { abierto: true }
		};
		const preview = await call('vista_previa', args);
		expect(preview.isError, preview.content[0].text).toBe(false);
		expect(preview.structuredContent.version).toBe(String(form.updatedAt));
		expect((await getForm(t.db, form.id))?.open).toBe(false);

		const wrongHash = await call('aplicar', {
			...args,
			hash: 'A'.repeat(43),
			version: preview.structuredContent.version
		});
		expect(wrongHash.isError).toBe(true);
		expect(wrongHash.structuredContent.motivo).toBe('no coincide');
		const wrongVersion = await call('aplicar', {
			...args,
			hash: preview.structuredContent.hash,
			version: '1'
		});
		expect(wrongVersion.structuredContent.motivo).toBe('cambió');
		const otherInputs = await call('aplicar', {
			...args,
			cambios: { abierto: true, nombre: 'Otro nombre' },
			hash: preview.structuredContent.hash,
			version: preview.structuredContent.version
		});
		expect(otherInputs.structuredContent.motivo).toBe('no coincide');
		expect((await getForm(t.db, form.id))?.open).toBe(false);

		const applied = await call('aplicar', {
			...args,
			hash: preview.structuredContent.hash,
			version: preview.structuredContent.version
		});
		expect(applied.isError, applied.content[0].text).toBe(false);
		expect((await getForm(t.db, form.id))?.open).toBe(true);
		expect((await audit()).map((a) => a.action)).toContain('form.open');
	});

	it('si alguien guardó en el medio, no se aplica', async () => {
		const form = await createForm();
		const args = {
			operacion: 'editar_objeto',
			tipo: 'formulario',
			objeto: 'propuestas-de-taller',
			cambios: { nombre: 'Propuestas de taller 2027' }
		};
		const preview = await call('vista_previa', args);
		const { hash, version } = preview.structuredContent;
		await saveForm(
			t.db,
			form.id,
			{ ...form, intro: 'Cambió en el panel.' },
			{ by: 'otre', now: form.updatedAt + 1000 }
		);
		const r = await call('aplicar', { ...args, hash, version });
		expect(r.structuredContent.motivo).toBe('cambió');
		expect((await getForm(t.db, form.id))?.title).toBe('Propuestas de taller');
	});

	it('con respuestas, cambiar la privacidad o las preguntas avisa como el panel', async () => {
		const form = await createForm();
		await saveResponse(t.db, {
			formId: form.id,
			answers: [{ id: form.questions[0].id, label: 'x', value: 'Respuesta inventada' }],
			identity: { name: 'Persona Inventada', email: 'persona@example.com' }
		});
		const { preview, applied } = await change({
			operacion: 'editar_objeto',
			tipo: 'formulario',
			objeto: 'propuestas-de-taller',
			cambios: {
				privacidad: 'anonimo',
				preguntas: [
					{
						id: form.questions[1].id,
						pregunta: '¿Qué días podés?',
						tipo: 'varias_opciones',
						opciones: ['Lunes', 'Viernes']
					},
					{ pregunta: '¿Qué te gustaría aprender?', tipo: 'texto', obligatoria: true }
				]
			}
		});
		const avisos = preview.structuredContent.avisos.join('\n');
		expect(avisos).toMatch(/se van a ver sin nombre/);
		expect(avisos).toMatch(/Ya llegó 1 respuesta/);
		expect(preview.structuredContent.resumen).toMatch(/orden de las preguntas/);
		expect(applied.isError, applied.content[0].text).toBe(false);
		const after = await getForm(t.db, form.id);
		expect(after?.privacy).toBe('anonymous');
		// Sin `id`, la pregunta con el mismo texto conserva el suyo.
		expect(after?.questions.map((q) => q.id)).toEqual([form.questions[1].id, form.questions[0].id]);
		expect(after?.questions[0].options).toEqual(['Lunes', 'Viernes']);
	});

	it('no se deshace ni tiene historial', async () => {
		await createForm();
		const r = await call('vista_previa', {
			operacion: 'deshacer',
			tipo: 'formulario',
			objeto: 'propuestas-de-taller'
		});
		expect(r.isError).toBe(true);
		expect(r.content[0].text).toMatch(/no tienen historial/);
	});
});

describe('leer y buscar', () => {
	it('dan cuántas respuestas hay, nunca las respuestas ni quién respondió', async () => {
		const form = await createForm({ quien_responde: 'link' });
		for (const [name, email] of [
			['Persona Uno', 'uno@example.com'],
			['Persona Dos', 'dos@example.com']
		]) {
			await saveResponse(t.db, {
				formId: form.id,
				answers: [{ id: form.questions[0].id, label: 'x', value: `Texto secreto de ${name}` }],
				identity: { name, email }
			});
		}
		const read = await call('leer', { nombre: 'Propuestas de taller', tipo: 'formulario' });
		expect(read.isError, read.content[0].text).toBe(false);
		expect(read.structuredContent).toMatchObject({
			tipo: 'formulario',
			slug: 'propuestas-de-taller',
			abierto: false,
			cantidad_de_respuestas: 2,
			url_publica: 'https://ejemplo.test/formularios/propuestas-de-taller'
		});
		expect(read.structuredContent.preguntas[1]).toMatchObject({
			tipo: 'varias_opciones',
			opciones: ['Lunes', 'Miércoles', 'Sábado']
		});
		const found = await call('buscar', { texto: 'taller' });
		expect(found.structuredContent.resultados).toEqual([
			expect.objectContaining({ tipo: 'formulario', cantidad_de_respuestas: 2 })
		]);
		for (const text of [read.content[0].text, found.content[0].text]) {
			expect(text).not.toMatch(/example\.com|Persona|secreto/);
		}
	});
});
