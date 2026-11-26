/**
 * `confirmar_transferencia` del conector de Claude (./confirmarTransferencia.js), de punta a punta
 * por el protocolo (./rpc.js) con un D1 de miniflare, y «Confirmar pago» del panel por la misma
 * función (`confirmTransferPayment`):
 *
 * - vista previa (sin guardar nada: referencia, quién compró, monto exacto a transferir y
 *   vencimiento) y aplicar (aprueba, emite las entradas, un mail);
 * - una ya confirmada da «ya estaba» y no manda nada, también con dos `aplicar` a la vez;
 * - vencida con lugar se confirma; sin lugar, o con el evento cancelado, el conector no pasa el
 *   límite y manda al panel;
 * - una de Mercado Pago no se confirma;
 * - huella o versión equivocadas no se aplican;
 * - sin los cambios prendidos (o con una conexión de solo lectura) no se puede;
 * - `ventas` muestra el monto a transferir y el vencimiento de cada transferencia pendiente.
 *
 * Eventos, personas y pagos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
	capacity: /** @type {number | null} */ (3),
	mails: /** @type {string[]} */ ([]),
	notices: /** @type {string[]} */ ([])
}));

vi.mock('$lib/server/tickets/events.js', async (importOriginal) => ({
	.../** @type {any} */ (await importOriginal()),
	isTestEventSlug: () => false,
	getEventTickets: async (/** @type {string} */ slug) =>
		slug === 'fiesta-inventada' || slug === 'fiesta-cancelada'
			? {
					title: slug === 'fiesta-inventada' ? 'Fiesta Inventada' : 'Fiesta Cancelada',
					start: '2031-01-10T21:00:00-03:00',
					status: slug === 'fiesta-cancelada' ? 'cancelado' : 'abierto',
					types: [
						{ id: 'general', name: 'General', price: 5000, capacity: fake.capacity, gorra: null }
					]
				}
			: null
}));
vi.mock('$lib/server/eventos/index.js', () => ({
	listEvents: async () => [
		{ slug: 'fiesta-inventada', title: 'Fiesta Inventada', start: '2031-01-10T21:00:00-03:00' },
		{ slug: 'fiesta-cancelada', title: 'Fiesta Cancelada', start: '2031-01-11T21:00:00-03:00' }
	]
}));
vi.mock('$lib/server/tickets/fondo.js', () => ({
	resolveFondoPercent: async () => ({ percent: 20 })
}));
// El mail de las entradas y el aviso por Telegram: se cuentan (Resend y Telegram, en otro lado).
vi.mock('$lib/server/tickets/index.js', async (importOriginal) => ({
	.../** @type {any} */ (await importOriginal()),
	sendOrderEmail: async (/** @type {any} */ input) => {
		fake.mails.push(input.order.id);
		return true;
	}
}));
vi.mock('$lib/server/telegram/adminNotify.js', async (importOriginal) => ({
	.../** @type {any} */ (await importOriginal()),
	queueOrderNotice: async (/** @type {any} */ input) => {
		fake.notices.push(input.order.id);
	}
}));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { eventTicketActions } from '$lib/server/admin/eventActions.js';
import { clearFlagCache } from '$lib/server/flags.js';
import { getOrder, getOrderTickets, reserveOrder } from '$lib/server/tickets/orders.js';
import { orderReference } from '$lib/utils/tickets.js';
import { handleMessage } from './rpc.js';
import { ALREADY_REASON, LIMIT_REASON } from './confirmarTransferencia.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const SLUG = 'fiesta-inventada';
const HOLD_MS = 48 * 60 * 60 * 1000;
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
	fake.capacity = 3;
	fake.mails = [];
	fake.notices = [];
	await setFlags({ edit: true });
});

/** @param {{ edit: boolean }} o */
async function setFlags({ edit }) {
	for (const [key, on] of /** @type {const} */ ([
		['conector_claude', true],
		['conector_claude_edicion', edit]
	])) {
		await t.db
			.prepare(
				`INSERT INTO feature_flags (key, enabled, updated_at, updated_by) VALUES (?1, ?2, 0, 'test')
				ON CONFLICT (key) DO UPDATE SET enabled = excluded.enabled`
			)
			.bind(key, on ? 1 : 0)
			.run();
	}
	clearFlagCache();
}

