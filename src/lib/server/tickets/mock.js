/**
 * DEV ONLY: Mercado Pago simulado. Solo se importa desde `getGateway` detrás de `dev`, así que
 * no llega al build de producción.
 *
 * Guarda preferencias y pagos en memoria del proceso de `vite dev` (en `globalThis` para
 * sobrevivir al HMR). Las páginas /entradas/simular-pago/<orden> y /propinas/simular-pago/<id>
 * hacen de checkout de MP (las dos con `completeMockCheckout`).
 */
import { signWebhook } from './mercadopago.js';
import { tipIdFromReference } from '../propinas/index.js';

/** @typedef {ReturnType<typeof import('./mercadopago.js').checkoutProPreference>} Preference */
/** @typedef {import('./orders.js').MPPayment & { status_detail: string, date_created: string }} MockPayment */

/** @type {{ preferences: Map<string, Preference & { id: string }>, payments: Map<string, MockPayment>, nextPaymentId: number }} */
const store = /** @type {any} */ (globalThis).__kvMercadoPagoMock ?? {
	preferences: new Map(),
	payments: new Map(),
	nextPaymentId: 9000000000 + Math.floor(Math.random() * 1000000)
};
/** @type {any} */ (globalThis).__kvMercadoPagoMock = store;

/** @param {string} orderId */
export function getMockPreference(orderId) {
	return store.preferences.get(orderId) ?? null;
}

/**
 * Crea un pago simulado para una orden, con el monto de la preferencia (como MP).
 *
 * @param {string} orderId
 * @param {'approved' | 'rejected' | 'in_process'} status
 */
export function createMockPayment(orderId, status) {
	const pref = store.preferences.get(orderId);
	if (!pref) throw new Error('No hay preferencia simulada para esa orden');
	const item = pref.items[0];
	const id = String(store.nextPaymentId++);
	/** @type {MockPayment} */
	const payment = {
		id: Number(id),
		status,
		status_detail: {
			approved: 'accredited',
			rejected: 'cc_rejected_other_reason',
			in_process: 'pending_contingency'
		}[status],
		external_reference: orderId,
		transaction_amount: item.unit_price * item.quantity,
		currency_id: 'ARS',
		date_created: new Date().toISOString()
	};
	store.payments.set(id, payment);
	return payment;
}

/** @type {import('./index.js').Gateway} */
export const mockGateway = {
	mock: true,
	async createPreference(preference) {
		const id = `mock-pref-${crypto.randomUUID()}`;
		store.preferences.set(preference.external_reference, { ...preference, id });
		const origin = new URL(preference.back_urls.success).origin;
		const ref = preference.external_reference;
		// Las propinas (`propina:<id>`) tienen su propia página de checkout simulado.
		const tipId = tipIdFromReference(ref);
		const path = tipId ? `/propinas/simular-pago/${tipId}` : `/entradas/simular-pago/${ref}`;
		return { id, init_point: origin + path };
	},
	async getPayment(id) {
		const payment = store.payments.get(String(id));
		if (!payment) throw new Error(`Mercado Pago (simulado) GET /v1/payments/${id} → 404`);
		return payment;
	},
	async refundPayment(id) {
		const payment = store.payments.get(String(id));
		if (!payment) throw new Error(`Mercado Pago (simulado) POST /v1/payments/${id}/refunds → 404`);
		payment.status = 'refunded';
		payment.status_detail = 'refunded';
		return { id: `mock-refund-${id}`, status: 'approved', amount: payment.transaction_amount };
	},
	async findPaymentByOrder(orderId) {
		const all = [...store.payments.values()].filter((p) => p.external_reference === orderId);
		return all.find((p) => p.status === 'approved') ?? all.at(-1) ?? null;
	}
};

/**
 * Lo que pasa al tocar un botón del checkout simulado, igual que en MP: crea un pago, manda la
 * notificación firmada al webhook (`?data.id=…&type=payment`, `x-signature`, `x-request-id`) y
 * devuelve la back_url con los mismos parámetros que agrega MP.
 *
 * `outcome`: 'approved', 'rejected', 'pending' o 'late' (aprobado sin webhook: la página de vuelta
 * tiene que re-chequear sola).
 *
 * @param {{ reference: string, outcome: string, fetch: typeof fetch, secret: string }} input
 * @returns {Promise<string>} ruta (con query) a la que redirigir
 */
export async function completeMockCheckout({ reference, outcome, fetch: fetchFn, secret }) {
	const preference = getMockPreference(reference);
	if (!preference) throw new Error('No hay preferencia simulada para esa referencia');
	const status =
		outcome === 'approved' || outcome === 'late'
			? 'approved'
			: outcome === 'rejected'
				? 'rejected'
				: 'in_process';
	const payment = createMockPayment(reference, status);
	const dataId = String(payment.id);

	if (outcome !== 'late') {
		const requestId = crypto.randomUUID();
		const res = await fetchFn(`/api/mercadopago/webhook?data.id=${dataId}&type=payment`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-request-id': requestId,
				'x-signature': await signWebhook({ dataId, requestId, secret })
			},
			body: JSON.stringify({
				action: 'payment.created',
				api_version: 'v1',
				data: { id: dataId },
				date_created: new Date().toISOString(),
				id: Date.now(),
				live_mode: false,
				type: 'payment',
				user_id: '0'
			})
		});
		console.log(`[mp:simulado] webhook pago ${dataId} (${status}) → ${res.status}`);
	}

	const back = new URL(
		status === 'approved'
			? preference.back_urls.success
			: status === 'rejected'
				? preference.back_urls.failure
				: preference.back_urls.pending
	);
	const params = {
		collection_id: dataId,
		collection_status: status,
		payment_id: dataId,
		status,
		external_reference: reference,
		payment_type: 'credit_card',
		merchant_order_id: 'null',
		preference_id: preference.id,
		site_id: 'MLA',
		processing_mode: 'aggregator',
		merchant_account_id: 'null'
	};
	for (const [k, v] of Object.entries(params)) back.searchParams.set(k, v);
	return back.pathname + back.search;
}
