/* global globalThis */
/**
 * DEV ONLY: Mercado Pago simulado. Solo se importa desde `getGateway` detrás de `dev`, así que
 * no llega al build de producción.
 *
 * Guarda preferencias y pagos en memoria del proceso de `vite dev` (en `globalThis` para
 * sobrevivir al HMR). La página /entradas/simular-pago/<orden> hace de checkout de MP.
 */

/** @typedef {ReturnType<typeof import('./mercadopago.js').buildPreference>} Preference */
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
		return { id, init_point: `${origin}/entradas/simular-pago/${preference.external_reference}` };
	},
	async getPayment(id) {
		const payment = store.payments.get(String(id));
		if (!payment) throw new Error(`Mercado Pago (simulado) GET /v1/payments/${id} → 404`);
		return payment;
	},
	async findPaymentByOrder(orderId) {
		const all = [...store.payments.values()].filter((p) => p.external_reference === orderId);
		return all.find((p) => p.status === 'approved') ?? all.at(-1) ?? null;
	}
};