let n = 0;
/** @param {string} name @param {Record<string, unknown>} args @param {{ canEdit?: boolean }} [o] */
async function call(name, args, { canEdit = true } = {}) {
	const r = /** @type {any} */ (
		await handleMessage(
			{ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } },
			{
				db: t.db,
				user: { id: admin.id, login: admin.login },
				canEdit,
				fetch: /** @type {typeof fetch} */ (async () => new Response('{}', { status: 503 })),
				now: Date.now(),
				platform: t.platform,
				origin: 'https://ejemplo.test'
			}
		)
	);
	return /** @type {{ isError: boolean, structuredContent?: any, content: { text: string }[] }} */ (
		r.result
	);
}

/**
 * Una reserva inventada.
 * @param {{ slug?: string, method?: string, quantity?: number, now?: number }} [o]
 */
async function reserve({
	slug = SLUG,
	method = 'transferencia',
	quantity = 1,
	now = Date.now()
} = {}) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: slug,
			type: { id: 'general', price: 5000, capacity: 3 },
			quantity,
			holders: Array.from({ length: quantity }, (_, i) => ({
				name: `Persona Inventada ${i + 1}`,
				pronouns: 'elle'
			})),
			buyer: { name: 'Persona Inventada 1', email: `p${++n}@example.com`, dni: '30111222' },
			method: /** @type {any} */ (method),
			holdMs: HOLD_MS,
			now
		})
	);
	expect(r.ok).toBe(true);
	return /** @type {import('$lib/server/tickets/orders.js').Order} */ (r.order);
}

/** @param {string} id */
const approve = (id) =>
	t.db.prepare("UPDATE orders SET status = 'approved' WHERE id = ?").bind(id).run();

/** Vista previa y aplicar de una orden. @param {string} orden @param {string} [evento] */
async function preview(orden, evento = SLUG) {
	return call('vista_previa', { operacion: 'confirmar_transferencia', evento, orden });
}

/**
 * @param {string} orden
 * @param {{ hash: string, version: string }} p
 * @param {string} [evento]
 */
async function apply(orden, p, evento = SLUG) {
	return call('aplicar', {
		operacion: 'confirmar_transferencia',
		evento,
		orden,
		hash: p.hash,
		version: p.version,
		confirmado_por: 'Mel',
		pedido: 'Llegó el comprobante de la transferencia'
	});
}

