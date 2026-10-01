/**
 * Preventas escalonadas (tramos dentro de un tipo de entrada) y tipos encadenados (un tipo que se
 * habilita cuando otro se agota o cierra). Código puro: lo usan el servidor (para decidir el
 * precio al reservar) y el navegador (solo para mostrar).
 *
 * Tramos (`tiers` en un tipo, ver config.js): en orden, cada uno con su precio y, opcionalmente,
 * una cantidad (`quantity`: "los primeros 5") y una fecha límite (`until`: "hasta el 9/10"). El
 * tramo vigente es el PRIMERO que todavía no llegó a su cantidad ni a su fecha. Si ninguno está
 * vigente, el tipo está agotado. Un tramo sin cantidad ni fecha es "el resto" (va último).
 *
 * Cuentan las entradas aprobadas y las reservas vigentes de ese tramo (igual que el cupo): si una
 * reserva vence, su lugar vuelve a su tramo. El servidor controla el tramo en la misma sentencia
 * que reserva el cupo (`reserveOrder` en orders.js), así que dos compras simultáneas no pueden
 * pasarse de un tramo.
 *
 * Encadenados (`after` en un tipo): el tipo se puede comprar recién cuando el tipo `after` está
 * cerrado (por horario) o agotado (sin cupo o sin tramos vigentes).
 *
 * Puerta y carga a mano (`doorPrice`): no gastan lugares de los tramos pero sí cuentan para el
 * cupo; se cobra el precio en la puerta del tipo (`door_price`) si tiene uno, y si no el del
 * último tramo.
 */

/**
 * Un tramo ya leído del frontmatter. `fondo`: lo que cubre el Fondo por entrada (como en el tipo).
 *
 * @typedef {{ id: string, name: string, price: number, fondo: number,
 *   quantity: number | null, until: number | null }} Tier
 */

/**
 * Lo que ya está tomado (aprobadas + reservas vigentes): por tipo y por tramo (`tierKey`).
 *
 * @typedef {{ types: Map<string, number>, tiers: Map<string, number> }} TakenCounts
 */

/**
 * Lo mínimo de un tipo de entrada que usan estas funciones.
 *
 * @typedef {{ id: string, name: string, capacity: number | null, tiers?: Tier[] | null,
 *   after?: string | null }} TieredType
 */

/** Clave de un tramo en `TakenCounts.tiers`. @param {string} typeId @param {string} tierId */
export const tierKey = (typeId, tierId) => `${typeId}/${tierId}`;

/** @returns {TakenCounts} */
export const emptyTaken = () => ({ types: new Map(), tiers: new Map() });

/**
 * ¿Este tramo se puede vender todavía (no llegó a su cantidad ni a su fecha)?
 *
 * @param {Tier} tier
 * @param {number} taken
 * @param {number} now
 */
export function tierOpen(tier, taken, now) {
	return (
		(tier.until === null || now < tier.until) && (tier.quantity === null || taken < tier.quantity)
	);
}

/**
 * El tramo vigente de un tipo, o `null` si el tipo no tiene tramos o ya no queda ninguno.
 * `remaining`: cuántas quedan en el tramo (`null` = sin cantidad).
 *
 * @param {TieredType} type
 * @param {TakenCounts} taken
 * @param {number} now
 * @returns {{ tier: Tier, index: number, taken: number, remaining: number | null } | null}
 */
export function currentTier(type, taken, now) {
	const tiers = type.tiers ?? [];
	for (let index = 0; index < tiers.length; index++) {
		const tier = tiers[index];
		const n = taken.tiers.get(tierKey(type.id, tier.id)) ?? 0;
		if (tierOpen(tier, n, now)) {
			return {
				tier,
				index,
				taken: n,
				remaining: tier.quantity === null ? null : Math.max(0, tier.quantity - n)
			};
		}
	}
	return null;
}

/** @param {number | null} a @param {number | null} b */
const minOrNull = (a, b) => (a === null ? b : b === null ? a : Math.min(a, b));

/**
 * Cuántas se pueden vender ahora de un tipo (sin mirar si está encadenado ni su horario): lo que
 * queda del cupo y, si tiene tramos, de su tramo vigente. `null` = sin límite.
 *
 * @param {TieredType} type
 * @param {TakenCounts} taken
 * @param {number} now
 * @returns {number | null}
 */
