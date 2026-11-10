/**
 * DEV ONLY: PayPal simulado (`PAYPAL_MOCK=1` en `vite dev`, como `MP_MOCK`). Solo se importa desde
 * `getPaypalGateway` detrás de `dev`, así que no llega al build de producción.
 *
 * Guarda las órdenes en memoria del proceso de `vite dev` (en `globalThis`, para sobrevivir al
 * HMR). La página /paypal/simular/<orden> hace de pantalla de aprobación de PayPal: aprobar vuelve
 * a la `return_url` con `?token=<orden>` (como PayPal) y la vuelta captura; cancelar vuelve a la
 * `cancel_url`. La comisión simulada es 5,4 % + US$ 0,30 (la de PayPal para pagos del exterior).
 */

/** @type {{ orders: Map<string, any>, next: number }} */
const store = /** @type {any} */ (globalThis).__kvPaypalMock ?? { orders: new Map(), next: 1 };
/** @type {any} */ (globalThis).__kvPaypalMock = store;

/** @param {number} cents */
const value = (cents) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/** @param {string} id */
export function getMockPaypalOrder(id) {
	return store.orders.get(id) ?? null;
}

/**
 * Lo que hace la pantalla simulada: aprobar (o no) y la URL de vuelta, con `token` como PayPal.
 *
 * @param {string} id
 * @param {'approve' | 'cancel'} action
 * @returns {string} ruta (con query) a la que redirigir
 */
export function decideMockPaypalOrder(id, action) {
	const order = store.orders.get(id);
	if (!order) throw new Error('No hay una orden de PayPal simulada con ese id');
	const ctx = order._ctx;
	if (action === 'approve' && order.status === 'CREATED') order.status = 'APPROVED';
	const back = new URL(action === 'approve' ? ctx.return_url : ctx.cancel_url);
	back.searchParams.set('token', id);
	if (action === 'approve') back.searchParams.set('PayerID', 'MOCKPAYER01');
	return back.pathname + back.search;
}

/** @param {any} order */
function view(order) {
	// eslint-disable-next-line no-unused-vars
	const { _ctx, ...rest } = order;
	return structuredClone(rest);
}

/** @type {import('./gateway.js').PaypalGateway} */
export const mockPaypalGateway = {
	mock: true,
	env: 'sandbox',
	async createOrder(/** @type {any} */ body) {
		const id = `MOCK${String(store.next++).padStart(6, '0')}${crypto
			.randomUUID()
			.slice(0, 6)
			.toUpperCase()
			.replace(/[^A-Z0-9]/g, '0')}`;
		const ctx = body.payment_source.paypal.experience_context;
		const origin = new URL(ctx.return_url).origin;
		const order = {
			id,
			status: 'CREATED',
			intent: 'CAPTURE',
			purchase_units: structuredClone(body.purchase_units),
			links: [{ rel: 'payer-action', href: `${origin}/paypal/simular/${id}`, method: 'GET' }],
			_ctx: ctx
		};
		store.orders.set(id, order);
		return view(order);
	},
	async getOrder(id) {
		const order = store.orders.get(id);
		if (!order) throw new Error(`PayPal (simulado) GET /v2/checkout/orders/${id} → 404`);
		return view(order);
	},
	async captureOrder(id) {
		const order = store.orders.get(id);
		if (!order) throw new Error(`PayPal (simulado) capture ${id} → 404`);
		if (order.status === 'APPROVED') {
			const unit = order.purchase_units[0];
			const gross = Math.round(Number(unit.amount.value) * 100);
			const fee = Math.round(gross * 0.054) + 30;
			unit.payments = {
				captures: [
					{
						id: `CAP${id.slice(4)}`,
						status: 'COMPLETED',
						amount: { ...unit.amount },
						custom_id: unit.custom_id,
						seller_receivable_breakdown: {
							gross_amount: { currency_code: 'USD', value: value(gross) },
							paypal_fee: { currency_code: 'USD', value: value(fee) },
							net_amount: { currency_code: 'USD', value: value(gross - fee) }
						}
					}
				]
			};
			order.status = 'COMPLETED';
		}
		return view(order);
	},
	async getCapture(captureId) {
		for (const order of store.orders.values()) {
			const cap = order.purchase_units[0].payments?.captures?.find(
				(/** @type {any} */ c) => c.id === captureId
			);
			if (cap) {
				return {
					...structuredClone(cap),
					supplementary_data: { related_ids: { order_id: order.id } }
				};
			}
		}
		throw new Error(`PayPal (simulado) GET /v2/payments/captures/${captureId} → 404`);
	},
	async refundCapture(captureId) {
		for (const order of store.orders.values()) {
			const cap = order.purchase_units[0].payments?.captures?.find(
				(/** @type {any} */ c) => c.id === captureId
			);
			if (cap) {
				cap.status = 'REFUNDED';
				return { id: `REF${captureId.slice(3)}`, status: 'COMPLETED' };
			}
		}
		throw new Error(`PayPal (simulado) refund ${captureId} → 404`);
	},
	// Sin webhooks simulados: la vuelta captura y aplica (el webhook es el respaldo).
	async verifyWebhook() {
		return false;
	}
};