describe('vista previa y aplicar', () => {
	it('la vista previa muestra todo sin guardar; aplicar confirma, emite y manda un mail', async () => {
		const o = await reserve({ quantity: 2 });
		// Un extra inventado: el monto a transferir es el de las entradas más los extras.
		await t.db.prepare('UPDATE orders SET extras_amount = 1500 WHERE id = ?').bind(o.id).run();
		const ref = orderReference(o.id);
		const p = await preview(ref);
		expect(p.isError).toBe(false);
		const r = p.structuredContent;
		expect(r).toMatchObject({
			operacion: 'confirmar_transferencia',
			titulo: ref,
			avisos: [],
			enlaces: { panel: `/admin/eventos/${SLUG}/ordenes` },
			transferencia: {
				referencia: ref,
				nombre: 'Persona Inventada 1',
				tipo: 'General',
				cantidad: 2,
				monto_a_transferir: o.total + 1500,
				vence: new Date(o.expires_at).toISOString(),
				vencida: false,
				se_puede_confirmar: true
			}
		});
		expect(r.resumen).toContain(
			`Confirmar el pago de la transferencia ${ref} de «Fiesta Inventada»:`
		);
		expect(r.hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect((await getOrder(t.db, o.id))?.status).toBe('awaiting_transfer');
		expect(fake.mails).toEqual([]);

		const a = await apply(ref, r);
		expect(a.isError).toBe(false);
		expect(a.structuredContent).toMatchObject({ aplicado: true, confirmado_por: 'Mel' });
		const fresh = await getOrder(t.db, o.id);
		expect(fresh?.status).toBe('approved');
		expect(fresh?.confirmed_by).toBe(`Claude, confirmado por Mel (@${admin.login})`);
		expect(await getOrderTickets(t.db, o.id)).toHaveLength(2);
		expect(fake.mails).toEqual([o.id]);
		expect(fake.notices).toEqual([o.id]);

		// Actividad: la confirmación (con el origen, quién confirmó y el largo del pedido) y la del
		// conector, sin datos de quien compró.
		const audit = await listAudit(t.db);
		const confirm = audit.find((e) => e.action === 'transfer.confirm');
		expect(confirm).toMatchObject({ actorLogin: admin.login, targetId: o.id });
		expect(confirm?.summary).toBe(
			`Confirmó la transferencia ${ref} (2 entradas) desde el conector (Claude, confirmado por Mel)`
		);
		expect(confirm?.detail).toMatchObject({
			origen: 'conector',
			confirmado_por: 'Mel',
			pedido_largo: 'Llegó el comprobante de la transferencia'.length
		});
		const connector = audit.filter((e) => e.action.startsWith('conector.'));
		expect(connector.map((e) => e.summary)).toContain(
			`Claude, confirmado por Mel: confirmó la transferencia ${ref} de «Fiesta Inventada»`
		);
		for (const e of connector) expect(JSON.stringify(e)).not.toContain('Persona Inventada');
	});

	it('acepta el id completo de la orden y la referencia sin «KV-»', async () => {
		const o = await reserve();
		const byId = await preview(o.id);
		const short = await preview(o.id.slice(0, 8));
		expect(byId.structuredContent.titulo).toBe(orderReference(o.id));
		expect(short.structuredContent.hash).toBe(byId.structuredContent.hash);
	});

	it('una orden que no es de ese evento no se encuentra', async () => {
		const o = await reserve({ slug: 'fiesta-cancelada' });
		const p = await preview(orderReference(o.id));
		expect(p.isError).toBe(true);
		expect(p.content[0].text).toMatch(/No encontré la orden/);
	});
});

describe('ya confirmada y el mail una sola vez', () => {
	it('un aplicar repetido contesta «ya estaba» y no manda nada', async () => {
		const o = await reserve();
		const ref = orderReference(o.id);
		const p = (await preview(ref)).structuredContent;
		expect((await apply(ref, p)).structuredContent.aplicado).toBe(true);
		const again = await apply(ref, p);
		expect(again.isError).toBe(false);
		expect(again.structuredContent).toMatchObject({ aplicado: false, motivo: ALREADY_REASON });
		expect(fake.mails).toEqual([o.id]);
		// Y la vista previa de una ya confirmada dice que no hay nada para confirmar.
		const late = await preview(ref);
		expect(late.isError).toBe(true);
		expect(late.content[0].text).toMatch(/ya estaba confirmada/);
	});

	it('dos aplicar a la vez: se confirma una vez y sale un solo mail', async () => {
		const o = await reserve({ quantity: 2 });
		const ref = orderReference(o.id);
		const p = (await preview(ref)).structuredContent;
		const both = await Promise.all([apply(ref, p), apply(ref, p)]);
		expect(both.map((r) => r.structuredContent.aplicado).sort()).toEqual([false, true]);
		expect(both.find((r) => !r.structuredContent.aplicado)?.structuredContent.motivo).toBe(
			ALREADY_REASON
		);
		expect(fake.mails).toEqual([o.id]);
		expect(await getOrderTickets(t.db, o.id)).toHaveLength(2);
		const confirms = (await listAudit(t.db)).filter((e) => e.action === 'transfer.confirm');
		expect(confirms).toHaveLength(1);
	});
});

describe('vencidas, límites y lo que no se confirma', () => {
	it('vencida con lugar: avisa que venció y se confirma', async () => {
		const o = await reserve({ now: Date.now() - HOLD_MS - 60_000 });
		const ref = orderReference(o.id);
		const p = (await preview(ref)).structuredContent;
		expect(p.transferencia).toMatchObject({ vencida: true, se_puede_confirmar: true });
		expect(p.avisos).toEqual([
			expect.stringMatching(
				/^La reserva venció el .+, pero todavía hay lugar: se puede confirmar\.$/
			)
		]);
		const a = await apply(ref, p);
		expect(a.structuredContent.aplicado).toBe(true);
		expect((await getOrder(t.db, o.id))?.status).toBe('approved');
		expect(fake.mails).toEqual([o.id]);
	});

	it('vencida sin lugar: los límites vuelven como avisos y aplicar no los pasa', async () => {
		const late = await reserve({ quantity: 2, now: Date.now() - HOLD_MS - 60_000 });
		await approve((await reserve({ method: 'mercadopago', quantity: 3 })).id);
		const ref = orderReference(late.id);
		const p = (await preview(ref)).structuredContent;
		expect(p.transferencia.se_puede_confirmar).toBe(false);
		expect(p.avisos[0]).toContain('El cupo de «General» ya está completo (3 / 3)');
		expect(p.avisos.at(-1)).toMatch(/el conector nunca pasa límites/);
		const a = await apply(ref, p);
		expect(a.isError).toBe(true);
		expect(a.structuredContent).toMatchObject({
			aplicado: false,
			motivo: LIMIT_REASON,
			enlaces: { panel: `/admin/eventos/${SLUG}/ordenes` }
		});
		expect(a.structuredContent.mensaje).toContain(
			`https://ejemplo.test/admin/eventos/${SLUG}/ordenes`
		);
		expect((await getOrder(t.db, late.id))?.status).not.toBe('approved');
		expect(fake.mails).toEqual([]);
		expect((await listAudit(t.db)).map((e) => e.action)).not.toContain('tickets.override');
	});

	it('evento cancelado: lo avisa y no se confirma desde el conector', async () => {
		const o = await reserve({ slug: 'fiesta-cancelada' });
		const ref = orderReference(o.id);
		const p = (await preview(ref, 'fiesta-cancelada')).structuredContent;
		expect(p.avisos).toContain('El evento está cancelado.');
		const a = await apply(ref, p, 'fiesta-cancelada');
		expect(a.structuredContent).toMatchObject({ aplicado: false, motivo: LIMIT_REASON });
		expect((await getOrder(t.db, o.id))?.status).toBe('awaiting_transfer');
		expect(fake.mails).toEqual([]);
	});

	it('una orden de Mercado Pago no se confirma', async () => {
		const o = await reserve({ method: 'mercadopago' });
		const ref = orderReference(o.id);
		const p = await preview(ref);
		expect(p.isError).toBe(true);
		expect(p.content[0].text).toMatch(/no es una transferencia/);
		const a = await apply(ref, { hash: 'x'.repeat(43), version: 'pending:0' });
		expect(a.structuredContent).toMatchObject({ aplicado: false, motivo: 'no es transferencia' });
		expect((await getOrder(t.db, o.id))?.status).toBe('pending');
		expect(fake.mails).toEqual([]);
	});

	it('una transferencia rechazada no se confirma', async () => {
		const o = await reserve();
		await t.db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").bind(o.id).run();
		const a = await apply(orderReference(o.id), { hash: 'x'.repeat(43), version: 'x' });
		expect(a.structuredContent).toMatchObject({ aplicado: false, motivo: 'cancelada' });
		expect(fake.mails).toEqual([]);
	});
});

describe('la huella y la versión', () => {
	it('una huella o una versión que no son las de la vista previa no se aplican', async () => {
		const o = await reserve();
		const other = await reserve();
		const ref = orderReference(o.id);
		const p = (await preview(ref)).structuredContent;
		const badHash = await apply(ref, { ...p, hash: 'x'.repeat(43) });
		expect(badHash.structuredContent).toMatchObject({ aplicado: false, motivo: 'no coincide' });
		const badVersion = await apply(ref, { ...p, version: 'awaiting_transfer:1' });
		expect(badVersion.structuredContent).toMatchObject({ aplicado: false, motivo: 'cambió' });
		// La huella de otra orden tampoco sirve.
		const otherPreview = (await preview(orderReference(other.id))).structuredContent;
		const swapped = await apply(ref, { hash: otherPreview.hash, version: p.version });
		expect(swapped.structuredContent).toMatchObject({ aplicado: false, motivo: 'no coincide' });
		expect((await getOrder(t.db, o.id))?.status).toBe('awaiting_transfer');
		expect(fake.mails).toEqual([]);
	});
});

describe('los interruptores', () => {
	it('sin los cambios prendidos no aparece y no se puede usar', async () => {
		const o = await reserve();
		const ref = orderReference(o.id);
		const p = (await preview(ref)).structuredContent;
		await setFlags({ edit: false });
		const list = /** @type {any} */ (
			await handleMessage(
				{ jsonrpc: '2.0', id: ++n, method: 'tools/list' },
				/** @type {any} */ ({
					db: t.db,
					user: { id: admin.id, login: admin.login },
					canEdit: true
				})
			)
		).result.tools.map((/** @type {{ name: string }} */ x) => x.name);
		expect(list).not.toContain('aplicar');
		expect((await preview(ref)).isError).toBe(true);
		expect((await apply(ref, p)).isError).toBe(true);
		await setFlags({ edit: true });
		const readOnly = await call(
			'aplicar',
			{
				operacion: 'confirmar_transferencia',
				evento: SLUG,
				orden: ref,
				hash: p.hash,
				version: p.version
			},
			{ canEdit: false }
		);
		expect(readOnly.isError).toBe(true);
		expect(readOnly.content[0].text).toMatch(/solo tiene permiso de lectura/);
		expect((await getOrder(t.db, o.id))?.status).toBe('awaiting_transfer');
		expect(fake.mails).toEqual([]);
	});
});

describe('«Confirmar pago» del panel, por la misma función', () => {
	/** @param {string} orderId */
	async function panelConfirm(orderId) {
		const body = new FormData();
		body.set('order', orderId);
		return /** @type {any} */ (
			await eventTicketActions.confirm(
				/** @type {any} */ ({
					params: { slug: SLUG },
					locals: { user: { id: admin.id, login: admin.login }, user_token: 'prueba' },
					platform: t.platform,
					request: new Request('http://localhost/x', { method: 'POST', body }),
					url: new URL(`http://localhost/admin/eventos/${SLUG}/ordenes`),
					fetch: async () => new Response('{}', { status: 503 })
				})
			)
		);
	}

	it('confirma, emite, manda un mail y avisa; un segundo click no manda nada', async () => {
		const o = await reserve({ quantity: 2 });
		const ref = orderReference(o.id);
		const r = await panelConfirm(o.id);
		expect(r.transfer).toMatchObject({ ok: true });
		expect(r.transfer.message).toContain(`Pago de ${ref} confirmado`);
		expect((await getOrder(t.db, o.id))?.confirmed_by).toBe(admin.login);
		expect(await getOrderTickets(t.db, o.id)).toHaveLength(2);
		expect(fake.mails).toEqual([o.id]);
		expect(fake.notices).toEqual([o.id]);
		const again = await panelConfirm(o.id);
		expect(again.transfer.message).toMatch(/ya estaba confirmada/);
		expect(fake.mails).toEqual([o.id]);
		const audit = await listAudit(t.db);
		expect(audit.map((e) => e.action)).toEqual(['transfer.confirm']);
		expect(audit[0].summary).toBe(`Confirmó la transferencia ${ref} (2 entradas)`);
		// Y desde el conector, ya confirmada: «ya estaba».
		const a = await apply(ref, { hash: 'x'.repeat(43), version: 'x' });
		expect(a.structuredContent).toMatchObject({ aplicado: false, motivo: ALREADY_REASON });
		expect(fake.mails).toEqual([o.id]);
	});

	it('una orden de Mercado Pago tampoco se confirma desde el panel', async () => {
		const o = await reserve({ method: 'mercadopago' });
		const r = await panelConfirm(o.id);
		expect(r.status).toBe(409);
		expect(r.data.transfer.message).toBe(
			`${orderReference(o.id)} no es una compra por transferencia.`
		);
		expect(fake.mails).toEqual([]);
	});
});

describe('ventas: lo que hace falta para encontrar un comprobante', () => {
	it('cada transferencia pendiente trae referencia, monto a transferir y vencimiento', async () => {
		const o = await reserve({ quantity: 2 });
		await t.db.prepare('UPDATE orders SET extras_amount = 700 WHERE id = ?').bind(o.id).run();
		await approve((await reserve({ method: 'mercadopago' })).id);
		const r = await call('ventas', { evento: SLUG, estado: 'pendientes' });
		const ordenes = /** @type {any[]} */ (r.structuredContent.ordenes);
		expect(ordenes).toHaveLength(1);
		expect(ordenes[0]).toMatchObject({
			referencia: orderReference(o.id),
			total: o.total,
			a_transferir: o.total + 700,
			vence: new Date(o.expires_at).toISOString(),
			estado: 'espera transferencia'
		});
		expect(ordenes[0].vence_texto).toMatch(/ de .+ a las \d\d:\d\d$/);
		// Una aprobada no lo trae.
		const todas = await call('ventas', { evento: SLUG });
		const approved = todas.structuredContent.ordenes.find(
			(/** @type {any} */ x) => x.estado === 'aprobada'
		);
		expect(approved.a_transferir).toBeUndefined();
	});
});
