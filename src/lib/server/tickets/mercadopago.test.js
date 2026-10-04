import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
	buildPreference,
	createPreference,
	getPayment,
	itemDetail,
	mpDate,
	signWebhook,
	signatureManifest,
	verifyWebhookSignature
} from './mercadopago.js';

const SECRET = 'secreto-de-prueba';
const NOW = Date.parse('2026-10-01T12:00:00Z');
const TS = String(NOW / 1000);

/**
 * Firma calculada de forma independiente con node:crypto, siguiendo la doc de MP.
 *
 * @param {string} manifest
 * @param {string} [secret]
 */
function nodeSign(manifest, secret = SECRET) {
	return createHmac('sha256', secret).update(manifest).digest('hex');
}

describe('verifyWebhookSignature', () => {
	const base = { requestId: 'req-abc-123', dataId: '123456789', secret: SECRET, now: NOW };

	it('acepta una firma válida con el manifiesto de la doc', async () => {
		const manifest = `id:123456789;request-id:req-abc-123;ts:${TS};`;
		expect(signatureManifest({ dataId: '123456789', requestId: 'req-abc-123', ts: TS })).toBe(
			manifest
		);
		const signature = `ts=${TS},v1=${nodeSign(manifest)}`;
		expect(await verifyWebhookSignature({ ...base, signature })).toEqual({ ok: true });
		// Con espacios después de la coma, como en algunos ejemplos.
		expect(
			await verifyWebhookSignature({ ...base, signature: signature.replace(',', ', ') })
		).toEqual({ ok: true });
	});

	it('acepta el ejemplo de la doc con ts en milisegundos', async () => {
		const tsMs = String(NOW);
		const manifest = `id:123456;request-id:bb56a2f1-6aae-46ac-982e-9dcd3581d08e;ts:${tsMs};`;
		const signature = `ts=${tsMs},v1=${nodeSign(manifest)}`;
		expect(
			await verifyWebhookSignature({
				...base,
				dataId: '123456',
				requestId: 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e',
				signature
			})
		).toEqual({ ok: true });
		// Nuestra firma simulada usa el mismo formato (ms).
		const own = await signWebhook({ dataId: '1', requestId: 'r', secret: SECRET, now: NOW });
		expect(own.startsWith(`ts=${tsMs},v1=`)).toBe(true);
	});

	it('pasa a minúsculas los data.id alfanuméricos', async () => {
		const signature = `ts=${TS},v1=${nodeSign(`id:abc123;request-id:req-abc-123;ts:${TS};`)}`;
		expect(await verifyWebhookSignature({ ...base, dataId: 'ABC123', signature })).toEqual({
			ok: true
		});
	});

	it('omite las partes que faltan del manifiesto', async () => {
		const signature = `ts=${TS},v1=${nodeSign(`id:123456789;ts:${TS};`)}`;
		expect(await verifyWebhookSignature({ ...base, requestId: null, signature })).toEqual({
			ok: true
		});
	});

	it('rechaza firmas alteradas o de otro pago', async () => {
		const good = await signWebhook({
			dataId: '123456789',
			requestId: 'req-abc-123',
			secret: SECRET,
			now: NOW
		});
		const flipped = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');
		expect(await verifyWebhookSignature({ ...base, signature: flipped })).toEqual({
			ok: false,
			reason: 'mismatch'
		});
		expect(await verifyWebhookSignature({ ...base, dataId: '999', signature: good })).toEqual({
			ok: false,
			reason: 'mismatch'
		});
		expect(await verifyWebhookSignature({ ...base, requestId: 'otro', signature: good })).toEqual({
			ok: false,
			reason: 'mismatch'
		});
		expect(await verifyWebhookSignature({ ...base, secret: 'otro', signature: good })).toEqual({
			ok: false,
			reason: 'mismatch'
		});
	});

	it('rechaza timestamps viejos o del futuro', async () => {
		const old = await signWebhook({
			dataId: '123456789',
			requestId: 'req-abc-123',
			secret: SECRET,
			now: NOW - 20 * 60000
		});
		expect(await verifyWebhookSignature({ ...base, signature: old })).toEqual({
			ok: false,
			reason: 'stale'
		});
		const future = await signWebhook({
			dataId: '123456789',
			requestId: 'req-abc-123',
			secret: SECRET,
			now: NOW + 20 * 60000
		});
		expect(await verifyWebhookSignature({ ...base, signature: future })).toEqual({
			ok: false,
			reason: 'stale'
		});
	});

	it('rechaza headers ausentes o mal formados, y sin secreto', async () => {
		const good = await signWebhook({
			dataId: '123456789',
			requestId: 'req-abc-123',
			secret: SECRET,
			now: NOW
		});
		expect(await verifyWebhookSignature({ ...base, signature: null })).toMatchObject({
			reason: 'missing'
		});
		expect(await verifyWebhookSignature({ ...base, secret: '', signature: good })).toMatchObject({
			reason: 'missing'
		});
		expect(await verifyWebhookSignature({ ...base, signature: 'v1=abc' })).toMatchObject({
			reason: 'malformed'
		});
		expect(await verifyWebhookSignature({ ...base, signature: `ts=${TS},v1=xyz` })).toMatchObject({
			reason: 'malformed'
		});
	});
});