export function stockOf(type, taken, now) {
	const byCapacity =
		type.capacity === null || type.capacity === undefined
			? null
			: Math.max(0, type.capacity - (taken.types.get(type.id) ?? 0));
	if (!type.tiers?.length) return byCapacity;
	const current = currentTier(type, taken, now);
	if (!current) return 0;
	return minOrNull(byCapacity, current.remaining);
}

/**
 * Estado de un tipo para la venta online:
 * - `closed`: cerró por horario (`isClosed`);
 * - `waiting`: está encadenado y el tipo anterior (`waitingFor`) todavía se vende;
 * - `soldout`: no queda cupo o no queda ningún tramo;
 * - `open`: se puede comprar; `remaining` (`null` = sin límite) y `tier` (el vigente, o `null`).
 *
 * @template {TieredType} T
 * @param {T[]} types todos los tipos del evento (para encontrar el anterior)
 * @param {T} type
 * @param {TakenCounts} taken
 * @param {number} now
 * @param {(t: T) => boolean} isClosed ¿cerró por horario? (`!typeOpen(config, t, now)`)
 * @returns {{ state: 'open' | 'closed' | 'waiting' | 'soldout', remaining: number | null,
 *   tier: ReturnType<typeof currentTier>, waitingFor: T | null }}
 */
export function availabilityOf(types, type, taken, now, isClosed) {
	const tier = currentTier(type, taken, now);
	if (isClosed(type)) return { state: 'closed', remaining: 0, tier, waitingFor: null };
	const prev = type.after ? types.find((t) => t.id === type.after && t.id !== type.id) : null;
	if (prev && !isClosed(prev) && stockOf(prev, taken, now) !== 0) {
		return { state: 'waiting', remaining: 0, tier, waitingFor: prev };
	}
	const remaining = stockOf(type, taken, now);
	return { state: remaining === 0 ? 'soldout' : 'open', remaining, tier, waitingFor: null };
}

/**
 * ¿Algún tramo de esta lista nunca se vendería? Un tramo sin cantidad ni fecha es "el resto": los
 * que vienen después no se alcanzan nunca. Devuelve el índice del primer tramo así que NO es el
 * último, o -1.
 *
 * @param {{ quantity: number | null, until: number | null }[]} tiers
 */
export function unreachableAfter(tiers) {
	return tiers.findIndex((t, i) => i < tiers.length - 1 && t.quantity === null && t.until === null);
}

/**
 * ¿Hay una cadena circular de `after` (A después de B, B después de A)? Devuelve el id de un tipo
 * que está en un ciclo, o `null`.
 *
 * @param {{ id: string, after?: string | null }[]} types
 */
export function chainCycle(types) {
	const byId = new Map(types.map((t) => [t.id, t]));
	for (const start of types) {
		const seen = new Set([start.id]);
		let cur = start.after ? byId.get(start.after) : undefined;
		while (cur) {
			if (seen.has(cur.id)) return start.id;
			seen.add(cur.id);
			cur = cur.after ? byId.get(cur.after) : undefined;
		}
	}
	return null;
}

/**
 * Precio y Fondo por entrada en la venta en la puerta y en la carga a mano (el monto sugerido),
 * por tipo (cada tipo puede tener el suyo):
 * - el precio en la puerta del tipo (`door`, de `door_price` en el frontmatter), si tiene;
 * - si no, el del último tramo (el precio "pleno");
 * - si el tipo no tiene tramos, su precio fijo.
 * `null` en un tipo a la gorra (el monto lo elige quien paga). El `puerta_precio` del evento es
 * solo una nota para la página: no cambia lo que se cobra.
 *
 * @param {{ price: number, fondo?: number, gorra?: unknown,
 *   door?: { price: number, fondo?: number } | null,
 *   tiers?: { price: number, fondo?: number }[] | null }} type
 * @returns {{ price: number, fondo: number, source: 'door' | 'tier' | 'type' } | null}
 */
export function doorPrice(type) {
	if (type.gorra) return null;
	if (type.door) return { price: type.door.price, fondo: type.door.fondo ?? 0, source: 'door' };
	const last = type.tiers?.length ? type.tiers[type.tiers.length - 1] : null;
	if (last) return { price: last.price, fondo: last.fondo ?? 0, source: 'tier' };
	return { price: type.price, fondo: type.fondo ?? 0, source: 'type' };
}
