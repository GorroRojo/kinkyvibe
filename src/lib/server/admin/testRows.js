/**
 * Filas inventadas para los tests del panel (solo vitest; nunca se importa desde la app).
 * Datos obviamente falsos.
 */

let seq = 0;

/**
 * Inserta una orden que cumple los CHECK de la tabla. Devuelve el id.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {Partial<{
 *   id: string, slug: string, type: string, quantity: number, unitPrice: number,
 *   option: string, fondoAmount: number, contribution: number, surcharge: number,
 *   method: string, name: string, pronouns: string | null, email: string, dni: string | null,
 *   status: string, created: number, updated: number, expires: number,
 *   emailSentAt: number | null, needsReview: string | null
 * }>} [o]
 */
export async function insertOrder(db, o = {}) {
	seq++;
	const id = o.id ?? `${seq.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
	const quantity = o.quantity ?? 1;
	const unitPrice = o.unitPrice ?? 10000;
	const fondoAmount = o.fondoAmount ?? 0;
	const contribution = o.contribution ?? 0;
	const option = o.option ?? (fondoAmount ? 'fondo' : contribution ? 'solidaria' : 'completo');
	const subtotal = unitPrice * quantity - fondoAmount + contribution;
	const surcharge = o.surcharge ?? 0;
	const created = o.created ?? 1_000;
	await db
		.prepare(
			`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, fondo_option,
				fondo_amount, fondo_contribution, subtotal, surcharge_amount, total, payment_method,
				buyer_name, buyer_pronouns, buyer_email, buyer_dni, status, email_sent_at, needs_review,
				created_at, updated_at, expires_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19,
				?20, ?21, ?22)`
		)
		.bind(
			id,
			o.slug ?? 'evento-de-prueba',
			o.type ?? 'general',
			quantity,
			unitPrice,
			option,
			fondoAmount,
			contribution,
			subtotal,
			surcharge,
			subtotal + surcharge,
			o.method ?? 'mercadopago',
			o.name ?? 'Persona de Prueba',
			o.pronouns ?? null,
			o.email ?? 'persona@example.com',
			o.dni ?? null,
			o.status ?? 'approved',
			o.emailSentAt === undefined ? created : o.emailSentAt,
			o.needsReview ?? null,
			created,
			o.updated ?? created,
			o.expires ?? created + 20 * 60 * 1000
		)
		.run();
	return id;
}

/**
 * Inserta una entrada de una orden.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ orderId: string, slug?: string, type?: string, name?: string, code?: string,
 *   checkedInAt?: number | null }} t
 */
export async function insertTicket(db, t) {
	seq++;
	await db
		.prepare(
			`INSERT INTO tickets (id, order_id, event_slug, ticket_type, holder_name, token, code,
				checked_in_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
		)
		.bind(
			`t${seq}`,
			t.orderId,
			t.slug ?? 'evento-de-prueba',
			t.type ?? 'general',
			t.name ?? 'Entrada de Prueba',
			`token-${seq}-${Math.random().toString(36).slice(2)}`,
			t.code ?? null,
			t.checkedInAt ?? null
		)
		.run();
}