describe('preferencia', () => {
	const order = {
		id: '11111111-2222-4333-8444-555555555555',
		ticket_type: 'general',
		quantity: 2,
		unit_price: 8000,
		buyer_email: 'prueba@example.com',
		buyer_name: 'Persona de Prueba',
		created_at: NOW,
		expires_at: NOW + 20 * 60000
	};

	it('arma items, URLs y vencimiento alineado con la reserva', () => {
		const p = buildPreference({
			order,
			eventTitle: 'Fiesta',
			typeName: 'General',
			origin: 'https://kinkyvibe.ar'
		});
		expect(p.items).toEqual([
			{
				id: 'general',
				title: 'Entrada General · Fiesta',
				quantity: 2,
				unit_price: 8000,
				currency_id: 'ARS'
			}
		]);
		expect(p.external_reference).toBe(order.id);
		// Los webhooks van a la URL firmada de Tus integraciones, no a una notification_url.
		expect(p).not.toHaveProperty('notification_url');
		expect(p.back_urls.success).toBe(`https://kinkyvibe.ar/entradas/${order.id}/estado`);
		expect(p.auto_return).toBe('approved');
		expect(p.statement_descriptor).toBe('KINKYVIBE');
		expect(p.expiration_date_to).toBe('2026-10-01T09:20:00.000-03:00');
		expect(mpDate(NOW)).toBe('2026-10-01T09:00:00.000-03:00');
	});

	it('itemDetail muestra la cantidad una sola vez', () => {
		const detail = (/** @type {Partial<typeof order>} */ o) =>
			itemDetail(
				buildPreference({
					order: { ...order, ...o },
					eventTitle: 'Fiesta',
					typeName: 'General',
					origin: 'https://kinkyvibe.ar'
				}).items[0]
			);
		// Precio × cantidad: un ítem con la cantidad.
		expect(detail({})).toBe('2 × Entrada General · Fiesta');
		expect(detail({ quantity: 1 })).toBe('Entrada General · Fiesta');
		// Con fondo, descuento o recargo, un solo ítem por el total: la cantidad ya va en el título.
		expect(detail({ total: 15307 })).toBe('2 × Entrada General · Fiesta');
		expect(detail({ quantity: 1, total: 7500 })).toBe('1 × Entrada General · Fiesta');
	});

	it('llama a la API con el token y la clave de idempotencia', async () => {
		const fetch = vi.fn(
			async () => new Response(JSON.stringify({ id: 'pref-1', init_point: 'https://mp/x' }))
		);
		const p = buildPreference({
			order,
			eventTitle: 'Fiesta',
			typeName: 'General',
			origin: 'https://kinkyvibe.ar'
		});
		const res = await createPreference({ fetch, accessToken: 'TEST-token' }, p, order.id);
		expect(res.init_point).toBe('https://mp/x');
		const [url, init] = /** @type {any} */ (fetch.mock.calls[0]);
		expect(url).toBe('https://api.mercadopago.com/checkout/preferences');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBe('Bearer TEST-token');
		expect(init.headers['X-Idempotency-Key']).toBe(order.id);
		expect(JSON.parse(init.body).external_reference).toBe(order.id);
	});

	it('getPayment valida el id y propaga errores HTTP', async () => {
		const fetch = vi.fn(async () => new Response('not found', { status: 404 }));
		await expect(getPayment({ fetch, accessToken: 't' }, '../users/me')).rejects.toThrow(
			/inválido/
		);
		await expect(getPayment({ fetch, accessToken: 't' }, '123')).rejects.toThrow(/404/);
		expect(/** @type {any} */ (fetch.mock.calls[0])[0]).toBe(
			'https://api.mercadopago.com/v1/payments/123'
		);
	});
});
